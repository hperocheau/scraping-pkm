const path = require('path');

class DataChecker {
  constructor(database) {
    this.database = database;
  }

  getData() {
    return this.database.getData();
  }

  findMostCommonSerie(cards) {
    const serieCount = cards.reduce((acc, card) => {
      acc[card.codeSerie] = (acc[card.codeSerie] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(serieCount)
      .reduce((a, b) => (a[1] > b[1] ? a : b))[0];
  }

  async checkUnmatchingCardsSeries() {
    try {
      const data = this.getData();
      const incorrectSeriesCardUrls = [];

      const normalizeSerie = (serie) => serie?.trim().toLowerCase() || '';

      data.forEach(element => {
        if (element.cards?.length > 0) {
          const mostCommonSerie = this.findMostCommonSerie(element.cards);
          
          element.cards.forEach(card => {
            const normalizedCardSerie = normalizeSerie(card.codeSerie);
            const normalizedCommonSerie = normalizeSerie(mostCommonSerie);
            
            if (normalizedCardSerie !== normalizedCommonSerie && card.cardUrl) {
              incorrectSeriesCardUrls.push(card.cardUrl);
            }
          });
        }
      });


      return incorrectSeriesCardUrls;

    } catch (error) {
      console.error('Erreur lors de l\'affichage des séries incorrectes:', error);
      return [];
    }
  }

  async checkDupeCards() {
    try {
      const data = this.getData();
      const allCards = [];

      data.forEach((item) => {
        if (item.cards && Array.isArray(item.cards)) {
          item.cards.forEach(card => {
            if (card.cardUrl) {
              allCards.push({
                cardUrl: card.cardUrl,
                cardName: card.cardName,
                serieName: item.localName
              });
            }
          });
        }
      });

      const urlMap = new Map();
      const duplicateUrls = [];

      allCards.forEach(card => {
        if (urlMap.has(card.cardUrl)) {
          if (!duplicateUrls.includes(card.cardUrl)) {
            duplicateUrls.push(card.cardUrl);
          }
        } else {
          urlMap.set(card.cardUrl, card);
        }
      });

      return duplicateUrls;

    } catch (error) {
      console.error('Erreur lors de la vérification des doublons:', error);
      return [];
    }
  }
}

// Export de la classe
module.exports = DataChecker;

// Exécution si lancé directement
if (require.main === module) {
  const config = require(path.resolve(__dirname, '../../src/config.js'));
  const database = require(config.databasePath);

  async function runChecks() {   
    // Créer un checker avec l'instance de database
    const checker = new DataChecker(database);
    
    try {
      const incorrectSeriesUrls = await checker.checkUnmatchingCardsSeries();
      const duplicateUrls = await checker.checkDupeCards();
      
      console.log(`\nCartes avec séries incorrectes: ${incorrectSeriesUrls.length}`);
      if (incorrectSeriesUrls.length > 0) {
        console.log('Cartes avec séries incorrectes:');
        incorrectSeriesUrls.forEach(url => console.log(`  - ${url}`));
      }
      
      console.log(`\nCartes en doublon: ${duplicateUrls.length}`);
      if (duplicateUrls.length > 0) {
        console.log('Cartes en doublon:');
        duplicateUrls.forEach(url => console.log(`  - ${url}`));
      }
    } catch (error) {
      console.error('\n❌ Erreur fatale lors de l\'analyse:', error.message);
    }
  }

  runChecks();
}