const fs = require('fs');
const xlsx = require('xlsx');
const _ = require('lodash');
const moment = require('moment');

// Remplacez le nom du fichier d'origine avec le chemin correct
const originalFileName = './cartes.xlsx';

// Charger le fichier Excel
const workbook = xlsx.readFile(originalFileName);
const sheet = workbook.Sheets[workbook.SheetNames[0]];

// Vérifie que la feuille n'est pas vide
if (!sheet || !sheet['!ref']) {
    console.error('La feuille est vide dans le fichier Excel.');
    process.exit(1);
}

// Charger le fichier JSON
const jsonData = require('./bdd.json');

// Fonction de comparaison de similarité
function calculateSimilarity(str1, str2) {
    // Fonction pour traiter la valeur de "cardNumber"
    const processCardNumber = (value) => value.replace(/^0+/, ''); // Supprimer les zéros initiaux

    const processedStr1 = str1 !== undefined ? processCardNumber(str1) : '';
    const processedStr2 = str2 !== undefined ? processCardNumber(str2) : '';

    const similarities = _.intersection(processedStr1.split(' '), processedStr2.split(' '));
    const percentage = (similarities.length / Math.max(processedStr1.split(' ').length, processedStr2.split(' ').length)) * 100;
    return percentage;
}

// Fonction pour traiter la valeur de "cardNumber"
const processCardNumber = (value) => value.replace(/^0+/, ''); // Supprimer les zéros initiaux

// Fonction pour trouver la meilleure correspondance dans le JSON
function findBestMatch(cellA, cellB, cellC) {
    const matches = jsonData.map(cardSet => {
        const cardMatches = cardSet.cards.map(card => {
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

            return {
                cardUrl: card.cardUrl,
                similarity: totalSimilarity
            };
        });

        const bestMatch = _.maxBy(cardMatches, 'similarity');
        return bestMatch;
    });

    // Filtrer les correspondances non nulles
    const validMatches = matches.filter(match => match && match.similarity > 0);

    const bestOverallMatch = _.maxBy(validMatches, 'similarity');

    return bestOverallMatch ? 'https://www.cardmarket.com' + bestOverallMatch.cardUrl : '';
}

// Définition des valeurs de X selon la cellule D
const getXValue = (cellD) => {
    const lowercaseCellD = cellD.toLowerCase();
    if (lowercaseCellD.includes('jp') || lowercaseCellD.includes('japonais') || lowercaseCellD.includes('jap')) {
        return "?language=7&minCondition=2&isSigned=N&isPlayset=N&isAltered=N";
    } else if (lowercaseCellD.includes('fr') || lowercaseCellD.includes('français') || lowercaseCellD.includes('francais')) {
        return "?language=2&minCondition=2&isSigned=N&isPlayset=N&isAltered=N";
    } else {
        return "";
    }
}

// Créer une nouvelle feuille avec la date du jour comme nom
const currentDate = moment().format("DD_MM_YYYY");
xlsx.utils.book_append_sheet(workbook, {}, currentDate);
const newSheet = workbook.Sheets[currentDate];

// Copier les données de la première feuille vers la nouvelle feuille
Object.keys(sheet).forEach(key => {
    newSheet[key] = sheet[key];
});

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
