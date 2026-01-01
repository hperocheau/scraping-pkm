const fs = require('fs').promises;
const path = require('path');
const config = require(path.resolve(__dirname, '../../../src/config.js'));
const db = require(config.databasePath);

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
      return await db.getData();
    } catch (error) {
      throw new Error(`Erreur de lecture des données: ${error.message}`);
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
      return new Date(0);
    }
    return new Date(parseInt(year), monthsMap[month.toLowerCase()], parseInt(day));
  } catch (error) {
    console.error(`Erreur lors du parsing de la date: ${dateStr}`, error);
    return new Date(0);
  }
}

/**
 * Retourne liste des séries à mettre à jour dans le fichier JSON et si le fichier est valide
 * @param {string} filePath - Chemin vers le fichier JSON
 * @returns {Promise<{urlsToUpdate: string[], isValid: boolean}>}
 */
async function checkJsonSeries(data) {
  try {
    const series = data;

    if (!Array.isArray(series)) {
      throw new Error('Le contenu JSON doit être un tableau');
    }

    const validation = {
      urlsToUpdate: [],
      isValid: true
    };

    const VALIDATIONS = {
      numCards: /^[0-9]{1,3}\scartes$/,
      date: /^\d{1,2}\s(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s\d{4}$/,
      lastUpdate: /^\d{2}\/\d{2}\/\d{4}$/
    };

    const REQUIRED_FIELDS = ['localName', 'url', 'urlCards', 'date', 'langues', 'bloc', 'numCards'];

    const currentDate = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(currentDate.getMonth() - 1);

    const today = new Date().toLocaleDateString('fr-FR');

    series.forEach(serie => {
      const hasAllFields = REQUIRED_FIELDS.every(field => 
        serie[field]?.toString().trim().length > 0
      );

      const serieDate = parseCardMarketDate(serie.date);
      const isSeriesDateValid = VALIDATIONS.date.test(serie.date) && serieDate.getTime() !== 0;
      const isSeriesOldEnough = serieDate < oneMonthAgo;

      const isNumCardsValid = VALIDATIONS.numCards.test(serie.numCards);

      let isLastUpdateValid = true;
      const hasLastUpdate = serie.lastUpdate !== undefined && serie.lastUpdate !== null;
      
      if (hasLastUpdate) {
        const lastUpdateIsValid = VALIDATIONS.lastUpdate.test(serie.lastUpdate);
        const lastUpdateIsToday = serie.lastUpdate === today;
        isLastUpdateValid = lastUpdateIsValid && lastUpdateIsToday;
      }

      const isSeriesValid = hasAllFields && 
                           isSeriesDateValid && 
                           isNumCardsValid && 
                           (isSeriesOldEnough || (hasLastUpdate && isLastUpdateValid));

      if (!isSeriesValid) {
        validation.isValid = false;
        validation.urlsToUpdate.push(serie.url);
      }
    });

    return validation;
  } catch (error) {
    console.error('Erreur lors de la vérification du fichier JSON:', error);
    throw error;
  }
}

/**
 * Fonction principale qui exécute toutes les analyses
 */
async function main() {
  console.log('=== Démarrage des analyses ===\n');

  try {
    const analyzer = new JsonAnalyzer();

    // 1. Exécution de cardsDiff
    console.log('🃏 Analyse des différences de cartes (cardsDiff)...');
    const diffResults = await analyzer.cardsDiff();
    
    if (diffResults.urlsToScrape.length > 0) {
      console.log('Séries avec différence de cartes:');
      console.table(diffResults.urlsToScrape);
      console.log(`Total numCards: ${diffResults.totalNumCards}, Total cardsCount: ${diffResults.totalCardsCount}, Total difference: ${diffResults.totalDifference}`);
    } else {
      console.log('✅ Aucune différence de cartes détectée !');
    }
    console.log('');

    // 2. Exécution de checkCardSeries
    console.log('🔍 Vérification des anomalies de séries (checkCardSeries)...');
    const seriesAnomalies = await analyzer.checkCardSeries();
    
    if (seriesAnomalies.length > 0) {
      console.log(`⚠️  ${seriesAnomalies.length} séries avec anomalies détectées:`);
      seriesAnomalies.forEach(anomaly => {
        console.log(`\n  📋 ${anomaly.localName} (série attendue: ${anomaly.expectedSerie})`);
        console.log(`     Anomalies: ${anomaly.anomalies.length} cartes`);
        anomaly.anomalies.forEach(card => {
          console.log(`       • ${card.cardUrl} → ${card.incorrectSerie}`);
        });
      });
    } else {
      console.log('✅ Aucune anomalie de série détectée !');
    }
    console.log('');

    // 3. Exécution de checkJsonSeries
    console.log('📊 Vérification de la validité des séries (checkJsonSeries)...');
    const data = await analyzer.readJson();
    const validation = await checkJsonSeries(data);
    
    console.log(`Fichier valide: ${validation.isValid ? '✅ OUI' : '❌ NON'}`);
    console.log(`Séries à mettre à jour: ${validation.urlsToUpdate.length}`);
    
    if (validation.urlsToUpdate.length > 0) {
      console.log('\nURLs à mettre à jour:');
      validation.urlsToUpdate.forEach((url, index) => {
        console.log(`  ${index + 1}. ${url}`);
      });
    }

    console.log('\n=== Analyses terminées ===');

  } catch (error) {
    console.error('❌ Erreur lors de l\'exécution des analyses:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  JsonAnalyzer,
  checkJsonSeries,
  parseCardMarketDate
};