const path = require('path');
const config = require(path.resolve(__dirname, '../../src/config.js'));
const database = require(config.databasePath);

/**
 * Retourne la liste des séries avec des différences entre le nombre de carte attendu (numCards) et le nombre de cartes réel.
 * @returns {Promise<{urlsToScrape: Array, totalNumCards: number, totalCardsCount: number, totalDifference: number}>}
 */
async function returnSeriesCardsToUpdate() {
  try {
    const dataArray = database.getData();
    const urlsToScrape = [];
    let totalNumCards = 0;
    let totalCardsCount = 0;
    let totalDifference = 0;

    for (const entry of dataArray) {
      const { localName, numCards, cards } = entry;
      const numCardsValue = parseInt(numCards);
      const cardsCount = cards?.length || 0;
      const difference = numCardsValue - cardsCount;

      if (difference !== 0) {
        urlsToScrape.push({ 
          url: localName, 
          numCards: numCardsValue, 
          cardsCount, 
          difference 
        });
        totalNumCards += numCardsValue;
        totalCardsCount += cardsCount;
        totalDifference += difference;
      }
    }

    return { urlsToScrape, totalNumCards, totalCardsCount, totalDifference };
  } catch (error) {
    console.error('An error occurred: ' + error);
    return { urlsToScrape: [], totalNumCards: 0, totalCardsCount: 0, totalDifference: 0 };
  }
}

// Fonction main pour l'exécution directe
async function main() {
  try {
    const { urlsToScrape, totalNumCards, totalCardsCount, totalDifference } = 
      await returnSeriesCardsToUpdate();
    
    if (urlsToScrape.length > 0) {
      console.log('Séries avec différence de cartes:');
      console.table(urlsToScrape);
      console.log(`Total numCards: ${totalNumCards}, Total cardsCount: ${totalCardsCount}, Total difference: ${totalDifference}`);
    } else {
      console.log('La base de données est à jour.');
    }
  } catch (error) {
    console.error('Error running card checker:', error);
    process.exit(1);
  }
}

// Exécute main() si le fichier est appelé directement
if (require.main === module) {
  main();
}

// Exporte la fonction pour une utilisation comme module
module.exports = {
  returnSeriesCardsToUpdate
};