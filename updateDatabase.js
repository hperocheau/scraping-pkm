const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const config = require(path.resolve(__dirname, './src/config.js'));
const database = require(config.databasePath);
const { checkAndDisplayCardDifferences } = require(config.cardsCount);;

// Constants
//const SCRIPTS_DIR = path.join('Database', 'scripts');
const SCRIPTS = {
    getSeries: path.resolve(config.scriptsPath, 'getSeries.js'),
    getSeriesData: path.resolve(config.scriptsPath, 'getSeriesData.js'),
    getSeriesCards: path.resolve(config.scriptsPath, 'getSeriesCards.js')
};
const WAIT_TIME = 5000;
const MAX_SAME_URLS_ATTEMPTS = 3;

// Utility functions
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

async function processUrls(validation, previousState) {
    if (!validation.isValid) {
        const { sameUrlsCount, previousUrls } = handleUrlValidation(
            validation,
            previousState.previousUrls,
            previousState.sameUrlsCount
        );

        console.log(`${validation.urlsToUpdate.length} séries à mettre à jour.`);
        console.log('URLs à traiter :', validation.urlsToUpdate);

        executeScriptWithUrls(SCRIPTS.getSeriesData, validation.urlsToUpdate);
        
        console.log(`Attente de ${WAIT_TIME/1000} secondes avant la prochaine vérification...`);
        await wait(WAIT_TIME);

        return { sameUrlsCount, previousUrls };
    }
    return previousState;
}

async function processCards() {
    let totalDifference;
    do {
        try {
            // Nettoyer le cache avant chaque vérification
            delete require.cache[require.resolve(config.databasePath)];
            delete require.cache[require.resolve(config.cardsCount)];
            
            // Recharger les modules
            const database = require(config.databasePath);
            const { checkAndDisplayCardDifferences } = require(config.cardsCount);
            
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
        
        // Nettoyage du cache et vérification initiale
        delete require.cache[require.resolve(config.jsonControl)];
        const { checkJsonSeries } = require(config.jsonControl);
        
        // Récupération des données actualisées
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
                
                // Forcer une relecture complète de la base de données
                delete require.cache[require.resolve(config.databasePath)];
                const database = require(config.databasePath);
                
                // Revérification après la mise à jour
                delete require.cache[require.resolve(config.jsonControl)];
                const freshCheck = await checkJsonSeries(database.getData());
                
                if (freshCheck.isValid) {
                    console.log('Validation réussie après mise à jour !');
                    return true;
                }
                
                // Mise à jour de l'état pour la prochaine itération
                state.validation = freshCheck;
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
        //executeScript(SCRIPTS.getSeries, '', { DEBUG: 'true' });

        // URL processing loop
        let state = {
            validation: { isValid: false, urlsToUpdate: [] },
            previousUrls: [],
            sameUrlsCount: 0
        };


        await processUrlsLoop();

        console.log('Toutes les séries ont été validées avec succès !');

        // Process missing cards
        console.log('Début du traitement des cartes manquantes...');
        await processCards();

    } catch (error) {
        console.error('Erreur dans le script principal :', error);
        process.exit(1);
    }
}

main();
