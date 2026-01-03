const path = require('path');
const config = require(path.resolve(__dirname, '../../src/config.js'));
const database = require(config.databasePath);
const { DataChecker } = require('./index.js'); // Import depuis index.js

/**
 * Supprime toutes les cartes à partir de l'url de la carte fournie dans la liste d'url en paramètres via les fonctions checkDupeCards et checkUnmatchingCardsSeries.
 * @param {string[]} urlsToDelete - Tableau des cardUrl à supprimer
 * @returns {Object} - Statistiques de suppression { deletedCount, affectedElements }
 */
async function deleteCards(urlsToDelete) {
  try {
    if (!Array.isArray(urlsToDelete) || urlsToDelete.length === 0) {
      console.log('⚠️  Aucune URL à supprimer.');
      return { deletedCount: 0, affectedElements: 0 };
    }
    
    console.log(`🗑️  Suppression de ${urlsToDelete.length} URL(s)...`);
    
    // Charger les données actuelles
    const data = database.getData();
    
    // Créer un Set pour une recherche plus rapide
    const urlsSet = new Set(urlsToDelete);
    
    let deletedCount = 0;
    let affectedElements = 0;
    
    // Parcourir chaque élément et filtrer les cartes
    data.forEach((element) => {
      if (!element.cards || !Array.isArray(element.cards)) {
        return;
      }
      
      const initialLength = element.cards.length;
      
      // Filtrer les cartes pour garder uniquement celles qui ne sont pas dans la liste
      element.cards = element.cards.filter(card => {
        if (card.cardUrl && urlsSet.has(card.cardUrl)) {
          console.log(`  ❌ Suppression: ${card.cardName || 'Sans nom'} (${card.cardUrl})`);
          deletedCount++;
          return false;
        }
        return true;
      });
      
      if (element.cards.length < initialLength) {
        affectedElements++;
      }
    });
    
    if (deletedCount > 0) {
      database.saveData(data);
      console.log(`\n✅ Suppression terminée:`);
      console.log(`   - ${deletedCount} carte(s) supprimée(s)`);
      console.log(`   - ${affectedElements} série(s) affectée(s)`);
    } else {
      console.log('\n⚠️  Aucune carte correspondante trouvée.');
    }
    
    return { deletedCount, affectedElements };
    
  } catch (error) {
    console.error('❌ Erreur lors de la suppression des cartes:', error);
    throw error;
  }
}

module.exports = { deleteCards };

if (require.main === module) {
  async function main() {
    // Créer une instance de DataChecker avec la database
    const checker = new DataChecker(database);
    
    // Détecter les cartes avec séries incorrectes
    const incorrectSeriesUrls = await checker.checkUnmatchingCardsSeries();
    
    // Détecter les doublons
    const duplicateUrls = await checker.checkDupeCards();
    
    // Combiner les deux listes en évitant les doublons
    const allUrlsToDelete = [...new Set([...incorrectSeriesUrls, ...duplicateUrls])];
    
    if (allUrlsToDelete.length === 0) {
      console.log('\n✅ Aucune carte à supprimer.');
      return;
    }
    
    console.log(`\n📊 Cartes détectées à supprimer:`);
    console.log(`   - Cartes avec séries incorrectes: ${incorrectSeriesUrls.length}`);
    console.log(`   - Cartes en doublon: ${duplicateUrls.length}`);
    console.log(`   - Total unique: ${allUrlsToDelete.length}`);
    
    // Supprimer toutes les cartes détectées
    await deleteCards(allUrlsToDelete);
  }
  
  main().catch(error => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  });
}