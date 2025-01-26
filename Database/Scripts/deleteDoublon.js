const fs = require('fs');

// Fonction pour détecter les doublons avec une combinaison de deux clés
function findDuplicatesByTwoKeys(data, keys) {
  const seen = new Map();
  const duplicates = new Set();
  data.forEach(item => {
    const compositeKey = keys.map(key => item[key] || '').join('|');
    if (seen.has(compositeKey)) {
      duplicates.add(seen.get(compositeKey));
      duplicates.add(item);
    } else {
      seen.set(compositeKey, item);
    }
  });
  return duplicates;
}

fs.readFile('../Test.json', 'utf8', (err, fileContent) => {
  if (err) {
    console.error('Erreur lors de la lecture du fichier:', err);
    return;
  }
  try {
    const data = JSON.parse(fileContent);
    if (!Array.isArray(data)) {
      console.error('Le fichier JSON doit contenir un tableau à la racine.');
      return;
    }

    let totalCardsDeleted = 0;

    // Parcourir chaque élément principal du tableau
    data.forEach((item, index) => {
      if (!item.cards || !Array.isArray(item.cards)) {
        console.warn(`L'élément à l'index ${index} ne contient pas de tableau "cards".`);
        return;
      }

      // Détection des doublons pour différentes paires de clés
      const pairsToCheck = [
        ['cardUrl', 'cardNumber'],
        ['cardUrl', 'productRowId'],
        ['cardNumber', 'productRowId']
      ];
      let allDuplicates = new Set();
      pairsToCheck.forEach(pair => {
        const duplicates = findDuplicatesByTwoKeys(item.cards, pair);
        duplicates.forEach(card => allDuplicates.add(card));
      });

      // Supprimer les doublons détectés
      const initialCardCount = item.cards.length;
      item.cards = item.cards.filter(card => !allDuplicates.has(card));
      const cardsDeleted = initialCardCount - item.cards.length;
      totalCardsDeleted += cardsDeleted;
    });

    // Écrire les données mises à jour dans le fichier JSON
    fs.writeFile('../Test.json', JSON.stringify(data, null, 2), 'utf8', writeErr => {
      if (writeErr) {
        console.error('Erreur lors de l\'écriture du fichier:', writeErr);
        return;
      }
      console.log(`Nombre total de cartes supprimées : ${totalCardsDeleted}`);
    });
  } catch (parseError) {
    console.error('Erreur lors du parsing du fichier JSON:', parseError);
  }
});