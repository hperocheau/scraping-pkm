const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const config = require(path.resolve(__dirname, './src/config.js'));

// Constants
const SCRIPTS = {
    getSeries: path.resolve(config.scriptsPath, 'getSeries.js'),
    getSeriesData: path.resolve(config.scriptsPath, 'getSeriesData.js'),
    getSeriesCards: path.resolve(config.scriptsPath, 'getSeriesCards.js')
};
const WAIT_TIME = 5000;
const MAX_SAME_URLS_ATTEMPTS = 3;

// Utility functions
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ✅ Fonction pour recharger la base de données
const loadFreshDatabase = () => {
    delete require.cache[require.resolve(config.databasePath)];
    return require(config.databasePath);
};

// ✅ Fonction pour recharger le module de vérification
const loadFreshCardCheck = () => {
    delete require.cache[require.resolve(config.cardsCount)];
    return require(config.cardsCount);
};

const executeScript = async (scriptPath, params = '', options = {}) => {
    console.log(`Exécution de ${path.basename(scriptPath)}...`);
    await execSync(`node "${scriptPath}" ${params}`, {
        stdio: 'inherit',
        env: { ...process.env, ...options }
    });
};

const executeScriptWithUrls = async (scriptPath, urls) => {
    const tempFile = path.join(os.tmpdir(), 'urls-temp.json');
    fs.writeFileSync(tempFile, JSON.stringify(urls));
    
    try {
        console.log(`Exécution de ${path.basename(scriptPath)}...`);
        await execSync(`node "${scriptPath}" "${tempFile}"`, {
            stdio: 'inherit',
            env: { ...process.env }
        });
    } finally {
        try {
            fs.unlinkSync(tempFile);
        } catch (err) {
            console.warn('Impossible de supprimer le fichier temporaire:', err);
        }
    }
};

const handleUrlValidation = (validation, previousUrls, sameUrlsCount) => {
    const currentUrls = JSON.stringify(validation.urlsToUpdate);
    
    if (currentUrls === JSON.stringify(previousUrls)) {
        sameUrlsCount++;
        if (sameUrlsCount >= MAX_SAME_URLS_ATTEMPTS) {
            throw new Error('Les mêmes URLs sont traitées plusieurs fois sans succès.');
        }
    } else {
        sameUrlsCount = 0;
    }

    return {
        sameUrlsCount,
        previousUrls: validation.urlsToUpdate
    };
};

async function processCards() {
    let totalDifference;
    do {
        try {
            // ✅ Recharger les modules à chaque itération
            const { checkAndDisplayCardDifferences } = loadFreshCardCheck();
            
            // Vérifier les différences
            const result = await checkAndDisplayCardDifferences();
            totalDifference = result.totalDifference;

            console.log(`Vérification des cartes: différence totale = ${totalDifference}`);

            if (totalDifference !== 0) {
                console.log(`Il manque encore ${totalDifference} cartes. Exécution de getSeriesCards.js...`);
                await executeScript(SCRIPTS.getSeriesCards);
                
                console.log(`Attente de ${WAIT_TIME/1000} secondes pour la mise à jour...`);
                await wait(WAIT_TIME);
            }
        } catch (error) {
            console.error('Erreur lors de la vérification des cartes:', error);
            throw error;
        }
    } while (totalDifference > 5);

    console.log('Traitement des cartes terminé avec succès !');
}

async function processUrlsLoop() {
    let state = {
        validation: { isValid: false, urlsToUpdate: [] },
        previousUrls: [],
        sameUrlsCount: 0
    };
    
    for (let i = 0; i < 10; i++) {
        console.log(`\n=== Itération ${i + 1} ===`);
        
        // ✅ Recharger les modules à chaque itération
        delete require.cache[require.resolve(config.jsonControl)];
        const { checkJsonSeries } = require(config.jsonControl);
        
        // ✅ Recharger la base de données fraîche
        const database = loadFreshDatabase();
        const databaseData = database.getData();
        
        state.validation = await checkJsonSeries(databaseData);
        
        console.log('État de validation:', state.validation);
        
        if (state.validation.isValid) {
            console.log('Toutes les séries sont à jour !');
            return true;
        }

        // Vérifier si les URLs sont les mêmes que précédemment
        const currentUrlsString = JSON.stringify(state.validation.urlsToUpdate);
        const previousUrlsString = JSON.stringify(state.previousUrls);

        if (currentUrlsString === previousUrlsString) {
            state.sameUrlsCount++;
            console.log(`Mêmes URLs détectées (${state.sameUrlsCount}/${MAX_SAME_URLS_ATTEMPTS})`);
            
            if (state.sameUrlsCount >= MAX_SAME_URLS_ATTEMPTS) {
                throw new Error('Les mêmes URLs sont traitées plusieurs fois sans succès.');
            }
        } else {
            state.sameUrlsCount = 0;
            state.previousUrls = state.validation.urlsToUpdate;
        }
        
        if (state.validation.urlsToUpdate && state.validation.urlsToUpdate.length > 0) {
            console.log(`${state.validation.urlsToUpdate.length} séries à mettre à jour.`);
            console.log('URLs à traiter :', state.validation.urlsToUpdate);
            
            try {
                // Exécution de la mise à jour
                await executeScriptWithUrls(SCRIPTS.getSeriesData, state.validation.urlsToUpdate);
                
                // Attente pour laisser le temps aux données d'être mises à jour
                console.log(`Attente de ${WAIT_TIME/1000} secondes pour la mise à jour...`);
                await wait(WAIT_TIME);
                
                // ✅ Forcer une relecture complète de la base de données
                const freshDatabase = loadFreshDatabase();
                
                // Revérification après la mise à jour
                delete require.cache[require.resolve(config.jsonControl)];
                const { checkJsonSeries: freshCheck } = require(config.jsonControl);
                const freshValidation = await freshCheck(freshDatabase.getData());
                
                if (freshValidation.isValid) {
                    console.log('Validation réussie après mise à jour !');
                    return true;
                }
                
                // Mise à jour de l'état pour la prochaine itération
                state.validation = freshValidation;
            } catch (error) {
                console.error('Erreur lors de la mise à jour:', error);
                throw error;
            }
        }
    }
    
    throw new Error('Nombre maximum d\'itérations atteint sans validation réussie');
}

async function main() {
    try {
        // Initial series fetch
        console.log('📥 Récupération initiale des séries...');
        executeScript(SCRIPTS.getSeries);

        // ✅ Attendre un peu après getSeries pour que le fichier soit bien écrit
        console.log('⏳ Attente de la finalisation de l\'écriture...');
        await wait(2000);

        console.log('\n🔍 Début de la validation des séries...');
        await processUrlsLoop();

        console.log('\n✅ Toutes les séries ont été validées avec succès !');

        // Process missing cards
        console.log('\n🃏 Début du traitement des cartes manquantes...');
        await processCards();

        console.log('\n🎉 Processus terminé avec succès !');

    } catch (error) {
        console.error('❌ Erreur dans le script principal :', error);
        process.exit(1);
    }
}

main();