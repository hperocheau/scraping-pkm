const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { checkAndDisplayCardDifferences } = require('./Database/dbCheck/databaseCheck.js');

// Constants
const SCRIPTS_DIR = path.join('Database', 'scripts');
const SCRIPTS = {
    getSeries: path.resolve(SCRIPTS_DIR, 'getSeries.js'),
    getSeriesData: path.resolve(SCRIPTS_DIR, 'getSeriesData.js'),
    getSeriesCards: path.resolve(SCRIPTS_DIR, 'getSeriesCards.js')
};
const WAIT_TIME = 5000;
const MAX_SAME_URLS_ATTEMPTS = 3;
const JSON_PATH = './Database/Test1.json';

// Utility functions
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const executeScript = (scriptPath, params = '', options = {}) => {
    console.log(`Exécution de ${path.basename(scriptPath)}...`);
    execSync(`node "${scriptPath}" ${params}`, {
        stdio: 'inherit',
        env: { ...process.env, ...options }
    });
};

const executeScriptWithUrls = (scriptPath, urls) => {
    const tempFile = path.join(os.tmpdir(), 'urls-temp.json');
    fs.writeFileSync(tempFile, JSON.stringify(urls));
    
    try {
        console.log(`Exécution de ${path.basename(scriptPath)}...`);
        execSync(`node "${scriptPath}" "${tempFile}"`, {
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
          const result = await checkAndDisplayCardDifferences(JSON_PATH);
          totalDifference = result.totalDifference;

          if (totalDifference > 0) {
              console.log(`Il manque encore ${totalDifference} cartes. Exécution de getSeriesCards.js...`);
              executeScript(SCRIPTS.getSeriesCards);
              await wait(WAIT_TIME);
          }
      } catch (error) {
          console.error('Erreur lors de la vérification des cartes:', error);
          throw error; // ou gérez l'erreur différemment selon vos besoins
      }
  } while (totalDifference > 5);

  console.log('Traitement des cartes terminé avec succès !');
}

async function main() {
    try {
        // Initial series fetch
        executeScript(SCRIPTS.getSeries, '', { DEBUG: 'true' });

        // URL processing loop
        let state = {
            validation: { isValid: false, urlsToUpdate: [] },
            previousUrls: [],
            sameUrlsCount: 0
        };

        do {
            try {
                const { checkJsonSeries } = require('./Database/dbCheck/testCheck.js');
                state.validation = await checkJsonSeries(JSON_PATH);
                
                const newState = await processUrls(state.validation, {
                    previousUrls: state.previousUrls,
                    sameUrlsCount: state.sameUrlsCount
                });

                state = { ...state, ...newState };
            } catch (error) {
                if (error.message.includes('Le contenu JSON doit être un tableau')) {
                    console.error('Le fichier JSON n\'a pas le bon format. Arrêt du traitement.');
                    process.exit(1);
                }
                console.error('Erreur lors de la vérification ou de l\'exécution :', error);
                await wait(WAIT_TIME);
            }
        } while (!state.validation.isValid);

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
