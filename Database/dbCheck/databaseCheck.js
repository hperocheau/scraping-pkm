const fs = require('fs').promises;

async function getUrlsWithInsufficientCards(jsonFilePath = '../Test1.json') {
  try {
    const jsonData = await fs.readFile(jsonFilePath, 'utf-8');
    const dataArray = JSON.parse(jsonData);

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
        urlsToScrape.push({ localName, numCards: numCardsValue, cardsCount, difference });
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

async function checkAndDisplayCardDifferences(jsonFilePath = '../Test1.json') {
  const { urlsToScrape, totalNumCards, totalCardsCount, totalDifference } = 
    await getUrlsWithInsufficientCards(jsonFilePath);

  if (urlsToScrape.length > 0) {
    console.log('Séries avec différence de cartes:');
    console.table(urlsToScrape);
    console.log(`Total numCards: ${totalNumCards}, Total cardsCount: ${totalCardsCount}, Total difference: ${totalDifference}`);
  } else {
    console.log('La base de données est à jour.');
  }

  return { urlsToScrape, totalNumCards, totalCardsCount, totalDifference };
}
// Fonction main pour l'exécution directe
async function main() {
  try {
    // Récupère le chemin du fichier depuis les arguments de la ligne de commande
    const jsonFilePath = process.argv[2] || '../Test1.json';
    await checkAndDisplayCardDifferences(jsonFilePath);
  } catch (error) {
    console.error('Error running card checker:', error);
    process.exit(1);
  }
}

// Exécute main() si le fichier est appelé directement
if (require.main === module) {
  main();
}

// Exporte les fonctions pour une utilisation comme module
module.exports = {
  getUrlsWithInsufficientCards,
  checkAndDisplayCardDifferences
};
