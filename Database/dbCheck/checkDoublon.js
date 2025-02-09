const fs = require('fs').promises;

class DataChecker {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async readJsonFile() {
    const rawData = await fs.readFile(this.filePath, 'utf-8');
    return JSON.parse(rawData);
  }

  findMostCommonSerie(cards) {
    const serieCount = cards.reduce((acc, card) => {
      acc[card.codeSerie] = (acc[card.codeSerie] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(serieCount)
      .reduce((a, b) => (a[1] > b[1] ? a : b))[0];
  }

  async displayIncorrectSeries() {
    try {
      const data = await this.readJsonFile();
      const incorrectCards = [];

      data.forEach(element => {
        if (element.cards?.length > 0) {
          const mostCommonSerie = this.findMostCommonSerie(element.cards);
          
          element.cards.forEach(card => {
            if (card.cardSerie !== mostCommonSerie) {
              incorrectCards.push({
                localName: element.localName,
                cardName: card.cardName,
                incorrectSerie: card.codeSerie,
                expectedSerie: mostCommonSerie
              });
            }
          });
        }
      });

      if (incorrectCards.length > 0) {
        console.log('\nCartes avec séries incorrectes:');
        incorrectCards.forEach(card => {
          console.log(`\n${card.localName}:`);
          console.log(`  - ${card.cardName}`);
          console.log(`    Série actuelle: ${card.incorrectSerie}`);
          console.log(`    Série attendue: ${card.expectedSerie}`);
        });
        console.log(`\nTotal: ${incorrectCards.length} carte(s) avec séries incorrectes`);
      } else {
        console.log('Aucune carte avec série incorrecte trouvée.');
      }
    } catch (error) {
      console.error('Erreur lors de l\'affichage des séries incorrectes:', error);
    }
  }

  findDuplicatesByTwoKeys(data, keys) {
    const seen = new Map();
    const duplicates = [];
    data.forEach(item => {
      const compositeKey = keys.map(key => item[key] || '').join('|');
      if (seen.has(compositeKey)) {
        const original = seen.get(compositeKey);
        if (!duplicates.includes(original)) duplicates.push(original);
        duplicates.push(item);
      } else {
        seen.set(compositeKey, item);
      }
    });
    return duplicates;
  }

  async checkDuplicates() {
    try {
      const data = await this.readJsonFile();
      let totalDuplicateCount = 0;

      data.forEach((item, index) => {
        if (!item.cards || !Array.isArray(item.cards)) {
          console.warn(`L'élément à l'index ${index} ne contient pas de tableau "cards".`);
          return;
        }

        const pairsToCheck = [
          ['cardUrl', 'cardNumber'],
          ['cardUrl', 'productRowId'],
          ['cardNumber', 'productRowId']
        ];

        pairsToCheck.forEach(pair => {
          const duplicates = this.findDuplicatesByTwoKeys(item.cards, pair);
          if (duplicates.length > 0) {
            console.log(`Doublons pour "${pair.join(' et ')}" dans l'élément à l'index ${index}:`, duplicates);
            const uniqueDuplicates = new Set(duplicates);
            totalDuplicateCount += uniqueDuplicates.size;
          }
        });
      });

      console.log(`\nNombre total de cartes détectées comme doublons: ${totalDuplicateCount}`);
    } catch (error) {
      console.error('Erreur lors de la vérification des doublons:', error);
    }
  }
}

// Usage
const checker = new DataChecker('../Test3.json');
async function runChecks() {
  await checker.displayIncorrectSeries();
  await checker.checkDuplicates();
}

runChecks();