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
    const similarities = _.intersection(str1.split(' '), str2.split(' '));
    const percentage = (similarities.length / Math.max(str1.split(' ').length, str2.split(' ').length)) * 100;
    return percentage;
}

// Fonction pour trouver la meilleure correspondance dans le JSON
function findBestMatch(cellA, cellB, cellC) {
    const matches = jsonData.map(cardSet => {
        const cardMatches = cardSet.cards.map(card => {
            const numberSimilarity = calculateSimilarity(cellB, card.cardNumber);
            const nameSimilarity = calculateSimilarity(cellA, card.cardName);
            const serieSimilarity = calculateSimilarity(cellC, card.cardSerie);
            const totalSimilarity = (numberSimilarity + nameSimilarity + serieSimilarity) / 3;

            return {
                cardUrl: card.cardUrl,
                similarity: totalSimilarity
            };
        });

        const bestMatch = _.maxBy(cardMatches, 'similarity');
        return bestMatch;
    });

    return _.maxBy(matches, 'similarity');
}

// Mettre à jour la première cellule
sheet[`A1`] = { v: 'Nouvelle valeur pour la première cellule' };

// Parcourir les lignes du fichier Excel
const lastRow = sheet['!ref'] ? xlsx.utils.decode_range(sheet['!ref']).e.r : 1;

for (let row = 2; row <= lastRow; row++) {
    const cellA = sheet[`A${row}`].v;
    const cellB = sheet[`B${row}`].v.split('/')[0]; // Prendre la valeur avant le '/'
    const cellC = sheet[`C${row}`].v;

    // Trouver la meilleure correspondance dans le JSON
    const bestMatch = findBestMatch(cellA, cellB, cellC);

    // Mettre à jour la colonne D avec la meilleure correspondance
    sheet[`D${row}`] = { v: bestMatch.cardUrl };
}

// Mettre à jour la dernière cellule
sheet[`A${lastRow}`] = { v: 'Nouvelle valeur pour la dernière cellule' };

// Sauvegarder les modifications dans un nouveau fichier Excel
xlsx.writeFile(workbook, './nouveau_fichier.xlsx');

console.log('Modification terminée avec succès.');
