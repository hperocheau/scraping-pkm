const fs = require('fs');
const xlsx = require('xlsx');
const _ = require('lodash');
const moment = require('moment');

// Configuration constantes
const CONFIG = {
    LANGUAGES: {
        JAPANESE: {
            patterns: /jp|japonais|jap/i,
            queryParams: "?language=7"
        },
        FRENCH: {
            patterns: /fr|français|francais/i,
            queryParams: "?language=2"
        }
    },
    CONDITIONS: {
        'NM': '2',
        'EX': '3',
        'GD': '4'
    },
    MATCH_THRESHOLDS: {
        SERIE: 100,
        NUMBER: 100,
        NAME: 70
    },
    ERROR_MESSAGES: {
        NO_SERIE_MATCH: "Aucune correspondance trouvée pour la série",
        NO_NUMBER_MATCH: "Numéro de carte non trouvé",
        NO_NAME_MATCH: "Nom de carte non trouvé avec une similarité suffisante",
        MISSING_REQUIRED: "Données requises manquantes",
        INVALID_CONDITION: "État de carte non valide"
    }
};

class ExcelProcessor {
    constructor(filePath, jsonData) {
        this.filePath = filePath;
        this.jsonData = jsonData;
        this.workbook = xlsx.readFile(filePath);
        this.currentDate = moment().format("DD_MM_YYYY");
        this.sourceSheetName = "Feuil1";
    }

    buildUrlWithParams(baseUrl, condition, language) {
        const urlBase = baseUrl.split('?')[0];
        return `${urlBase}${language}&minCondition=${condition}&isSigned=N&isPlayset=N&isAltered=N`;
    }

    getLanguageParams(cellD) {
        const lowercaseCellD = String(cellD || '').toLowerCase();
        const { LANGUAGES } = CONFIG;
        
        for (const lang of Object.values(LANGUAGES)) {
            if (lang.patterns.test(lowercaseCellD)) {
                return lang.queryParams;
            }
        }
        return "?language=1"; // Défaut en anglais si aucune correspondance
    }

    getConditionValue(condition) {
        if (!condition) return null;
        
        // Normaliser la condition en supprimant les espaces et en mettant en majuscules
        const normalizedCondition = String(condition).trim().toUpperCase();
        
        // Vérifier si la condition existe dans la configuration
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
        
        const processedStr1 = String(str1).toLowerCase().split(' ');
        const processedStr2 = String(str2).toLowerCase().split(' ');
        const similarities = _.intersection(processedStr1, processedStr2);
        
        return (similarities.length / Math.max(processedStr1.length, processedStr2.length)) * 100;
    }

    isExactSerieMatch(cellC, cardSerie) {
        if (!cellC || !cardSerie) return false;
        return String(cellC).toLowerCase().trim() === String(cardSerie).toLowerCase().trim();
    }

    isExactNumberMatch(cellB, cardNumber) {
        if (!cellB || !cardNumber) return false;
        const processedCellB = this.processCardNumber(String(cellB).split('/')[0]);
        const processedCardNumber = this.processCardNumber(cardNumber);
        return processedCellB === processedCardNumber;
    }

    findBestMatch(cellA, cellB, cellC, rowNum) {
        if (!cellA || !cellC) {
            console.log(`Ligne ${rowNum}: ${CONFIG.ERROR_MESSAGES.MISSING_REQUIRED}`);
            return { cardUrl: 'error', error: CONFIG.ERROR_MESSAGES.MISSING_REQUIRED };
        }

        const cellBString = String(cellB || '');
        const hasNumber = cellBString.trim().length > 0;
        let bestMatch = { cardUrl: '', similarity: 0 };
        let serieMatchFound = false;

        for (const cardSet of this.jsonData) {
            for (const card of cardSet.cards) {
                if (!this.isExactSerieMatch(cellC, card.cardSerie)) {
                    continue;
                }
                serieMatchFound = true;

                let matchScore = 0;

                if (hasNumber) {
                    if (this.isExactNumberMatch(cellB, card.cardNumber)) {
                        matchScore = 100;
                    }
                } else {
                    const nameSimilarity = this.calculateStringSimilarity(cellA, card.cardName);
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
        }

        if (!serieMatchFound) {
            console.log(`Ligne ${rowNum}: ${CONFIG.ERROR_MESSAGES.NO_SERIE_MATCH} (${cellC})`);
            return { cardUrl: 'error', error: CONFIG.ERROR_MESSAGES.NO_SERIE_MATCH };
        }

        if (hasNumber && bestMatch.similarity === 0) {
            console.log(`Ligne ${rowNum}: ${CONFIG.ERROR_MESSAGES.NO_NUMBER_MATCH} (${cellB})`);
            return { cardUrl: 'error', error: CONFIG.ERROR_MESSAGES.NO_NUMBER_MATCH };
        }

        if (!hasNumber && bestMatch.similarity === 0) {
            console.log(`Ligne ${rowNum}: ${CONFIG.ERROR_MESSAGES.NO_NAME_MATCH} (${cellA})`);
            return { cardUrl: 'error', error: CONFIG.ERROR_MESSAGES.NO_NAME_MATCH };
        }

        return bestMatch;
    }

    getCellValue(sheet, cell) {
        if (!sheet[cell]) return '';
        const value = sheet[cell].v;
        return value === null || value === undefined ? '' : value;
    }

    validateSheet() {
        const sheet = this.workbook.Sheets[this.sourceSheetName];
        if (!this.sourceSheetName || !sheet || !sheet['!ref']) {
            throw new Error(`La feuille ${!this.sourceSheetName ? "n'existe pas" : "est vide"} dans le fichier Excel.`);
        }
        return sheet;
    }

    compareSheets(sheet1, sheet2) {
        const getCellValues = (sheet) => {
            return Object.entries(sheet)
                .filter(([ref]) => /^[A-D]\d+$/.test(ref))
                .map(([, cell]) => cell.v);
        };
        return _.isEqual(getCellValues(sheet1), getCellValues(sheet2));
    }

    process() {
        try {
            const sourceSheet = this.validateSheet();
            
            if (this.workbook.SheetNames.includes(this.currentDate)) {
                const existingSheet = this.workbook.Sheets[this.currentDate];
                if (this.compareSheets(existingSheet, sourceSheet)) {
                    console.log('Le fichier est déjà à jour.');
                    return;
                }
                const index = this.workbook.SheetNames.indexOf(this.currentDate);
                this.workbook.SheetNames.splice(index, 1);
                delete this.workbook.Sheets[this.currentDate];
            }

            const newSheet = this.workbook.Sheets[this.currentDate] = _.cloneDeep(sourceSheet);
            xlsx.utils.book_append_sheet(this.workbook, newSheet, this.currentDate);

            const range = xlsx.utils.decode_range(newSheet['!ref']);
            range.e.c = Math.max(range.e.c, 6); // Étendre jusqu'à la colonne G
            newSheet['!ref'] = xlsx.utils.encode_range(range);
            newSheet['G1'] = { v: "Prix moyen" };

            const lastRow = Object.keys(newSheet)
                .filter(key => /^A\d+$/.test(key))
                .reduce((max, key) => Math.max(max, parseInt(key.slice(1))), 0);

            let errorCount = 0;
            
            for (let row = 1; row <= lastRow; row++) {
                const cellValues = {
                    A: this.getCellValue(newSheet, `A${row}`),
                    B: this.getCellValue(newSheet, `B${row}`),
                    C: this.getCellValue(newSheet, `C${row}`),
                    D: this.getCellValue(newSheet, `D${row}`),
                    E: this.getCellValue(newSheet, `E${row}`)
                };

                const matchResult = this.findBestMatch(cellValues.A, cellValues.B, cellValues.C, row);
                
                if (matchResult.cardUrl === 'error') {
                    errorCount++;
                    newSheet[`F${row}`] = { v: 'error' };
                    continue;
                }

                // Gestion de l'état de la carte
                const condition = this.getConditionValue(cellValues.E);
                if (!condition) {
                    console.log(`Ligne ${row}: ${CONFIG.ERROR_MESSAGES.INVALID_CONDITION} (${cellValues.E || 'vide'})`);
                    newSheet[`F${row}`] = { v: 'error' };
                    errorCount++;
                    continue;
                }

                const languageParams = this.getLanguageParams(cellValues.D);
                const finalUrl = this.buildUrlWithParams(matchResult.cardUrl, condition, languageParams);
                newSheet[`F${row}`] = { v: finalUrl };
            }

            xlsx.writeFile(this.workbook, this.filePath);
            console.log(`Modification terminée avec succès. ${errorCount} erreurs trouvées.`);
        } catch (error) {
            console.error('Erreur lors du traitement:', error.message);
            process.exit(1);
        }
    }
}

// Utilisation
const jsonData = require('../Database/data.json');
const processor = new ExcelProcessor('../cartes.xlsx', jsonData);
processor.process();