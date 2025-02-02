const fs = require('fs');
const util = require('util');
const readFile = util.promisify(fs.readFile);

class JsonAnalyzer {
  constructor(filePath) {
    this.filePath = filePath;
  }

  /**
   * Lit le fichier JSON
   * @returns {Promise<Array>}
   */
  async readJson() {
    try {
      const data = await readFile(this.filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Erreur de lecture du fichier JSON: ${error.message}`);
    }
  }

  /**
   * Analyse les statistiques générales du JSON
   * @param {Array} jsonData 
   * @returns {Object}
   */
  analyzeData(jsonData) {
    const totalElements = jsonData.filter(item => item.localName).length;
    const totalCards = jsonData.reduce((sum, item) => 
      sum + (item.cards?.length || 0), 0);

    return { totalElements, totalCards };
  }

  /**
   * Compare le nombre de cartes attendu avec le nombre réel
   * @returns {Promise<Object>}
   */
  async cardsDiff() {
    try {
      const dataArray = await this.readJson();
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
      console.error("Erreur lors de l'analyse des différences:", error);
      return { urlsToScrape: [], totalNumCards: 0, totalCardsCount: 0, totalDifference: 0 };
    }
  }

  /**
   * Vérifie les doublons d'URLs et d'IDs
   * @returns {Promise<Object>}
   */
  async checkDuplicates() {
    try {
      const dataArray = await this.readJson();
      const urlMap = new Map();
      const idMap = new Map();

      dataArray.forEach(({ localName, cards }) => {
        if (!Array.isArray(cards)) return;
        
        cards.forEach(card => {
          if (card.cardUrl) {
            const urlEntries = urlMap.get(card.cardUrl) || [];
            urlEntries.push({ localName, cardUrl: card.cardUrl });
            urlMap.set(card.cardUrl, urlEntries);
          }
          
          if (card.productRowId) {
            const idEntries = idMap.get(card.productRowId) || [];
            idEntries.push({ localName, productRowId: card.productRowId });
            idMap.set(card.productRowId, idEntries);
          }
        });
      });

      const duplicateUrls = this.getDuplicates(urlMap, 'url');
      const duplicateIds = this.getDuplicates(idMap, 'id');

      return { duplicateUrls, duplicateIds };
    } catch (error) {
      console.error('Erreur lors de la vérification des doublons:', error);
      return { duplicateUrls: [], duplicateIds: [] };
    }
  }

  /**
   * Vérifie les anomalies dans les séries de cartes
   * @returns {Promise<Array>}
   */
  async checkCardSeries() {
    try {
      const jsonData = await this.readJson();
      const anomalies = [];

      jsonData.forEach(element => {
        if (!element.cards?.length) return;

        const serieCount = {};
        element.cards.forEach(card => {
          if (card.cardSerie) {
            serieCount[card.cardSerie] = (serieCount[card.cardSerie] || 0) + 1;
          }
        });

        const mostCommonSerie = Object.entries(serieCount)
          .reduce((a, b) => (a[1] > b[1] ? a : b))[0];

        const anomalyCards = element.cards.filter(card => 
          card.cardSerie && card.cardSerie !== mostCommonSerie
        );

        if (anomalyCards.length > 0) {
          anomalies.push({
            localName: element.localName,
            expectedSerie: mostCommonSerie,
            anomalies: anomalyCards.map(card => ({
              cardUrl: card.cardUrl,
              incorrectSerie: card.cardSerie
            }))
          });
        }
      });

      return anomalies;
    } catch (error) {
      console.error('Erreur lors de la vérification des séries:', error);
      return [];
    }
  }

  /**
   * Utilitaire pour extraire les doublons d'une Map
   * @private
   */
  getDuplicates(map, keyName) {
    return Array.from(map.entries())
      .filter(([_, entries]) => entries.length > 1)
      .map(([key, entries]) => ({
        [keyName]: key,
        count: entries.length,
        entries
      }));
  }
}

/**
 * Fonction principale d'exécution
 */
async function main() {
  try {
    const analyzer = new JsonAnalyzer('../Test1.json');
    
    // Analyse générale
    console.log('\n=== Statistiques générales ===');
    const jsonData = await analyzer.readJson();
    console.log(analyzer.analyzeData(jsonData));

    // Vérification des différences
    console.log('\n=== Vérification des différences de cartes ===');
    const diffResult = await analyzer.cardsDiff();
    if (diffResult.urlsToScrape.length > 0) {
      console.log('Séries avec différence de cartes:');
      console.table(diffResult.urlsToScrape);
      console.log(
        `Total numCards: ${diffResult.totalNumCards}, ` +
        `Total cardsCount: ${diffResult.totalCardsCount}, ` +
        `Total difference: ${diffResult.totalDifference}`
      );
    } else {
      console.log('La base de données est à jour.');
    }

    // Vérification des doublons
    console.log('\n=== Vérification des doublons ===');
    const { duplicateUrls, duplicateIds } = await analyzer.checkDuplicates();
    
    if (duplicateUrls.length > 0) {
      console.log('\nURLs en doublon:');
      duplicateUrls.forEach(({ url, count, entries }) => {
        console.log(`\nURL "${url}" apparaît ${count} fois :`);
        console.table(entries);
      });
    }
    
    if (duplicateIds.length > 0) {
      console.log('\nIDs en doublon:');
      duplicateIds.forEach(({ id, count, entries }) => {
        console.log(`\nID "${id}" apparaît ${count} fois :`);
        console.table(entries);
      });
    }

    // Vérification des séries
    console.log('\n=== Vérification des séries de cartes ===');
    const serieAnomalies = await analyzer.checkCardSeries();
    if (serieAnomalies.length > 0) {
      console.log("Anomalies détectées :");
      serieAnomalies.forEach(anomaly => {
        console.log(`\nDans ${anomaly.localName} :`);
        console.log(`Série attendue : ${anomaly.expectedSerie}`);
        console.log("Cartes incorrectes :");
        anomaly.anomalies.forEach(card => {
          console.log(`- URL: ${card.cardUrl}`);
          console.log(`  Série trouvée: ${card.incorrectSerie}`);
        });
      });
    }

  } catch (error) {
    console.error('Erreur lors de l\'exécution:', error);
    process.exit(1);
  }
}

// Exécution et export
if (require.main === module) {
  main();
}

module.exports = JsonAnalyzer;