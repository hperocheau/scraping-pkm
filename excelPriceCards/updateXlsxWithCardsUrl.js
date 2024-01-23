const fs = require('fs');
const xlsx = require('xlsx');
const _ = require('lodash');

// Charger le fichier Excel
const workbook = xlsx.readFile('./cartes.xlsx');
// Assure-toi que la feuille existe
const sheetName = workbook.SheetNames[0];
if (!sheetName) {
    console.error('La feuille n\'existe pas dans le fichier Excel.');
    process.exit(1);
}

// Sélectionne la première feuille
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

// Trouver la meilleure correspondance dans le JSON pour la première ligne
const bestMatchFirstRow = findBestMatch(sheet['A1'].v, sheet['B1'].v.split('/')[0], sheet['C1'].v);

// Mettre à jour la colonne D de la première ligne avec la meilleure correspondance
sheet['E1'] = { v: bestMatchFirstRow.cardUrl };

// Trouver la dernière ligne non vide dans la colonne A
let lastRow = 1;
while (sheet[`A${lastRow + 1}`] && sheet[`A${lastRow + 1}`].v !== undefined) {
    lastRow++;
}

for (let row = 2; row <= lastRow; row++) {
    const cellA = sheet[`A${row}`] ? sheet[`A${row}`].v : ''; // Vérifier si la cellule existe
    const cellB = sheet[`B${row}`] ? sheet[`B${row}`].v.split('/')[0] : ''; // Vérifier si la cellule existe
    const cellC = sheet[`C${row}`] ? sheet[`C${row}`].v : ''; // Vérifier si la cellule existe

    // Trouver la meilleure correspondance dans le JSON
    const bestMatch = findBestMatch(cellA, cellB, cellC);

    // Mettre à jour la colonne D avec la meilleure correspondance
    sheet[`E${row}`] = { v: bestMatch };
}

// Sauvegarder les modifications dans le même fichier Excel
xlsx.writeFile(workbook, './cartes_url.xlsx');

console.log('Modification terminée avec succès.');