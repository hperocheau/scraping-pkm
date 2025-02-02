const fs = require('fs').promises;
const path = require('path');

/**
 * Classe utilitaire pour le nettoyage des données de cartes
 */
class CardCleaner {
  /**
   * @param {string} filePath - Chemin du fichier JSON
   */
  constructor(filePath) {
    this.filePath = filePath;
  }

  /**
   * Lit le fichier JSON
   * @returns {Promise<Array>}
   */
  async readJsonFile() {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Erreur lors de la lecture/parsing du fichier: ${error.message}`);
    }
  }

  /**
   * Écrit les données dans le fichier JSON
   * @param {Array} data - Données à écrire
   */
  async writeJsonFile(data) {
    try {
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(`Erreur lors de l'écriture du fichier: ${error.message}`);
    }
  }

  /**
   * Trouve les doublons basés sur des paires de clés
   * @param {Array} data - Tableau de cartes
   * @param {Array<string>} keys - Paires de clés à vérifier
   * @returns {Set} - Ensemble des doublons
   */
  findDuplicatesByKeys(data, keys) {
    const seen = new Map();
    const duplicates = new Set();

    data.forEach(item => {
      const compositeKey = keys.map(key => item[key] || '').join('|');
      if (seen.has(compositeKey)) {
        duplicates.add(seen.get(compositeKey));
        duplicates.add(item);
      } else {
        seen.set(compositeKey, item);
      }
    });

    return duplicates;
  }

  /**
   * Supprime les doublons dans les cartes
   * @returns {Promise<void>}
   */
  async deleteDoublon() {
    try {
      const data = await this.readJsonFile();
      
      if (!Array.isArray(data)) {
        throw new Error('Le fichier JSON doit contenir un tableau à la racine');
      }

      let totalCardsDeleted = 0;
      const pairsToCheck = [
        ['cardUrl', 'cardNumber'],
        ['cardUrl', 'productRowId'],
        ['cardNumber', 'productRowId']
      ];

      // Traitement de chaque entrée
      data.forEach((item, index) => {
        if (!item.cards || !Array.isArray(item.cards)) {
          console.warn(`L'élément à l'index ${index} ne contient pas de tableau "cards" valide`);
          return;
        }

        const initialCardCount = item.cards.length;
        let allDuplicates = new Set();

        // Vérification des doublons pour chaque paire de clés
        pairsToCheck.forEach(pair => {
          const duplicates = this.findDuplicatesByKeys(item.cards, pair);
          duplicates.forEach(card => allDuplicates.add(card));
        });

        // Suppression des doublons
        item.cards = item.cards.filter(card => !allDuplicates.has(card));
        totalCardsDeleted += initialCardCount - item.cards.length;
      });

      await this.writeJsonFile(data);
      console.log(`Nombre total de cartes en double supprimées : ${totalCardsDeleted}`);
      
    } catch (error) {
      console.error('Erreur lors de la suppression des doublons:', error);
      throw error;
    }
  }

  /**
   * Supprime les cartes en surplus par rapport à numCards
   * @returns {Promise<void>}
   */
  async deleteSurplusCards() {
    try {
      const data = await this.readJsonFile();
      const cleanedLocalNames = [];

      // Traitement de chaque entrée
      data.forEach(entry => {
        const numCardsValue = parseInt(entry.numCards);
        const cardsCount = entry.cards?.length || 0;

        if (cardsCount > numCardsValue) {
          entry.cards = [];
          if (entry.localName) {
            cleanedLocalNames.push(entry.localName);
          }
        }
      });

      await this.writeJsonFile(data);
      
      if (cleanedLocalNames.length > 0) {
        console.log('LocalNames dont les cards ont été supprimés :');
        console.log(cleanedLocalNames);
      }
      console.log(`Nombre d'entrées nettoyées : ${cleanedLocalNames.length}`);

    } catch (error) {
      console.error('Erreur lors de la suppression des cartes en surplus:', error);
      throw error;
    }
  }

  /**
   * Trouve la série la plus commune dans un tableau de cartes
   * @param {Array} cards - Tableau de cartes
   * @returns {string} - La série la plus commune
   */
  findMostCommonSerie(cards) {
    const serieCount = {};
    cards.forEach(card => {
      if (card.cardSerie) {
        serieCount[card.cardSerie] = (serieCount[card.cardSerie] || 0) + 1;
      }
    });
    
    return Object.entries(serieCount)
      .reduce((a, b) => (a[1] > b[1] ? a : b), ['', 0])[0];
  }

  /**
   * Supprime les cartes avec des séries incorrectes
   * @returns {Promise<void>}
   */
  async deleteIncorrectSeries() {
    try {
      const data = await this.readJsonFile();
      const deletedCards = [];

      // Traitement de chaque entrée
      data.forEach(element => {
        if (element.cards && element.cards.length > 0) {
          const mostCommonSerie = this.findMostCommonSerie(element.cards);
          const initialLength = element.cards.length;

          // Filtrer les cartes avec la série correcte
          element.cards = element.cards.filter(card => {
            const keepCard = card.cardSerie === mostCommonSerie;
            if (!keepCard) {
              deletedCards.push({
                localName: element.localName,
                cardUrl: card.cardUrl,
                incorrectSerie: card.cardSerie,
                expectedSerie: mostCommonSerie
              });
            }
            return keepCard;
          });

          const cardsRemoved = initialLength - element.cards.length;
          if (cardsRemoved > 0) {
            console.log(`${cardsRemoved} carte(s) supprimée(s) de ${element.localName}`);
          }
        }
      });

      await this.writeJsonFile(data);

      if (deletedCards.length > 0) {
        console.log('\nDétail des cartes supprimées :');
        deletedCards.forEach(card => {
          console.log(`\nDans ${card.localName}:`);
          console.log(`- URL: ${card.cardUrl}`);
          console.log(`  Série trouvée: ${card.incorrectSerie}`);
          console.log(`  Série attendue: ${card.expectedSerie}`);
        });
      }

      console.log(`\nNombre total de cartes supprimées : ${deletedCards.length}`);

    } catch (error) {
      console.error('Erreur lors de la suppression des séries incorrectes:', error);
      throw error;
    }
  }
}

/**
 * Exemple d'utilisation
 */
// Modification de la fonction main pour inclure la nouvelle méthode
async function main() {
  try {
    const cleaner = new CardCleaner(path.join(__dirname, '../data.json'));
    
    // Suppression des doublons
    console.log('Début de la suppression des doublons...');
    await cleaner.deleteDoublon();
    
    // Suppression des cartes avec séries incorrectes
    console.log('\nDébut de la suppression des cartes avec séries incorrectes...');
    await cleaner.deleteIncorrectSeries();
    
    // Suppression des cartes en surplus
    console.log('\nDébut de la suppression des cartes en surplus...');
    await cleaner.deleteSurplusCards();
    
  } catch (error) {
    console.error('Erreur lors du nettoyage:', error);
    process.exit(1);
  }
}

// Exécution du script
if (require.main === module) {
  main();
}

// Export pour utilisation comme module
module.exports = CardCleaner;