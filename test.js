const fs = require('fs').promises;

async function getUrlsWithInsufficientCards() {
  const fileName = 'dataTEST.json';

  try {
    // Read the existing data from the file
    const rawData = await fs.readFile(fileName, 'utf-8');
    const dataArray = JSON.parse(rawData);

    // Find entries where the number of "cards" elements is smaller than the "numCards" key
    const urlsWithInsufficientCards = dataArray.filter((entry) => {
      const numCards = parseInt(entry.numCards);
      const cardsCount = entry.cards ? entry.cards.length : 0;
      return cardsCount < numCards;
    });

    // Calculate the total difference
    const totalDifference = urlsWithInsufficientCards.reduce((total, entry) => {
      const numCards = parseInt(entry.numCards);
      const cardsCount = entry.cards ? entry.cards.length : 0;
      return total + (numCards - cardsCount);
    }, 0);

    return { totalDifference };
  } catch (error) {
    console.error(`Error reading data from ${fileName}: ${error.message}`);
    return { totalDifference: 0 };
  }
}

module.exports = { getUrlsWithInsufficientCards };