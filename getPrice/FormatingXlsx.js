const fs = require('fs');
const xlsx = require('xlsx');
const _ = require('lodash');
const moment = require('moment');
const path = require('path');

// Configuration constantes
const CONFIG = {
  LANGUAGES: {
    JAPANESE: {
      patterns: /jp|japonais|jap/i,
      code: '7'
    },
    FRENCH: {
      patterns: /fr|français|francais/i,
      code: '2'
    },
    ENGLISH: {
      patterns: /eng|anglais|english/i,
      code: '1'
    }
  },
  CONDITIONS: {
    'MT': '1',
    'NM': '2',
    'EX': '3',
    'GD': '4',
    'LP': '5',
    'PL': '6',
    'PO': '7'
  },
  MATCH_THRESHOLDS: {
    SERIE: 100,
    NUMBER: 100,
    NAME: 60
  },
  ERROR_MESSAGES: {
    NO_SERIE_MATCH: "Aucune correspondance trouvée pour la série",
    NO_NUMBER_MATCH: "Numéro de carte non trouvé",
    NO_NAME_MATCH: "Nom de carte non trouvé avec une similarité suffisante",
    MISSING_REQUIRED: "Données requises manquantes",
    INVALID_CONDITION: "État de carte non valide"
  },
  COLUMN_MAPPING: {
    // Format: 'colonneDestination': 'colonneSource'
    'A': 'C', 
    'B': 'E',
    'C': 'F', 
    'D': 'G', 
    'E': 'H'  
  },
  // Ligne où commence le tableau dans la feuille "Cartes" (1 pour la première ligne)
  START_ROW: 4,
  // Indique si l'entête doit être incluse
  INCLUDE_HEADER: true,
  // Colonnes additionnelles
  ADDITIONAL_HEADERS: {
    'F': "Url",
    'G': "Prix moyen"
  },
  REVERSE_PATTERNS: /(reverse|pokeball|masterball)/i,
  DEFAULT_LANGUAGE_CODE: '1' // Anglais par défaut
};

class ExcelProcessor {
  constructor(filePath, jsonData) {
    this.filePath = filePath;
    this.jsonData = jsonData;
    this.workbook = xlsx.readFile(filePath);
    this.currentDate = moment().format("DD_MM_YYYY");
    this.sourceSheetName = "Cartes";
    // Indexer les données pour une recherche plus rapide
    this.indexedData = this.indexCardData();
  }

  // Indexer les données de cartes pour une recherche plus efficace
  indexCardData() {
    const seriesIndex = new Map();
    
    for (const cardSet of this.jsonData) {
      for (const card of cardSet.cards) {
        const normalizedSerie = String(card.codeSerie).toLowerCase().trim();
        
        if (!seriesIndex.has(normalizedSerie)) {
          seriesIndex.set(normalizedSerie, []);
        }
        
        seriesIndex.get(normalizedSerie).push(card);
      }
    }
    
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
    const { LANGUAGES } = CONFIG;

    for (const lang of Object.values(LANGUAGES)) {
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
      console.log(`Condition non reconnue: "${condition}" (normalisée: "${normalizedCondition}")`);
      return null;
    }

    return conditionValue;
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
      console.log(`Ligne ${rowNum}: ${CONFIG.ERROR_MESSAGES.MISSING_REQUIRED}`);
      return { cardUrl: 'error', error: CONFIG.ERROR_MESSAGES.MISSING_REQUIRED };
    }

    const hasNumber = String(cardNumber || '').trim().length > 0;
    let bestMatch = { cardUrl: '', similarity: 0 };
    
    // Utiliser les données indexées pour une recherche plus rapide
    const normalizedSerie = String(serie).toLowerCase().trim();
    const cardsInSerie = this.indexedData.get(normalizedSerie);
    
    if (!cardsInSerie) {
      console.log(`Ligne ${rowNum}: ${CONFIG.ERROR_MESSAGES.NO_SERIE_MATCH} (${serie})`);
      return { cardUrl: 'error', error: CONFIG.ERROR_MESSAGES.NO_SERIE_MATCH };
    }

    for (const card of cardsInSerie) {
      let matchScore = 0;

      if (hasNumber) {
        if (this.isExactNumberMatch(cardNumber, card.cardNumber)) {
          matchScore = 100;
        }
      } else {
        const nameSimilarity = this.calculateStringSimilarity(cardName, card.cardName);
        if (nameSimilarity >= CONFIG.MATCH_THRESHOLDS.NAME) {
          matchScore = nameSimilarity;
        }
      }

      if (matchScore > bestMatch.similarity) {
        bestMatch = {
          cardUrl: card.cardUrl,
          similarity: matchScore
        };
      }
    }

    if (hasNumber && bestMatch.similarity === 0) {
      console.log(`Ligne ${rowNum}: ${CONFIG.ERROR_MESSAGES.NO_NUMBER_MATCH} (${cardNumber})`);
      return { cardUrl: 'error', error: CONFIG.ERROR_MESSAGES.NO_NUMBER_MATCH };
    }

    if (!hasNumber && bestMatch.similarity === 0) {
      console.log(`Ligne ${rowNum}: ${CONFIG.ERROR_MESSAGES.NO_NAME_MATCH} (${cardName})`);
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
          rowData[destCol] = cellValue;
          hasData = true;
        } else {
          rowData[destCol] = '';
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
      
      // Parcourir les colonnes A-G
      for (let colIndex = 0; colIndex <= 6; colIndex++) {
        const destCol = String.fromCharCode(65 + colIndex); // A-G
        const cellAddress = destCol + row;
        
        if (currentSheet[cellAddress]) {
          const cellValue = this.normalizeStringValue(currentSheet[cellAddress].v);
          rowData[destCol] = cellValue;
          hasData = true;
        } else {
          rowData[destCol] = '';
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
      console.log(`Différence détectée: nombre de lignes différent (source: ${sourceData.length}, actuel: ${currentData.length})`);
      return false;
    }
    
    // Comparer chaque ligne avec JSON.stringify pour une comparaison plus rapide
    for (let i = 0; i < sourceData.length; i++) {
      const sourceRow = _.pick(sourceData[i], Object.keys(CONFIG.COLUMN_MAPPING));
      const currentRow = _.pick(currentData[i], Object.keys(CONFIG.COLUMN_MAPPING));
      
      if (JSON.stringify(sourceRow) !== JSON.stringify(currentRow)) {
        console.log(`Différence détectée à la ligne ${i+2}`);
        return false;
      }
    }
    
    return true;
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
        console.log(`La feuille "${this.currentDate}" existe déjà. Vérification des données...`);
        
        const existingSheet = this.workbook.Sheets[this.currentDate];
        const existingData = this.extractCurrentSheetData(existingSheet);
        
        if (this.compareSheetData(sourceData, existingData)) {
          console.log(`Aucune modification détectée. La feuille "${this.currentDate}" n'a pas été mise à jour.`);
          return;
        }
        
        console.log(`Des modifications ont été détectées. La feuille "${this.currentDate}" sera mise à jour.`);
        
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
  
      // Copier les données
      let destRow = 2; // Après l'en-tête
      
      for (const rowData of sourceData) {
        let hasData = false;
        
        // Copier les colonnes mappées
        for (const [destCol, sourceCol] of Object.entries(CONFIG.COLUMN_MAPPING)) {
          const destCell = destCol + destRow;
          const cellValue = rowData[destCol];
          
          if (cellValue !== undefined) {
            newSheet[destCell] = { v: cellValue, t: 's' };
            hasData = true;
          } else {
            newSheet[destCell] = { v: "", t: 's' };
          }
        }
        
        if (!hasData) continue;
        
        // Trouver la meilleure correspondance
        const matchResult = this.findBestMatch(
          rowData['A'], // Nom de la carte
          rowData['B'], // Numéro de la carte
          rowData['C'], // Série
          destRow
        );
        
        if (matchResult.cardUrl === 'error') {
          newSheet[`F${destRow}`] = { v: 'error', t: 's' };
        } else {
          // Gestion de l'état de la carte
          const condition = this.getConditionValue(rowData['E']);
          if (!condition) {
            console.log(`Ligne ${destRow}: ${CONFIG.ERROR_MESSAGES.INVALID_CONDITION} (${rowData['E'] || 'vide'})`);
            newSheet[`F${destRow}`] = { v: 'error', t: 's' };
          } else {
            const languageParams = this.getLanguageParams(rowData['D']);
            const finalUrl = this.buildUrlWithParams(
              matchResult.cardUrl,
              condition,
              languageParams,
              rowData['A']
            );
            newSheet[`F${destRow}`] = { v: finalUrl, t: 's' };
          }
        }
        
        destRow++;
      }
      
      // Définir la plage de la nouvelle feuille
      newSheet['!ref'] = `A1:G${destRow - 1}`;

      // Écrire le fichier Excel modifié
      xlsx.writeFile(this.workbook, this.filePath);
      console.log(`Modification terminée avec succès.`);
    } catch (error) {
      console.error('Erreur lors du traitement:', error.message);
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