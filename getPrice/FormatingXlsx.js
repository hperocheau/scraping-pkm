const fs = require('fs');
const xlsx = require('xlsx');
const _ = require('lodash');
const moment = require('moment');
const path = require('path');

// Importer la configuration depuis le fichier externe
const CONFIG = require('../src/configPrices');

class ExcelProcessor {
  constructor(filePath, jsonData) {
    this.filePath = filePath;
    this.jsonData = jsonData;
    this.workbook = xlsx.readFile(filePath);
    this.currentDate = moment().format("DD_MM_YYYY");
    this.sourceSheetName = "cartes";
    // Indexer les données pour une recherche plus rapide
    this.indexedData = this.indexCardData();
    this.logger = console; // Permet de remplacer facilement par un autre logger
  }

  // Indexer les données de cartes pour une recherche plus efficace
  indexCardData() {
    const seriesIndex = new Map();

    // Utiliser une approche plus fonctionnelle avec flatMap
    this.jsonData.forEach(cardSet => {
      cardSet.cards.forEach(card => {
        const normalizedSerie = String(card.codeSerie).toLowerCase().trim();
        
        if (!seriesIndex.has(normalizedSerie)) {
          seriesIndex.set(normalizedSerie, []);
        }
        
        seriesIndex.get(normalizedSerie).push(card);
      });
    });

    return seriesIndex;
  }

  buildUrlWithParams(baseUrl, condition, language, cardName) {
    const urlBase = baseUrl.split('?')[0];
    const isReverse = this.isReverseHolo(cardName) ? 'Y' : 'N';

    return `${urlBase}?isSigned=N&isPlayset=N&isAltered=N&language=${language}&minCondition=${condition}&isReverseHolo=${isReverse}`;
  }

  getLanguageParams(cellD) {
    if (!cellD) return CONFIG.DEFAULT_LANGUAGE_CODE;

    const lowercaseCellD = String(cellD).toLowerCase();
    
    // Utiliser Object.entries pour un code plus concis
    for (const [name, lang] of Object.entries(CONFIG.LANGUAGES)) {
      if (lang.patterns.test(lowercaseCellD)) {
        return lang.code;
      }
    }

    return CONFIG.DEFAULT_LANGUAGE_CODE;
  }

  isReverseHolo(cardName) {
    return CONFIG.REVERSE_PATTERNS.test(cardName);
  }

  getConditionValue(condition) {
    if (!condition) return null;

    // Normaliser la condition en retirant les symboles - et +
    const normalizedCondition = String(condition).trim().toUpperCase().replace(/[-+]/g, '');
    const conditionValue = CONFIG.CONDITIONS[normalizedCondition];

    if (!conditionValue) {
      this.logger.log(`Condition non reconnue: "${condition}" (normalisée: "${normalizedCondition}")`);
      return null;
    }

    return conditionValue;
  }

  // Nettoyer la valeur de condition pour l'affichage dans la feuille
  cleanConditionForDisplay(condition) {
    if (!condition) return '';
    return String(condition).trim().toUpperCase().replace(/[-+]/g, '');
  }

  processCardNumber(value) {
    return String(value || '').replace(/^0+/, '').trim();
  }

  calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    // Fonction pour normaliser les chaînes
    const normalizeString = (str) => {
      return String(str)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .split(' ');
    };

    const processedStr1 = normalizeString(str1);
    const processedStr2 = normalizeString(str2);
    const similarities = _.intersection(processedStr1, processedStr2);

    return (similarities.length / Math.max(processedStr1.length, processedStr2.length)) * 100;
  }

  isExactSerieMatch(cellC, codeSerie) {
    if (!cellC || !codeSerie) return false;
    return String(cellC).toLowerCase().trim() === String(codeSerie).toLowerCase().trim();
  }

  isExactNumberMatch(cellB, cardNumber) {
    if (!cellB || !cardNumber) return false;
    const processedCellB = this.processCardNumber(String(cellB).split('/')[0]);
    const processedCardNumber = this.processCardNumber(cardNumber);
    return processedCellB === processedCardNumber;
  }

  findBestMatch(cardName, cardNumber, serie, rowNum) {
    if (!cardName || !serie) {
      this.logger.log(`Ligne ${rowNum}: ${CONFIG.ERROR_MESSAGES.MISSING_REQUIRED}`);
      return { cardUrl: 'error', error: CONFIG.ERROR_MESSAGES.MISSING_REQUIRED };
    }

    const hasNumber = String(cardNumber || '').trim().length > 0;
    let bestMatch = { cardUrl: '', similarity: 0 };

    // Utiliser les données indexées pour une recherche plus rapide
    const normalizedSerie = String(serie).toLowerCase().trim();
    const cardsInSerie = this.indexedData.get(normalizedSerie);

    if (!cardsInSerie) {
      this.logger.log(`Ligne ${rowNum}: ${CONFIG.ERROR_MESSAGES.NO_SERIE_MATCH} (${serie})`);
      return { cardUrl: 'error', error: CONFIG.ERROR_MESSAGES.NO_SERIE_MATCH };
    }

    // Optimisation avec find pour arrêter dès qu'une correspondance parfaite est trouvée
    if (hasNumber) {
      const exactMatch = cardsInSerie.find(card => this.isExactNumberMatch(cardNumber, card.cardNumber));
      if (exactMatch) {
        return { cardUrl: exactMatch.cardUrl, similarity: 100 };
      }
    }

    // Sinon, recherche par similarité de nom
    for (const card of cardsInSerie) {
      if (!hasNumber) {
        const nameSimilarity = this.calculateStringSimilarity(cardName, card.cardName);
        if (nameSimilarity > bestMatch.similarity) {
          bestMatch = {
            cardUrl: card.cardUrl,
            similarity: nameSimilarity
          };
        }
      }
    }

    if (hasNumber && bestMatch.similarity === 0) {
      this.logger.log(`Ligne ${rowNum}: ${CONFIG.ERROR_MESSAGES.NO_NUMBER_MATCH} (${cardNumber})`);
      return { cardUrl: 'error', error: CONFIG.ERROR_MESSAGES.NO_NUMBER_MATCH };
    }

    if (!hasNumber && (bestMatch.similarity === 0 || bestMatch.similarity < CONFIG.MATCH_THRESHOLDS.NAME)) {
      this.logger.log(`Ligne ${rowNum}: ${CONFIG.ERROR_MESSAGES.NO_NAME_MATCH} (${cardName})`);
      return { cardUrl: 'error', error: CONFIG.ERROR_MESSAGES.NO_NAME_MATCH };
    }

    return bestMatch;
  }

  normalizeStringValue(value) {
    if (typeof value !== 'string') return value;

    // Remplacer les entités HTML
    return value
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  validateSheet() {
    const sheet = this.workbook.Sheets[this.sourceSheetName];
    if (!this.sourceSheetName || !sheet || !sheet['!ref']) {
      throw new Error(`La feuille ${!this.sourceSheetName ? "n'existe pas" : "est vide"} dans le fichier Excel.`);
    }
    return sheet;
  }

  // Extrait les données source qui seront copiées
  extractSourceData(sourceSheet, sourceRange) {
    const data = [];
    const startRow = CONFIG.START_ROW;
    const endRow = sourceRange.e.r + 1;

    for (let srcRow = startRow; srcRow <= endRow; srcRow++) {
      const rowData = {};
      let hasData = false;

      for (const [destCol, sourceCol] of Object.entries(CONFIG.COLUMN_MAPPING)) {
        const sourceCell = sourceCol + srcRow;
        if (sourceSheet[sourceCell]) {
          const cellValue = this.normalizeStringValue(sourceSheet[sourceCell].v);

          // Stocker à la fois la valeur originale et la valeur normalisée pour la colonne E (état)
          if (destCol === 'E') {
            rowData[destCol] = cellValue;
            rowData[destCol + '_normalized'] = this.cleanConditionForDisplay(cellValue);
          } else {
            rowData[destCol] = cellValue;
          }
          hasData = true;
        } else {
          rowData[destCol] = '';
          if (destCol === 'E') {
            rowData[destCol + '_normalized'] = '';
          }
        }
      }

      if (hasData) {
        data.push(rowData);
      } else {
        break;
      }
    }

    return data;
  }

  // Extrait les données de la feuille actuelle pour comparaison
  extractCurrentSheetData(currentSheet) {
    if (!currentSheet || !currentSheet['!ref']) {
      return [];
    }

    const data = [];
    const range = xlsx.utils.decode_range(currentSheet['!ref']);
    const startRow = 2; // Après l'en-tête
    const endRow = range.e.r + 1;

    for (let row = startRow; row <= endRow; row++) {
      const rowData = {};
      let hasData = false;

      // Parcourir les colonnes A-G (optimisé)
      for (let colIndex = 0; colIndex <= 6; colIndex++) {
        const destCol = String.fromCharCode(65 + colIndex); // A-G
        const cellAddress = destCol + row;

        if (currentSheet[cellAddress]) {
          const cellValue = this.normalizeStringValue(currentSheet[cellAddress].v);
          rowData[destCol] = cellValue;
          // Pour la colonne E (état), stocker également la valeur normalisée
          if (destCol === 'E') {
            rowData[destCol + '_normalized'] = this.cleanConditionForDisplay(cellValue);
          }
          hasData = true;
        } else {
          rowData[destCol] = '';
          if (destCol === 'E') {
            rowData[destCol + '_normalized'] = '';
          }
        }
      }

      if (hasData) {
        data.push(rowData);
      } else {
        break;
      }
    }

    return data;
  }

  // Compare les données entre les feuilles source et destination
  compareSheetData(sourceData, currentData) {
    if (sourceData.length !== currentData.length) {
      this.logger.log(`Différence détectée: nombre de lignes différent (source: ${sourceData.length}, actuel: ${currentData.length})`);
      return false;
    }

    // Comparer chaque ligne (optimisé avec some)
    return !sourceData.some((sourceRow, i) => {
      // Vérifie chaque colonne individuellement
      const currentRow = currentData[i];
      
      // Vérifier si une colonne diffère
      return Object.keys(CONFIG.COLUMN_MAPPING).some(destCol => {
        let sourceValue, currentValue;
        
        // Pour la colonne E (condition), utiliser les valeurs normalisées
        if (destCol === 'E') {
          sourceValue = sourceRow[destCol + '_normalized'];
          currentValue = currentRow[destCol + '_normalized'];
        } else {
          sourceValue = sourceRow[destCol];
          currentValue = currentRow[destCol];
        }
        
        // Si les valeurs sont différentes
        if (sourceValue !== currentValue) {
          this.logger.log(`Différence détectée à la ligne ${i+2}, colonne ${destCol}`);
          return true; // Arrête la recherche si une différence est trouvée
        }
        
        return false;
      });
    });
  }

  // Crée l'en-tête dans la nouvelle feuille
  createHeader(newSheet, sourceSheet) {
    if (!CONFIG.INCLUDE_HEADER) return;

    // Copier les en-têtes mappés
    for (const [destCol, sourceCol] of Object.entries(CONFIG.COLUMN_MAPPING)) {
      const sourceCell = sourceCol + (CONFIG.START_ROW - 1);
      if (sourceSheet[sourceCell]) {
        const headerValue = this.normalizeStringValue(sourceSheet[sourceCell].v);
        newSheet[destCol + '1'] = { v: headerValue, t: sourceSheet[sourceCell].t || 's' };
      }
    }

    // Ajouter les en-têtes supplémentaires
    for (const [col, headerText] of Object.entries(CONFIG.ADDITIONAL_HEADERS)) {
      newSheet[col + '1'] = { v: headerText, t: 's' };
    }
  }

  process() {
    try {
      const sourceSheet = this.validateSheet();
      const sourceRange = xlsx.utils.decode_range(sourceSheet['!ref']);

      // Extraire les données source
      const sourceData = this.extractSourceData(sourceSheet, sourceRange);

      // Vérifier si la feuille existe déjà
      if (this.workbook.SheetNames.includes(this.currentDate)) {
        this.logger.log(`La feuille "${this.currentDate}" existe déjà. Vérification des données...`);

        const existingSheet = this.workbook.Sheets[this.currentDate];
        const existingData = this.extractCurrentSheetData(existingSheet);

        if (this.compareSheetData(sourceData, existingData)) {
          this.logger.log(`Aucune modification détectée. La feuille "${this.currentDate}" n'a pas été mise à jour.`);
          return;
        }

        this.logger.log(`Des modifications ont été détectées. La feuille "${this.currentDate}" sera mise à jour.`);

        // Supprimer la feuille existante
        const index = this.workbook.SheetNames.indexOf(this.currentDate);
        this.workbook.SheetNames.splice(index, 1);
        delete this.workbook.Sheets[this.currentDate];
      }

      // Créer une nouvelle feuille
      const newSheet = {};
      this.workbook.Sheets[this.currentDate] = newSheet;
      xlsx.utils.book_append_sheet(this.workbook, newSheet, this.currentDate);

      // Créer l'en-tête
      this.createHeader(newSheet, sourceSheet);

      // Préparer le traitement des données en lot
      const processedRows = sourceData.reduce((acc, rowData, index) => {
        const destRow = index + 2; // Après l'en-tête
        let hasData = false;

        // Copier les colonnes mappées
        for (const [destCol, sourceCol] of Object.entries(CONFIG.COLUMN_MAPPING)) {
          const destCell = destCol + destRow;
          let cellValue = rowData[destCol];

          // Si c'est la colonne E (qui correspond à H dans le fichier source, qui contient l'état/condition de la carte)
          // alors nettoyer les symboles - et + avant de copier
          if (destCol === 'E' && cellValue !== undefined) {
            cellValue = this.cleanConditionForDisplay(cellValue);
          }

          if (cellValue !== undefined) {
            acc[destCell] = { v: cellValue, t: 's' };
            hasData = true;
          } else {
            acc[destCell] = { v: "", t: 's' };
          }
        }

        if (!hasData) return acc;

        // Trouver la meilleure correspondance
        const matchResult = this.findBestMatch(
          rowData['A'], // Nom de la carte
          rowData['B'], // Numéro de la carte
          rowData['C'], // Série
          destRow
        );

        if (matchResult.cardUrl === 'error') {
          acc[`F${destRow}`] = { v: 'error', t: 's' };
        } else {
          // Gestion de l'état de la carte
          const condition = this.getConditionValue(rowData['E']);
          if (!condition) {
            this.logger.log(`Ligne ${destRow}: ${CONFIG.ERROR_MESSAGES.INVALID_CONDITION} (${rowData['E'] || 'vide'})`);
            acc[`F${destRow}`] = { v: 'error', t: 's' };
          } else {
            const languageParams = this.getLanguageParams(rowData['D']);
            const finalUrl = this.buildUrlWithParams(
              matchResult.cardUrl,
              condition,
              languageParams,
              rowData['A']
            );
            acc[`F${destRow}`] = { v: finalUrl, t: 's' };
          }
        }

        return acc;
      }, {});

      // Appliquer toutes les cellules à la feuille en une seule fois
      Object.assign(newSheet, processedRows);

      // Définir la plage de la nouvelle feuille
      const lastRow = 1 + sourceData.length;
      newSheet['!ref'] = `A1:G${lastRow}`;

      // Écrire le fichier Excel modifié
      xlsx.writeFile(this.workbook, this.filePath);
      this.logger.log(`Modification terminée avec succès.`);
    } catch (error) {
      this.logger.error('Erreur lors du traitement:', error.message);
      process.exit(1);
    }
  }
}

// Point d'entrée principal
(async function main() {
  try {
    const config = require(path.resolve(__dirname, '../src/config.js'));
    const database = require(config.databasePath);
    const jsonData = database.getData();
    const xlsxPath = config.xlsxFile;

    const processor = new ExcelProcessor(xlsxPath, jsonData);
    processor.process();
  } catch (error) {
    console.error('Erreur fatale:', error);
    process.exit(1);
  }
})();