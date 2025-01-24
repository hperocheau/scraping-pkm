const fs = require('fs');

// Fonction pour détecter les doublons dans un tableau
function findDuplicates(data, key) {
  const seen = new Map();
  const duplicates = [];

  data.forEach(item => {
    const value = item[key];
    if (seen.has(value)) {
      duplicates.push(item); // Ajoute l'élément en doublon
    } else {
      seen.set(value, true); // Enregistre comme vu
    }
  });

  return duplicates;
}

// Lecture du fichier Test.json
fs.readFile('../Test.json', 'utf8', (err, fileContent) => {
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

    // Parcourir chaque élément principal du tableau
    data.forEach((item, index) => {
      if (!item.cards || !Array.isArray(item.cards)) {
        console.warn(`L'élément à l'index ${index} ne contient pas de tableau "cards".`);
        return;
      }

      console.log(`Analyse des doublons dans le tableau "cards" de l'élément à l'index ${index}...`);

      // Doublons pour "productRowId"
      const productRowIdDuplicates = findDuplicates(item.cards, 'productRowId');
      if (productRowIdDuplicates.length > 0) {
        console.log(`Doublons pour "productRowId" dans l'élément à l'index ${index}:`, productRowIdDuplicates);
      }

      // Doublons pour "cardUrl"
      const cardUrlDuplicates = findDuplicates(item.cards, 'cardUrl');
      if (cardUrlDuplicates.length > 0) {
        console.log(`Doublons pour "cardUrl" dans l'élément à l'index ${index}:`, cardUrlDuplicates);
      }
    });

  } catch (parseError) {
    console.error('Erreur lors du parsing du fichier JSON:', parseError);
  }
});
