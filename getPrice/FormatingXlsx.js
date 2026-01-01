const fs = require('fs');
const xlsx = require('xlsx');
const _ = require('lodash');
const moment = require('moment');
const path = require('path');

// Importer la configuration depuis le fichier externe
const CONFIG = require('../src/configPrices');

// ✅ Fonction pour recharger la base de données
const loadFreshDatabase = (config) => {
  delete require.cache[require.resolve(config.databasePath)];
  return require(config.databasePath);
};

class ExcelProcessor {
  constructor(filePath, jsonData) {
    this.filePath = filePath;
    this.jsonData = jsonData;
    this.workbook = xlsx.readFile(filePath, { cellStyles: true }); // ✅ Ajout de cellStyles
    this.currentDate = moment().format("DD_MM_YYYY");
    this.sourceSheetName = "cartes";
    // Indexer les données pour une recherche plus rapide
    this.indexedData = this.indexCardData();
    this.logger = console;
  }

  // Indexer les données de cartes pour une recherche plus efficace
  indexCardData() {
    const seriesIndex = new Map();

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

    const normalizedCondition = String(condition).trim().toUpperCase().replace(/[-+]/g, '');
    const conditionValue = CONFIG.CONDITIONS[normalizedCondition];

    if (!conditionValue) {
      this.logger.log(`Condition non reconnue: "${condition}" (normalisée: "${normalizedCondition}")`);
      return null;
    }

    return conditionValue;
  }

  cleanConditionForDisplay(condition) {
    if (!condition) return '';
    return String(condition).trim().toUpperCase().replace(/[-+]/g, '');
  }

  processCardNumber(value) {
    return String(value || '').replace(/^0+/, '').trim();
  }

  calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

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

    const normalizedSerie = String(serie).toLowerCase().trim();
    const cardsInSerie = this.indexedData.get(normalizedSerie);

    if (!cardsInSerie) {
      this.logger.log(`Ligne ${rowNum}: ${CONFIG.ERROR_MESSAGES.NO_SERIE_MATCH} (${serie})`);
      return { cardUrl: 'error', error: CONFIG.ERROR_MESSAGES.NO_SERIE_MATCH };
    }

    if (hasNumber) {
      const exactMatch = cardsInSerie.find(card => this.isExactNumberMatch(cardNumber, card.cardNumber));
      if (exactMatch) {
        return { cardUrl: exactMatch.cardUrl, similarity: 100 };
      }
    }

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

  // ✅ Extraire les prix existants de la colonne G
  // ✅ Fonction fusionnée pour extraire données ET prix
  extractCurrentSheetData(currentSheet, extractPrices = false) {
    if (!currentSheet || !currentSheet['!ref']) {
      return extractPrices ? { data: [], prices: new Map() } : [];
    }

    const data = [];
    const prices = new Map();
    const range = xlsx.utils.decode_range(currentSheet['!ref']);
    const startRow = 2;
    const endRow = range.e.r + 1;

    for (let row = startRow; row <= endRow; row++) {
      const rowData = {};
      let hasData = false;

      // Parcourir les colonnes A-F
      for (let colIndex = 0; colIndex < 6; colIndex++) {
        const destCol = String.fromCharCode(65 + colIndex);
        const cellAddress = destCol + row;

        if (currentSheet[cellAddress]) {
          const cellValue = this.normalizeStringValue(currentSheet[cellAddress].v);
          rowData[destCol] = cellValue;
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
        
        // Si on extrait aussi les prix
        if (extractPrices) {
          const rowKey = this.createRowKey(rowData);
          const priceCell = 'G' + row;
          if (currentSheet[priceCell] && currentSheet[priceCell].v) {
            prices.set(rowKey, currentSheet[priceCell].v);
          }
        }
      } else {
        break;
      }
    }

    return extractPrices ? { data, prices } : data;
  }

  compareSheetData(sourceData, currentData) {
    if (sourceData.length !== currentData.length) {
      this.logger.log(`Différence détectée: nombre de lignes différent (source: ${sourceData.length}, actuel: ${currentData.length})`);
      return false;
    }

    return !sourceData.some((sourceRow, i) => {
      const currentRow = currentData[i];
      
      return Object.keys(CONFIG.COLUMN_MAPPING).some(destCol => {
        let sourceValue, currentValue;
        
        if (destCol === 'E') {
          sourceValue = sourceRow[destCol + '_normalized'];
          currentValue = currentRow[destCol + '_normalized'];
        } else {
          sourceValue = sourceRow[destCol];
          currentValue = currentRow[destCol];
        }
        
        if (sourceValue !== currentValue) {
          this.logger.log(`Différence détectée à la ligne ${i+2}, colonne ${destCol}`);
          return true;
        }
        
        return false;
      });
    });
  }

  // ✅ Nouvelle méthode pour copier le style d'une cellule
  copyCellStyle(sourceCell) {
    if (!sourceCell) return {};
    
    const style = {};
    
    // Copier le format de cellule
    if (sourceCell.z) style.z = sourceCell.z;
    if (sourceCell.t) style.t = sourceCell.t;
    
    // Copier l'alignement
    if (sourceCell.s) {
      style.s = JSON.parse(JSON.stringify(sourceCell.s));
    }
    
    return style;
  }

  createHeader(newSheet, sourceSheet) {
    if (!CONFIG.INCLUDE_HEADER) return;

    // Copier les en-têtes mappés
    for (const [destCol, sourceCol] of Object.entries(CONFIG.COLUMN_MAPPING)) {
      const sourceCell = sourceCol + (CONFIG.START_ROW - 1);
      if (sourceSheet[sourceCell]) {
        const headerValue = this.normalizeStringValue(sourceSheet[sourceCell].v);
        newSheet[destCol + '1'] = this.createStyledCell(headerValue, sourceSheet[sourceCell].t || 's', sourceSheet[sourceCell]);
      }
    }

    // Style de référence pour colonnes additionnelles
    const referenceCol = Object.keys(CONFIG.COLUMN_MAPPING)[0];
    const referenceCell = sourceSheet[CONFIG.COLUMN_MAPPING[referenceCol] + (CONFIG.START_ROW - 1)];
    
    for (const [col, headerText] of Object.entries(CONFIG.ADDITIONAL_HEADERS)) {
      newSheet[col + '1'] = this.createStyledCell(headerText, 's', referenceCell);
    }
  }

  // ✅ Créer une clé unique pour identifier une ligne
  createRowKey(rowData) {
    const keyParts = [];
    for (const col of ['A', 'B', 'C', 'D', 'E', 'F']) {
      const value = col === 'E' ? rowData[col + '_normalized'] : rowData[col];
      keyParts.push(String(value || '').trim());
    }
    return keyParts.join('|');
  }

  // ✅ Fonction pour créer une cellule avec valeur et style
  createStyledCell(value, type, sourceCell) {
    return {
      v: value,
      t: type,
      ...this.copyCellStyle(sourceCell)
    };
  }

  // ✅ Fonction fusionnée pour copier largeurs ET hauteurs
  copySheetDimensions(sourceSheet, newSheet) {
    if (sourceSheet['!cols']) {
      newSheet['!cols'] = JSON.parse(JSON.stringify(sourceSheet['!cols']));
    }
    if (sourceSheet['!rows']) {
      newSheet['!rows'] = JSON.parse(JSON.stringify(sourceSheet['!rows']));
    }
  }

  process() {
    try {
      const sourceSheet = this.validateSheet();
      const sourceRange = xlsx.utils.decode_range(sourceSheet['!ref']);

      const sourceData = this.extractSourceData(sourceSheet, sourceRange);

      // ✅ Extraire les prix existants AVANT de vérifier les différences
      let existingPrices = new Map();
      
      if (this.workbook.SheetNames.includes(this.currentDate)) {
        this.logger.log(`La feuille "${this.currentDate}" existe déjà. Vérification des données...`);

        const existingSheet = this.workbook.Sheets[this.currentDate];
        
        // ✅ Récupérer données et prix en un seul appel
        const { data: existingData, prices } = this.extractCurrentSheetData(existingSheet, true);
        existingPrices = prices;
        this.logger.log(`📊 ${existingPrices.size} prix récupérés de la feuille existante`);

        if (this.compareSheetData(sourceData, existingData)) {
          this.logger.log(`Aucune modification détectée. La feuille "${this.currentDate}" n'a pas été mise à jour.`);
          return;
        }

        this.logger.log(`Des modifications ont été détectées. La feuille "${this.currentDate}" sera mise à jour.`);

        const index = this.workbook.SheetNames.indexOf(this.currentDate);
        this.workbook.SheetNames.splice(index, 1);
        delete this.workbook.Sheets[this.currentDate];
      }

      const newSheet = {};
      this.workbook.Sheets[this.currentDate] = newSheet;
      xlsx.utils.book_append_sheet(this.workbook, newSheet, this.currentDate);

      this.createHeader(newSheet, sourceSheet);

      const processedRows = sourceData.reduce((acc, rowData, index) => {
        const destRow = index + 2;
        const srcRow = index + CONFIG.START_ROW;
        let hasData = false;

        // Copier les colonnes mappées avec leur style
        for (const [destCol, sourceCol] of Object.entries(CONFIG.COLUMN_MAPPING)) {
          const destCell = destCol + destRow;
          const sourceCell = sourceCol + srcRow;
          let cellValue = rowData[destCol];

          if (destCol === 'E' && cellValue !== undefined) {
            cellValue = this.cleanConditionForDisplay(cellValue);
          }

          acc[destCell] = cellValue !== undefined 
            ? this.createStyledCell(cellValue, 's', sourceSheet[sourceCell])
            : this.createStyledCell('', 's', sourceSheet[sourceCell]);
          
          if (cellValue !== undefined) hasData = true;
        }

        if (!hasData) return acc;

        const matchResult = this.findBestMatch(
          rowData['A'],
          rowData['B'],
          rowData['C'],
          destRow
        );

        // ✅ Pour la colonne F, copier le style d'une colonne de référence
        const referenceCellF = sourceSheet[CONFIG.COLUMN_MAPPING['A'] + srcRow];
        
        if (matchResult.cardUrl === 'error') {
          acc[`F${destRow}`] = this.createStyledCell('error', 's', referenceCellF);
        } else {
          const condition = this.getConditionValue(rowData['E']);
          if (!condition) {
            this.logger.log(`Ligne ${destRow}: ${CONFIG.ERROR_MESSAGES.INVALID_CONDITION} (${rowData['E'] || 'vide'})`);
            acc[`F${destRow}`] = this.createStyledCell('error', 's', referenceCellF);
          } else {
            const languageParams = this.getLanguageParams(rowData['D']);
            const finalUrl = this.buildUrlWithParams(
              matchResult.cardUrl,
              condition,
              languageParams,
              rowData['A']
            );
            acc[`F${destRow}`] = this.createStyledCell(finalUrl, 's', referenceCellF);
          }
        }

        // ✅ Restaurer le prix de la colonne G si disponible avec style
        const rowKey = this.createRowKey(rowData);
        if (existingPrices.has(rowKey)) {
          const existingPrice = existingPrices.get(rowKey);
          const priceType = typeof existingPrice === 'number' ? 'n' : 's';
          acc[`G${destRow}`] = this.createStyledCell(existingPrice, priceType, referenceCellF);
          this.logger.log(`💰 Prix restauré pour ligne ${destRow}: ${existingPrice}`);
        }

        return acc;
      }, {});

      Object.assign(newSheet, processedRows);

      const lastRow = 1 + sourceData.length;
      newSheet['!ref'] = `A1:G${lastRow}`;

      // ✅ Copier dimensions et sauvegarder avec styles
      this.copySheetDimensions(sourceSheet, newSheet);
      xlsx.writeFile(this.workbook, this.filePath, { cellStyles: true });
      this.logger.log(`✅ Modification terminée avec succès (styles et alignements copiés).`);
    } catch (error) {
      this.logger.error('❌ Erreur lors du traitement:', error.message);
      process.exit(1);
    }
  }
}

// Point d'entrée principal
(async function main() {
  try {
    const config = require(path.resolve(__dirname, '../src/config.js'));
    
    // ✅ Recharger la base de données pour avoir les données fraîches
    const database = loadFreshDatabase(config);
    const jsonData = database.getData();
    const xlsxPath = config.xlsxFile;

    const processor = new ExcelProcessor(xlsxPath, jsonData);
    processor.process();
  } catch (error) {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  }
})();