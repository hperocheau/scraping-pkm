const path = require('path');
const config = require(path.resolve(__dirname, '../../src/config.js'));
const db = require(config.databasePath);
const { parseCardMarketDate } = require(config.parseDate);

/**
 * Retourne la liste des séries à mettre à jour dans le fichier JSON. A mettre à jour si:
 * - Au moins un champ manquant parmi : localName, url, urlCards, date, langues, bloc ou numCards
 * - OU mauvais format de numCards, date et lastUpdate
 * - OU (série date d'il y a moins d'un mois ET lastUpdate ne date pas d'aujourd'hui)
 * @param {Array} data - Tableau des séries
 * @returns {Promise<{urlsToUpdate: string[], isValid: boolean}>}
 */
async function returnSeriesInfosToUpdate(data) {
  try {
    const series = data;
    
    if (!Array.isArray(series)) {
      throw new Error('Le contenu JSON doit être un tableau');
    }
    
    const validation = {
      urlsToUpdate: [],
      isValid: true
    };
    
    // Expressions régulières pour validation des formats
    const VALIDATIONS = {
      numCards: /^[0-9]{1,3}\scartes$/,
      date: /^\d{1,2}\s(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s\d{4}$/i,
      lastUpdate: /^\d{2}\/\d{2}\/\d{4}$/
    };
    
    const REQUIRED_FIELDS = ['localName', 'url', 'urlCards', 'date', 'langues', 'bloc', 'numCards'];
    
    const currentDate = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(currentDate.getMonth() - 1);
    
    // Date du jour au format DD/MM/YYYY
    const today = currentDate.toLocaleDateString('fr-FR');
    
    series.forEach((serie, index) => {
      let needsUpdate = false;
      const reasons = [];
      
      // 1. Vérifier la présence de tous les champs requis
      const missingFields = REQUIRED_FIELDS.filter(field => 
        !serie[field] || serie[field]?.toString().trim().length === 0
      );
      
      if (missingFields.length > 0) {
        needsUpdate = true;
        reasons.push(`Champs manquants: ${missingFields.join(', ')}`);
      }
      
      // 2. Vérifier le format de numCards
      if (serie.numCards && !VALIDATIONS.numCards.test(serie.numCards)) {
        needsUpdate = true;
        reasons.push(`Format numCards invalide: "${serie.numCards}"`);
      }
      
      // 3. Vérifier le format de la date
      if (serie.date) {
        // Vérifier si la date est marquée comme non trouvée
        if (serie.date === 'Date non trouvée') {
          needsUpdate = true;
          reasons.push('Date non trouvée');
        } else if (!VALIDATIONS.date.test(serie.date)) {
          needsUpdate = true;
          reasons.push(`Format date invalide: "${serie.date}"`);
        } else {
          // 4. Vérifier que la date est parseable avec la fonction du projet
          const serieDate = parseCardMarketDate(serie.date);
          
          if (serieDate.getTime() === 0) {
            needsUpdate = true;
            reasons.push(`Date non parseable: "${serie.date}"`);
          } else {
            // 5. Vérifier si c'est une série récente (moins d'un mois)
            const isRecentSeries = serieDate > oneMonthAgo;
            
            if (isRecentSeries) {
              // Pour les séries récentes, vérifier le lastUpdate
              if (!serie.lastUpdate) {
                needsUpdate = true;
                reasons.push('Série récente sans lastUpdate');
              } else {
                // Vérifier le format du lastUpdate
                if (!VALIDATIONS.lastUpdate.test(serie.lastUpdate)) {
                  needsUpdate = true;
                  reasons.push(`Format lastUpdate invalide: "${serie.lastUpdate}"`);
                } else {
                  // Vérifier si le lastUpdate est aujourd'hui
                  if (serie.lastUpdate !== today) {
                    needsUpdate = true;
                    reasons.push(`Série récente avec lastUpdate pas à jour (${serie.lastUpdate} ≠ ${today})`);
                  }
                }
              }
            }
          }
        }
      }
      
      // 6. Vérifier le format du lastUpdate s'il existe (même pour les séries anciennes)
      if (serie.lastUpdate && !VALIDATIONS.lastUpdate.test(serie.lastUpdate)) {
        needsUpdate = true;
        reasons.push(`Format lastUpdate invalide: "${serie.lastUpdate}"`);
      }
      
      if (needsUpdate) {
        validation.isValid = false;
        validation.urlsToUpdate.push(serie.url);
        
        if (reasons.length > 0) {
          console.log(`⚠️  ${serie.localName || serie.url}: ${reasons.join(', ')}`);
        }
      }
    });
    
    return validation;
  } catch (error) {
    console.error('Erreur lors de la vérification du fichier JSON:', error);
    throw error;
  }
}

async function main() {
  try {
    // Récupération des données depuis la base de données
    const data = db.getData();
    console.log(`✅ ${data.length} séries chargées\n`);

    // Exécution de returnSeriesInfosToUpdate
    console.log('📊 Vérification de la validité des séries (returnSeriesInfosToUpdate)...\n');
    const validation = await returnSeriesInfosToUpdate(data);
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Fichier valide: ${validation.isValid ? '✅ OUI' : '❌ NON'}`);
    console.log(`Séries à mettre à jour: ${validation.urlsToUpdate.length}`);
    console.log(`${'='.repeat(50)}`);
    
    if (validation.urlsToUpdate.length > 0) {
      console.log('\n📋 URLs à mettre à jour:');
      validation.urlsToUpdate.forEach((url, index) => {
        console.log(`  ${index + 1}. ${url}`);
      });
    }
    
    console.log('\n=== Analyses terminées ===');
  } catch (error) {
    console.error('❌ Erreur lors de l\'exécution des analyses:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  returnSeriesInfosToUpdate
};