const fs = require('fs').promises;

async function cleanExcessCards() {
 try {
   const jsonData = await fs.readFile('../data.json', 'utf-8');
   const dataArray = JSON.parse(jsonData);

   const cleanedLocalNames = [];

   // Parcourir chaque entrée
   for (const entry of dataArray) {
     const numCardsValue = parseInt(entry.numCards);
     const cardsCount = entry.cards?.length || 0;

     // Supprimer tous les "cards" si dépassement et stocker le localName
     if (cardsCount > numCardsValue) {
       entry.cards = [];
       cleanedLocalNames.push(entry.localName);
     }
   }

   // Écrire le fichier mis à jour
   await fs.writeFile('../data.json', JSON.stringify(dataArray, null, 2), 'utf-8');

   console.log('LocalNames dont les cards ont été supprimés :');
   console.log(cleanedLocalNames);
   console.log(`Nombre d'entrées nettoyées : ${cleanedLocalNames.length}`);
 } catch (error) {
   console.error('Une erreur est survenue : ' + error);
 }
}

cleanExcessCards();