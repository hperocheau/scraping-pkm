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
    this.workbook = xlsx.readFile(filePath, { cellStyles: true });
    this.currentDate = moment().format("DD_MM_YYYY");
    this.sourceSheetName = "cartes";
    
    // Indexer les données pour une recherche ultra-rapide
    this.indexedData = this.indexCardData();
    this.logger = console;
    
    // Cache pour normalisation strings uniquement
    this.normalizedStringCache = new Map();
  }

  /**
   * Indexe les cartes par série ET par numéro pour recherche O(1)
   */
  indexCardData() {
    const seriesIndex = new Map();
    const numberIndex = new Map();

    this.jsonData.forEach(cardSet => {
      cardSet.cards?.forEach(card => {
        const normalizedSerie = String(card.codeSerie || '').toLowerCase().trim();
        
        // Index par série
        if (!seriesIndex.has(normalizedSerie)) {
          seriesIndex.set(normalizedSerie, []);
        }
        seriesIndex.get(normalizedSerie).push(card);
        
        // Index par série + numéro pour recherche instantanée
        if (card.cardNumber) {
          const processedNumber = this.processCardNumber(card.cardNumber);
          const key = `${normalizedSerie}:${processedNumber}`;
          if (!numberIndex.has(key)) {
            numberIndex.set(key, card);
          }
        }
      });
    });

    console.log(`📊 Indexation: ${seriesIndex.size} séries, ${numberIndex.size} cartes numérotées`);
    return { seriesIndex, numberIndex };
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
      this.logger.log(`⚠️  Condition non reconnue: "${condition}"`);
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

  /**
   * Calcul de similarité optimisé avec cache
   */
  calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    const cacheKey = `${str1}||${str2}`;
    if (this.normalizedStringCache.has(cacheKey)) {
      return this.normalizedStringCache.get(cacheKey);
    }

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

    const result = (similarities.length / Math.max(processedStr1.length, processedStr2.length)) * 100;
    this.normalizedStringCache.set(cacheKey, result);
    
    return result;
  }

  isExactNumberMatch(cellB, cardNumber) {
    if (!cellB || !cardNumber) return false;
    const processedCellB = this.processCardNumber(String(cellB).split('/')[0]);
    const processedCardNumber = this.processCardNumber(cardNumber);
    return processedCellB === processedCardNumber;
  }

  /**
   * Recherche optimisée avec index O(1) pour les numéros
   */
  findBestMatch(cardName, cardNumber, serie, rowNum) {
    if (!cardName || !serie) {
      this.logger.log(`❌ Ligne ${rowNum}: ${CONFIG.ERROR_MESSAGES.MISSING_REQUIRED}`);
      return { cardUrl: 'error', error: CONFIG.ERROR_MESSAGES.MISSING_REQUIRED };
    }

    const hasNumber = String(cardNumber || '').trim().length > 0;
    const normalizedSerie = String(serie).toLowerCase().trim();

    // Recherche O(1) par série + numéro
    if (hasNumber) {
      const processedNumber = this.processCardNumber(String(cardNumber).split('/')[0]);
      const key = `${normalizedSerie}:${processedNumber}`;
      
      const exactMatch = this.indexedData.numberIndex.get(key);
      if (exactMatch) {
        return { cardUrl: exactMatch.cardUrl, similarity: 100 };
      }
      
      this.logger.log(`❌ Ligne ${rowNum}: ${CONFIG.ERROR_MESSAGES.NO_NUMBER_MATCH} (${cardNumber})`);
      return { cardUrl: 'error', error: CONFIG.ERROR_MESSAGES.NO_NUMBER_MATCH };
    }

    // Recherche par nom (plus lente mais nécessaire)
    const cardsInSerie = this.indexedData.seriesIndex.get(normalizedSerie);

    if (!cardsInSerie) {
      this.logger.log(`❌ Ligne ${rowNum}: ${CONFIG.ERROR_MESSAGES.NO_SERIE_MATCH} (${serie})`);
      return { cardUrl: 'error', error: CONFIG.ERROR_MESSAGES.NO_SERIE_MATCH };
    }

    let bestMatch = { cardUrl: '', similarity: 0 };

    for (const card of cardsInSerie) {
      const nameSimilarity = this.calculateStringSimilarity(cardName, card.cardName);
      if (nameSimilarity > bestMatch.similarity) {
        bestMatch = {
          cardUrl: card.cardUrl,
          similarity: nameSimilarity
        };
      }
    }

    if (bestMatch.similarity === 0 || bestMatch.similarity < CONFIG.MATCH_THRESHOLDS.NAME) {
      this.logger.log(`❌ Ligne ${rowNum}: ${CONFIG.ERROR_MESSAGES.NO_NAME_MATCH} (${cardName})`);
      return { cardUrl: 'error', error: CONFIG.ERROR_MESSAGES.NO_NAME_MATCH };
    }

    return bestMatch;
  }

  /**
   * Normalisation avec cache pour éviter les conversions répétées
   */
  normalizeStringValue(value) {
    if (typeof value !== 'string') return value;

    if (this.normalizedStringCache.has(value)) {
      return this.normalizedStringCache.get(value);
    }

    const normalized = value
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    this.normalizedStringCache.set(value, normalized);
    return normalized;
  }

  validateSheet() {
    const sheet = this.workbook.Sheets[this.sourceSheetName];
    if (!this.sourceSheetName || !sheet || !sheet['!ref']) {
      throw new Error(`La feuille ${!this.sourceSheetName ? "n'existe pas" : "est vide"} dans le fichier Excel.`);
    }
    return sheet;
  }

  /**
   * Extraction optimisée avec early break
   */
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
        break; // Early break si ligne vide
      }
    }

    return data;
  }

  /**
   * Extraction avec batch processing pour grandes feuilles
   */
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
        
        if (extractPrices) {
          const rowKey = this.createRowKey(rowData);
          const priceCell = 'G' + row;
          if (currentSheet[priceCell]?.v) {
            prices.set(rowKey, currentSheet[priceCell].v);
          }
        }
      } else {
        break; // Early break
      }
    }

    return extractPrices ? { data, prices } : data;
  }

  /**
   * Comparaison optimisée avec early return
   */
  compareSheetData(sourceData, currentData) {
    if (sourceData.length !== currentData.length) {
      this.logger.log(`📊 Différence: ${sourceData.length} vs ${currentData.length} lignes`);
      return false;
    }

    for (let i = 0; i < sourceData.length; i++) {
      const sourceRow = sourceData[i];
      const currentRow = currentData[i];
      
      for (const destCol of Object.keys(CONFIG.COLUMN_MAPPING)) {
        const sourceValue = destCol === 'E' ? sourceRow[destCol + '_normalized'] : sourceRow[destCol];
        const currentValue = destCol === 'E' ? currentRow[destCol + '_normalized'] : currentRow[destCol];
        
        if (sourceValue !== currentValue) {
          this.logger.log(`📊 Différence ligne ${i+2}, colonne ${destCol}`);
          return false;
        }
      }
    }
    
    return true;
  }

  /**
   * Copie de style avec cache (SANS stringify pour comparaison)
   */
  copyCellStyle(sourceCell) {
    if (!sourceCell) return {};
    
    const style = {};
    if (sourceCell.z) style.z = sourceCell.z;
    if (sourceCell.t) style.t = sourceCell.t;
    if (sourceCell.s) {
      style.s = JSON.parse(JSON.stringify(sourceCell.s));
    }
    
    return style;
  }

  createHeader(newSheet, sourceSheet) {
    if (!CONFIG.INCLUDE_HEADER) return;

    for (const [destCol, sourceCol] of Object.entries(CONFIG.COLUMN_MAPPING)) {
      const sourceCell = sourceCol + (CONFIG.START_ROW - 1);
      if (sourceSheet[sourceCell]) {
        const headerValue = this.normalizeStringValue(sourceSheet[sourceCell].v);
        newSheet[destCol + '1'] = this.createStyledCell(headerValue, sourceSheet[sourceCell].t || 's', sourceSheet[sourceCell]);
      }
    }

    const referenceCol = Object.keys(CONFIG.COLUMN_MAPPING)[0];
    const referenceCell = sourceSheet[CONFIG.COLUMN_MAPPING[referenceCol] + (CONFIG.START_ROW - 1)];
    
    for (const [col, headerText] of Object.entries(CONFIG.ADDITIONAL_HEADERS)) {
      newSheet[col + '1'] = this.createStyledCell(headerText, 's', referenceCell);
    }
  }

  createRowKey(rowData) {
    const keyParts = ['A', 'B', 'C', 'D', 'E', 'F'].map(col => {
      const value = col === 'E' ? rowData[col + '_normalized'] : rowData[col];
      return String(value || '').trim();
    });
    return keyParts.join('|');
  }

  createStyledCell(value, type, sourceCell) {
    return {
      v: value,
      t: type,
      ...this.copyCellStyle(sourceCell)
    };
  }

  copySheetDimensions(sourceSheet, newSheet) {
    if (sourceSheet['!cols']) {
      newSheet['!cols'] = JSON.parse(JSON.stringify(sourceSheet['!cols']));
    }
    if (sourceSheet['!rows']) {
      newSheet['!rows'] = JSON.parse(JSON.stringify(sourceSheet['!rows']));
    }
  }

  /**
   * Traitement principal optimisé
   */
  process() {
    const startTime = Date.now();
    
    try {
      console.log(`\n🚀 Traitement Excel - Feuille "${this.currentDate}"\n`);
      
      const sourceSheet = this.validateSheet();
      const sourceRange = xlsx.utils.decode_range(sourceSheet['!ref']);

      const sourceData = this.extractSourceData(sourceSheet, sourceRange);
      console.log(`📄 ${sourceData.length} lignes source extraites`);

      let existingPrices = new Map();
      
      if (this.workbook.SheetNames.includes(this.currentDate)) {
        console.log(`📋 La feuille "${this.currentDate}" existe déjà`);

        const existingSheet = this.workbook.Sheets[this.currentDate];
        const { data: existingData, prices } = this.extractCurrentSheetData(existingSheet, true);
        existingPrices = prices;
        console.log(`💰 ${existingPrices.size} prix récupérés`);

        if (this.compareSheetData(sourceData, existingData)) {
          console.log(`✅ Aucune modification - Feuille "${this.currentDate}" inchangée`);
          return;
        }

        console.log(`📝 Modifications détectées - Mise à jour de "${this.currentDate}"`);

        const index = this.workbook.SheetNames.indexOf(this.currentDate);
        this.workbook.SheetNames.splice(index, 1);
        delete this.workbook.Sheets[this.currentDate];
      }

      const newSheet = {};
      this.workbook.Sheets[this.currentDate] = newSheet;
      xlsx.utils.book_append_sheet(this.workbook, newSheet, this.currentDate);

      this.createHeader(newSheet, sourceSheet);

      // Traitement batch des lignes
      let processedCount = 0;
      let errorCount = 0;
      let restoredPrices = 0;

      const processedRows = sourceData.reduce((acc, rowData, index) => {
        const destRow = index + 2;
        const srcRow = index + CONFIG.START_ROW;
        let hasData = false;

        // Copier colonnes avec style
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

        const matchResult = this.findBestMatch(rowData['A'], rowData['B'], rowData['C'], destRow);
        const referenceCellF = sourceSheet[CONFIG.COLUMN_MAPPING['A'] + srcRow];
        
        if (matchResult.cardUrl === 'error') {
          acc[`F${destRow}`] = this.createStyledCell('error', 's', referenceCellF);
          errorCount++;
        } else {
          const condition = this.getConditionValue(rowData['E']);
          if (!condition) {
            acc[`F${destRow}`] = this.createStyledCell('error', 's', referenceCellF);
            errorCount++;
          } else {
            const languageParams = this.getLanguageParams(rowData['D']);
            const finalUrl = this.buildUrlWithParams(matchResult.cardUrl, condition, languageParams, rowData['A']);
            acc[`F${destRow}`] = this.createStyledCell(finalUrl, 's', referenceCellF);
            processedCount++;
          }
        }

        // Restaurer prix
        const rowKey = this.createRowKey(rowData);
        if (existingPrices.has(rowKey)) {
          const existingPrice = existingPrices.get(rowKey);
          const priceType = typeof existingPrice === 'number' ? 'n' : 's';
          acc[`G${destRow}`] = this.createStyledCell(existingPrice, priceType, referenceCellF);
          restoredPrices++;
        }

        return acc;
      }, {});

      Object.assign(newSheet, processedRows);

      const lastRow = 1 + sourceData.length;
      newSheet['!ref'] = `A1:G${lastRow}`;

      this.copySheetDimensions(sourceSheet, newSheet);
      xlsx.writeFile(this.workbook, this.filePath, { cellStyles: true });
      
      const executionTime = (Date.now() - startTime) / 1000;
      
      console.log(`\n${'='.repeat(60)}`);
      console.log('✅ TRAITEMENT TERMINÉ');
      console.log('='.repeat(60));
      console.log(`📊 Lignes traitées: ${processedCount}`);
      console.log(`❌ Erreurs: ${errorCount}`);
      console.log(`💰 Prix restaurés: ${restoredPrices}`);
      console.log(`⏱️  Durée: ${executionTime.toFixed(2)}s`);
      console.log('='.repeat(60));
      
    } catch (error) {
      this.logger.error('❌ Erreur lors du traitement:', error.message);
      throw error;
    }
  }
}

// Point d'entrée principal
(async function main() {
  try {
    const config = require(path.resolve(__dirname, '../src/config.js'));
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