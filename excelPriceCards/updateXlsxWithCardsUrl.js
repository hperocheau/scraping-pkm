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

// Remplacez le nom du fichier d'origine avec le chemin correct
const originalFileName = './cartes.xlsx';

// Charger le fichier Excel
const workbook = xlsx.readFile(originalFileName);

// Créer une nouvelle feuille avec la date du jour comme nom
const currentDate = moment().format("DD_MM_YYYY");

// Vérifier si la feuille existe déjà
if (workbook.SheetNames.includes(currentDate)) {
    const existingSheet = workbook.Sheets[currentDate];

    // Comparer les cellules A, B, C et D
    let areSheetsEqual = true;

    for (let i = 1; i <= 4; i++) {
        const cell = xlsx.utils.encode_cell({ r: 0, c: i });

        // Vérifier que la cellule existe dans les deux feuilles
        if (!existingSheet[cell] || !existingSheet[cell] || existingSheet[cell].v !== existingSheet[cell].v) {
            areSheetsEqual = false;
            break;
        }
    }

    if (areSheetsEqual) {
        console.log('Le fichier est déjà à jour.');
        process.exit(0);
    } else {
        // Si elle existe, la supprimer
        const currentDateSheetIndex = workbook.SheetNames.indexOf(currentDate);
        if (currentDateSheetIndex >= 0) {
            workbook.SheetNames.splice(currentDateSheetIndex, 1);
            delete workbook.Sheets[currentDate];
        }
    }
}

// Sélectionne la première feuille
const sheetName = workbook.SheetNames[0];
if (!sheetName) {
    console.error('La feuille n\'existe pas dans le fichier Excel.');
    process.exit(1);
}

const sheet = workbook.Sheets[sheetName];

// Vérifie que la feuille n'est pas vide
if (!sheet || !sheet['!ref']) {
    console.error('La feuille est vide dans le fichier Excel.');
    process.exit(1);
}

// Charger le fichier JSON
const jsonData = require('./bdd.json');

// Fonction de comparaison de similarité
function calculateSimilarity(str1, str2) {
    const processedStr1 = str1 !== undefined ? processCardNumber(str1).split(' ') : [];
    const processedStr2 = str2 !== undefined ? processCardNumber(str2).split(' ') : [];

    const similarities = _.intersection(processedStr1, processedStr2);
    const percentage = (similarities.length / Math.max(processedStr1.length, processedStr2.length)) * 100;
    return percentage;
}

// Fonction pour traiter la valeur de "cardNumber"
const processCardNumber = (value) => value.replace(/^0+/, ''); // Supprimer les zéros initiaux

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
range.e.c = Math.max(range.e.c, 4); // 4 is the zero-based index of column 'E'
newSheet['!ref'] = xlsx.utils.encode_range(range);

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
    const cellB = newSheet[`B${row}`] ? newSheet[`B${row}`].v.split('/')[0] : ''; // Vérifier si la cellule existe
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