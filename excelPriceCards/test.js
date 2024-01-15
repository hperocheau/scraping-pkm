const fs = require('fs');
const stringSimilarity = require('string-similarity');

// Charger le fichier JSON
const jsonData = require('./dataTEST2.json');

// Similitude minimale requise pour considérer une correspondance
const threshold = 0.5;

// Fonction pour trouver la meilleure correspondance pour une ligne
function findBestMatch(row) {
  let bestMatch = { cardUrl: '', similarity: 0 };

  // Parcourir tous les éléments "cards"
  for (const expansion of jsonData) {
    for (const card of expansion.cards) {
      const similarities = [
        stringSimilarity.compareTwoStrings(row.B, card.cardName),
        stringSimilarity.compareTwoStrings(row.C, card.cardSerie),
        stringSimilarity.compareTwoStrings(row.D, card.cardRarity),
        stringSimilarity.compareTwoStrings(row.B, card.localName),
        stringSimilarity.compareTwoStrings(row.B, card.cardNumber),
        stringSimilarity.compareTwoStrings(row.B, expansion.localName),
        stringSimilarity.compareTwoStrings(row.B, expansion.url),
        stringSimilarity.compareTwoStrings(row.B, expansion.urlCards),
      ];

      // Calculer la similarité moyenne
      const totalSimilarity = similarities.reduce((acc, val) => acc + val, 0) / similarities.length;

      // Mettre à jour la meilleure correspondance si la similarité est supérieure au seuil actuel
      if (totalSimilarity > bestMatch.similarity && totalSimilarity >= threshold) {
        bestMatch = {
          cardUrl: card.cardUrl,
          similarity: totalSimilarity,
        };
      }
    }
  }

  return bestMatch;
}

// Exemple de données à partir d'une ligne du fichier Excel
const exampleRow = { B: 'Live Code Card', C: 'Booster', D: 'Online Code Card' };

// Trouver la meilleure correspondance
const result = findBestMatch(exampleRow);

// Afficher le résultat
console.log('Meilleure correspondance :', result.cardUrl);
console.log('Similarité :', result.similarity);
