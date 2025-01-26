const fs = require('fs');

// Fonction pour détecter les doublons avec une combinaison de deux clés
function findDuplicatesByTwoKeys(data, keys) {
  const seen = new Map();
  const duplicates = [];

  data.forEach(item => {
    const compositeKey = keys.map(key => item[key] || '').join('|'); // Combiner les deux clés en une seule chaîne
    if (seen.has(compositeKey)) {
      // Ajouter les deux éléments en conflit
      const original = seen.get(compositeKey);
      if (!duplicates.includes(original)) duplicates.push(original);
      duplicates.push(item);
    } else {
      seen.set(compositeKey, item);
    }
  });

  return duplicates;
}

fs.readFile('../data.json', 'utf8', (err, fileContent) => {
  if (err) {
    console.error('Erreur lors de la lecture du fichier:', err);
    return;
  }

  try {
    // Parsing du contenu JSON
    const data = JSON.parse(fileContent);

    if (!Array.isArray(data)) {
      console.error('Le fichier JSON doit contenir un tableau à la racine.');
      return;
    }

    let totalDuplicateCount = 0; // Compteur global pour le nombre total de cartes détectées comme doublons

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

      pairsToCheck.forEach(pair => {
        const duplicates = findDuplicatesByTwoKeys(item.cards, pair);
        if (duplicates.length > 0) {
          console.log(`Doublons pour "${pair.join(' et ')}" dans l'élément à l'index ${index}:`, duplicates);

          // Ajouter au compteur global (éviter les doublons multiples dans le même groupe)
          const uniqueDuplicates = new Set(duplicates); // Utiliser un Set pour éviter les doublons
          totalDuplicateCount += uniqueDuplicates.size; // Ajouter la taille de ce groupe au total
        }
      });
    });

    console.log(`\nNombre total de cartes détectées comme doublons: ${totalDuplicateCount}`);

  } catch (parseError) {
    console.error('Erreur lors du parsing du fichier JSON:', parseError);
  }
});
