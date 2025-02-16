const fs = require('fs');
const path = require('path');

async function checkIdenticalNames() {
    try {
        // Lecture du fichier JSON
        const filePath = path.join(__dirname, '../data.json');
        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Parcours des séries
        jsonData.forEach(serie => {
            // Vérifie si la série a des cartes
            if (serie.cards && serie.cards.length > 0) {
                // Vérifie si une des cartes a cardName identique à cardFullTitle
                const hasIdenticalNames = serie.cards.some(card => 
                    card.cardName && card.cardFullTitle && 
                    card.cardName === card.cardFullTitle
                );

                // Si on trouve des noms identiques, on affiche le localName
                if (hasIdenticalNames) {
                    console.log(`Série avec noms identiques : ${serie.localName}`);
                    
                    // Option : Afficher aussi les cartes concernées
                    serie.cards.forEach(card => {
                        if (card.cardName === card.cardFullTitle) {
                            //console.log(`- Card Name: ${card.cardName}`);
                            //console.log(`  Full Title: ${card.cardFullTitle}`);
                        }
                    });
                }
            }
        });

    } catch (error) {
        console.error('Erreur lors du traitement :', error);
    }
}

// Exécution de la fonction
checkIdenticalNames();
