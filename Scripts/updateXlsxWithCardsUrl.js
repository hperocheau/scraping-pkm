const fs = require('fs');
const xlsx = require('xlsx');
const _ = require('lodash');
const moment = require('moment');

// Fonction pour définir les valeurs de X selon la cellule D
const getXValue = (cellD) => {
    const lowercaseCellD = cellD.toLowerCase();
    if (/jp|japonais|jap/.test(lowercaseCellD)) {
        return "?language=7&minCondition=2&isSigned=N&isPlayset=N&isAltered=N";
    } else if (/fr|français|francais/.test(lowercaseCellD)) {
        return "?language=2&minCondition=2&isSigned=N&isPlayset=N&isAltered=N";
    } else {
        return "";
    }
}

const jsonData = require('../Database/data.json');
const originalFileName = '../cartes.xlsx';
const workbook = xlsx.readFile(originalFileName);
const currentDate = moment().format("DD_MM_YYYY");
const sheetName = "Feuil1";
const sheet = workbook.Sheets[sheetName];

// Fonction pour comparer les cellules des colonnes A, B, C et D entre deux feuilles
function compareSheets(sheet1, sheet2) {
    const getCellValues = (sheet) => {
        const cellValues = [];
        const range = xlsx.utils.decode_range(sheet['!ref']);
        for(let row = range.s.r; row <= range.e.r; row++) {
            for(let col = range.s.c; col <= range.e.c; col++) {
                const cellAddress = {c: col, r: row};
                const cellRef = xlsx.utils.encode_cell(cellAddress);
                if(sheet[cellRef] && ['A', 'B', 'C', 'D'].includes(cellRef[0])) {
                    cellValues.push(sheet[cellRef].v);
                }
            }
        }
        return cellValues;
    };
    const sheet1Values = getCellValues(sheet1);
    const sheet2Values = getCellValues(sheet2);
    return _.isEqual(sheet1Values, sheet2Values);
}

// Fonction pour traiter la valeur de "cardNumber"
const processCardNumber = (value) => value.replace(/^0+/, ''); // Supprimer les zéros initiaux

// Fonction de recherche de similirité entre feuille Excel et BDD json
function calculateSimilarity(str1, str2) {
    const processedStr1 = str1 !== undefined ? processCardNumber(str1).split(' ') : [];
    const processedStr2 = str2 !== undefined ? processCardNumber(str2).split(' ') : [];
    const similarities = _.intersection(processedStr1, processedStr2);
    const percentage = (similarities.length / Math.max(processedStr1.length, processedStr2.length)) * 100;
    return percentage;
}

//Vérifie que Feuil1 existe et non vide
if (!sheetName || !sheet || !sheet['!ref']) {
    console.error(`La feuille ${!sheetName ? "n'existe pas" : "est vide"} dans le fichier Excel.`);
    process.exit(1);
}

//Si feuille de sortie existe déjà et que les cellules A,B,C et D sont identiques = fichier à jour. Sinon, supprimer la feuille
if (workbook.SheetNames.includes(currentDate)) {
    const existingSheet = workbook.Sheets[currentDate];
    // Comparer les cellules A, B, C et D des 2 feuilles
    if (compareSheets(existingSheet, sheet)) {
        console.log('Le fichier est déjà à jour.');
        process.exit(0);
    } else {
        // Si elle existe mais cellules différentes, la supprimer
        const currentDateSheetIndex = workbook.SheetNames.indexOf(currentDate);
        if (currentDateSheetIndex >= 0) {
            workbook.SheetNames.splice(currentDateSheetIndex, 1);
            delete workbook.Sheets[currentDate];
        }
    }
}

// Fonction pour trouver la meilleure correspondance dans le JSON
function findBestMatch(cellA, cellB, cellC) {
    const bestMatch = jsonData.reduce((best, cardSet) => {
        const cardMatch = cardSet.cards.reduce((bestCard, card) => {
            // Traitement pour cardNumber
            const processedCardNumber = processCardNumber(card.cardNumber);
            const numberSimilarity = calculateSimilarity(cellB, processedCardNumber);
            const nameSimilarity = calculateSimilarity(cellA, card.cardName);

            // Vérification que cellC est une chaîne de caractères avant d'appliquer toLowerCase()
            const serieSimilarity = typeof cellC === 'string' && typeof card.cardSerie === 'string' 
                ? cellC.toLowerCase() === card.cardSerie.toLowerCase() 
                    ? 100 
                    : 0 
                : 0;
            const totalSimilarity = (numberSimilarity + nameSimilarity + serieSimilarity) / 3;
            return totalSimilarity > bestCard.similarity ? { cardUrl: card.cardUrl, similarity: totalSimilarity } : bestCard;
        }, { cardUrl: '', similarity: 0 });
        return cardMatch.similarity > best.similarity ? cardMatch : best;
    }, { cardUrl: '', similarity: 0 });
    return bestMatch.similarity > 0 ? 'https://www.cardmarket.com' + bestMatch.cardUrl : '';
}

// Fonction pour cloner correctement une feuille
function cloneSheet(sheet) {
    const newSheet = {};
    Object.keys(sheet).forEach(key => {
        if (key !== '!merges') {
            newSheet[key] = Object.assign({}, sheet[key]);
        }
    });
    return newSheet;
    console.log('Nouvelle feuille créée.');
}

// Charger le fichier Excel
const newSheet = workbook.Sheets[currentDate] = cloneSheet(sheet);

// Ajouter la nouvelle feuille avec les mêmes données que la première
xlsx.utils.book_append_sheet(workbook, newSheet, currentDate);

Object.keys(sheet).forEach(key => {
    newSheet[key] = sheet[key];
});

// Update the range of the new sheet to include the 'E' column
const range = xlsx.utils.decode_range(newSheet['!ref']);
range.e.c = Math.max(range.e.c, 5); // 5 is the zero-based index of column 'F'
newSheet['!ref'] = xlsx.utils.encode_range(range);
newSheet['F1'] = { v: "Prix moyen" };

// Mettre à jour la colonne D de la première ligne avec la meilleure correspondance
const bestMatchFirstRow = findBestMatch(sheet['A1'].v, sheet['B1'].v.split('/')[0], sheet['C1'].v);
const xValueFirstRow = getXValue(sheet['D1'].v);
newSheet['E1'] = { v: bestMatchFirstRow + xValueFirstRow };

// Trouver la dernière ligne non vide dans la colonne A
let lastRow = 1;
while (newSheet[`A${lastRow + 1}`] && newSheet[`A${lastRow + 1}`].v !== undefined) {
    lastRow++;
}

// Mettre à jour les colonnes D et E pour les lignes restantes
for (let row = 2; row <= lastRow; row++) {
    const cellA = newSheet[`A${row}`] ? newSheet[`A${row}`].v : ''; // Vérifier si la cellule existe
    const cellB = newSheet[`B${row}`] && typeof newSheet[`B${row}`].v === 'string' 
    ? newSheet[`B${row}`].v.split('/')[0] 
    : ''; // Vérifier si la cellule existe
    const cellC = newSheet[`C${row}`] ? newSheet[`C${row}`].v : ''; // Vérifier si la cellule existe
    const cellD = newSheet[`D${row}`] ? newSheet[`D${row}`].v : ''; // Vérifier si la cellule existe

    // Trouver la meilleure correspondance dans le JSON
    const bestMatch = findBestMatch(cellA, cellB, cellC);
    const xValue = getXValue(cellD);

    // Mettre à jour la colonne D avec la meilleure correspondance
    newSheet[`E${row}`] = { v: bestMatch + xValue };
}

// Sauvegarder les modifications dans le même fichier Excel
xlsx.writeFile(workbook, originalFileName);

console.log('Modification terminée avec succès.');