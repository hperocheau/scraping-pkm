const fs = require('fs').promises;

async function getUrlsWithInsufficientCards() {
  try {
    const jsonData = await fs.readFile('../data.json', 'utf-8');
    const dataArray = JSON.parse(jsonData);

    const urlsToScrape = [];
    let totalNumCards = 0;
    let totalCardsCount = 0;
    let totalDifference = 0;

    // Iterate over each entry in data.json
    for (const entry of dataArray) {
      const { localName, numCards, cards } = entry;
      const numCardsValue = parseInt(numCards);
      const cardsCount = cards?.length || 0;
      const difference = numCardsValue - cardsCount;

      // Check if cards are missing or excess
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

//Affiche tableau avec cartes manquantes ou excédentaires
async function main() {
  const { urlsToScrape, totalNumCards, totalCardsCount, totalDifference } = await getUrlsWithInsufficientCards();

  if (urlsToScrape.length > 0) {
    console.log('Séries avec différence de cartes:');
    console.table(urlsToScrape);
    console.log(`Total numCards: ${totalNumCards}, Total cardsCount: ${totalCardsCount}, Total difference: ${totalDifference}`);
  } else {
    console.log('La base de données est à jour.');
  }
}

main();