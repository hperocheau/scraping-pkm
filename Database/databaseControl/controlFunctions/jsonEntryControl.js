const fs = require('fs').promises; // Utilisation directe de fs.promises au lieu de util.promisify
const path = require('path');

class JsonAnalyzer {
  constructor(filePath) {
    this.filePath = filePath;
  }

  /**
   * Lit et parse le fichier JSON
   * @returns {Promise<Array>}
   * @throws {Error} Si le fichier ne peut pas être lu ou parsé
   */
  async readJson() {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Erreur de lecture du fichier JSON: ${error.message}`);
    }
  }

  /**
   * Analyse les statistiques générales du JSON
   * @param {Array} jsonData 
   * @returns {{totalElements: number, totalCards: number, coverage: number}}
   */
  analyzeData(jsonData) {
    if (!Array.isArray(jsonData)) {
      throw new Error('Les données JSON doivent être un tableau');
    }

    const totalElements = jsonData.filter(item => item?.localName).length;
    const totalCards = jsonData.reduce((sum, item) => 
      sum + (Array.isArray(item?.cards) ? item.cards.length : 0), 0);
    const coverage = totalElements ? (totalCards / totalElements).toFixed(2) : 0;

    return { totalElements, totalCards, coverage };
  }

  /**
   * Compare le nombre de cartes attendu avec le nombre réel
   * @returns {Promise<{
   *   urlsToScrape: Array<{localName: string, numCards: number, cardsCount: number, difference: number}>,
   *   totalNumCards: number,
   *   totalCardsCount: number,
   *   totalDifference: number
   * }>}
   */
  async cardsDiff() {
    try {
      const dataArray = await this.readJson();
      const stats = {
        urlsToScrape: [],
        totalNumCards: 0,
        totalCardsCount: 0,
        totalDifference: 0
      };

      dataArray.forEach(({ localName, numCards, cards }) => {
        if (!localName || !numCards) return;

        const numCardsValue = parseInt(numCards);
        if (isNaN(numCardsValue)) return;

        const cardsCount = Array.isArray(cards) ? cards.length : 0;
        const difference = numCardsValue - cardsCount;

        if (difference !== 0) {
          stats.urlsToScrape.push({ localName, numCards: numCardsValue, cardsCount, difference });
          stats.totalNumCards += numCardsValue;
          stats.totalCardsCount += cardsCount;
          stats.totalDifference += difference;
        }
      });

      return stats;
    } catch (error) {
      console.error("Erreur lors de l'analyse des différences:", error);
      throw error; // Propager l'erreur au lieu de retourner un objet vide
    }
  }

  /**
   * Vérifie les doublons d'URLs et d'IDs
   * @returns {Promise<{
   *   duplicateUrls: Array<{url: string, count: number, entries: Array}>,
   *   duplicateIds: Array<{id: string, count: number, entries: Array}>
   * }>}
   */
  async checkDuplicates() {
    try {
      const dataArray = await this.readJson();
      const urlMap = new Map();
      const idMap = new Map();

      dataArray.forEach(({ localName, cards }) => {
        if (!Array.isArray(cards)) return;
        
        cards.forEach(card => {
          if (card?.cardUrl) {
            const urlEntries = urlMap.get(card.cardUrl) || [];
            urlEntries.push({ localName, cardUrl: card.cardUrl });
            urlMap.set(card.cardUrl, urlEntries);
          }
          
          if (card?.productRowId) {
            const idEntries = idMap.get(card.productRowId) || [];
            idEntries.push({ localName, productRowId: card.productRowId });
            idMap.set(card.productRowId, idEntries);
          }
        });
      });

      return {
        duplicateUrls: this.getDuplicates(urlMap, 'url'),
        duplicateIds: this.getDuplicates(idMap, 'id')
      };
    } catch (error) {
      console.error('Erreur lors de la vérification des doublons:', error);
      throw error;
    }
  }

  /**
   * Vérifie les anomalies dans les séries de cartes
   * @returns {Promise<Array<{
   *   localName: string,
   *   expectedSerie: string,
   *   anomalies: Array<{cardUrl: string, incorrectSerie: string}>
   * }>>}
   */
  async checkCardSeries() {
    try {
      const jsonData = await this.readJson();
      const anomalies = [];

      jsonData.forEach(element => {
        if (!element?.localName || !Array.isArray(element?.cards)) return;

        const serieCount = new Map();
        let maxCount = 0;
        let mostCommonSerie = null;

        // Trouver la série la plus commune
        element.cards.forEach(card => {
          if (!card?.cardSerie) return;
          
          const count = (serieCount.get(card.cardSerie) || 0) + 1;
          serieCount.set(card.cardSerie, count);
          
          if (count > maxCount) {
            maxCount = count;
            mostCommonSerie = card.cardSerie;
          }
        });

        if (!mostCommonSerie) return;

        // Identifier les anomalies
        const anomalyCards = element.cards.filter(card => 
          card?.cardSerie && card.cardSerie !== mostCommonSerie
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
      throw error;
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
 * Parse une date au format français de CardMarket
 * @param {string} dateStr - Date au format "DD mois YYYY"
 * @returns {Date}
 */
function parseCardMarketDate(dateStr) {
  const monthsMap = {
    'janvier': 0, 'février': 1, 'mars': 2, 'avril': 3, 'mai': 4, 'juin': 5,
    'juillet': 6, 'août': 7, 'septembre': 8, 'octobre': 9, 'novembre': 10, 'décembre': 11
  };

  try {
    const [day, month, year] = dateStr.split(' ');
    if (!monthsMap.hasOwnProperty(month.toLowerCase())) {
      return new Date(0); // Date invalide
    }
    return new Date(parseInt(year), monthsMap[month.toLowerCase()], parseInt(day));
  } catch (error) {
    console.error(`Erreur lors du parsing de la date: ${dateStr}`, error);
    return new Date(0); // Date invalide
  }
}

/**
 * Vérifie la validité du format des séries dans le fichier JSON
 * @param {string} filePath - Chemin vers le fichier JSON
 * @returns {Promise<{urlsToUpdate: string[], isValid: boolean}>}
 */
async function checkJsonSeries(filePath) {
  try {
    const jsonContent = await fs.readFile(filePath, 'utf8');
    const series = JSON.parse(jsonContent);

    if (!Array.isArray(series)) {
      throw new Error('Le contenu JSON doit être un tableau');
    }

    const validation = {
      urlsToUpdate: [],
      isValid: true
    };

    // Constantes pour la validation
    const VALIDATIONS = {
      numCards: /^[0-9]{1,3}\scartes$/,
      date: /^\d{1,2}\s(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s\d{4}$/
    };

    const REQUIRED_FIELDS = ['localName', 'url', 'urlCards', 'date', 'langues', 'bloc', 'numCards'];

    // Vérification de chaque série
    series.forEach(serie => {
      // Vérifier les champs requis
      const hasAllFields = REQUIRED_FIELDS.every(field => 
        serie[field]?.toString().trim().length > 0
      );

      if (!hasAllFields || !VALIDATIONS.numCards.test(serie.numCards)) {
        validation.urlsToUpdate.push(serie.url);
      }

      // Vérification complète
      const isSeriesValid = hasAllFields &&
        VALIDATIONS.date.test(serie.date) &&
        parseCardMarketDate(serie.date).getTime() !== 0 &&
        VALIDATIONS.numCards.test(serie.numCards);

      if (!isSeriesValid) {
        validation.isValid = false;
      }
    });

    return validation;
  } catch (error) {
    console.error('Erreur lors de la vérification du fichier JSON:', error);
    throw error;
  }
}

// Point d'entrée principal
async function main() {
  try {
    const filePath = path.join(__dirname, '../Test2.json');
    const analyzer = new JsonAnalyzer(filePath);
    await ConsoleReporter.report(analyzer);
  } catch (error) {
    console.error('Erreur fatale:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  JsonAnalyzer,
  checkJsonSeries,
  parseCardMarketDate // Exporter la fonction pour utilisation externe
};