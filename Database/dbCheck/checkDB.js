const fs = require('fs');
const path = require('path');

function validateDataElement(element) {
    const errors = [];

    // Validation du format "X cartes"
    if (!element.numCards || !/^\d{1,3} cartes$/.test(element.numCards)) {
        errors.push({
            key: 'numCards',
            message: 'Nombre de cartes incorrect'
        });
    }

    // Validation de la date entre 1990 et 2050
    const dateNum = Number(element.date);
    if (isNaN(dateNum) || dateNum < 1990 || dateNum > 2050) {
        errors.push({
            key: 'date',
            message: 'Date incorrecte'
        });
    }

    // Validation des langues (au moins un élément)
    if (!Array.isArray(element.langues) || element.langues.length === 0) {
        errors.push({
            key: 'langues',
            message: 'Liste des langues vide ou invalide'
        });
    }

    // Validation de localName
    if (!element.localName || typeof element.localName !== 'string' || element.localName.trim() === '') {
        errors.push({
            key: 'localName',
            message: 'Nom local manquant ou vide'
        });
    }

    // Validation du bloc
    if (!element.bloc || typeof element.bloc !== 'string' || element.bloc.trim() === '') {
        errors.push({
            key: 'bloc',
            message: 'Bloc manquant ou vide'
        });
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

function checkSeries() {
    try {
        // Vérifier l'existence d'un fichier HTML et extraire sa date
        const htmlFile = fs.readdirSync(path.join(__dirname, '..'))
            .find(file => file.endsWith('.html'));

        if (!htmlFile) {
            return {
                status: "Mise à jour de la base nécessaire",
                details: "Aucun fichier HTML trouvé"
            };
        }

        // Extraction et validation de la date
        const [, day, month, year] = htmlFile.match(/^(\d{2})_(\d{2})_(\d{4})\.html$/) || [];
        
        if (!year) {
            return {
                status: "Mise à jour de la base nécessaire",
                details: "Format de nom de fichier HTML invalide"
            };
        }

        // Vérification de la date
        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

        if (new Date(+year, +month - 1, +day) < twoMonthsAgo) {
            return {
                status: "Mise à jour de la base nécessaire",
                details: "Fichier HTML trop ancien"
            };
        }

        // Si la base est à jour, vérifier le contenu de Test1.json
        const dataPath = path.join(__dirname, '..', 'Test1.json');
        if (!fs.existsSync(dataPath)) {
            return {
                status: "Erreur",
                details: "Fichier Test1.json non trouvé"
            };
        }

        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        if (!Array.isArray(data)) {
            return {
                status: "Erreur",
                details: "Le fichier Test1.json ne contient pas un tableau"
            };
        }

        // Vérifier chaque élément du tableau
        const invalidElements = data.reduce((acc, element, index) => {
            const validation = validateDataElement(element);
            if (!validation.valid) {
                acc.push({
                    index,
                    localName: element.localName || 'Non défini',
                    errors: validation.errors
                });
            }
            return acc;
        }, []);

        if (invalidElements.length > 0) {
            const result = {
                status: "Erreur",
                details: "Éléments invalides détectés",
                invalidElements: invalidElements
            };
            
            // Afficher les résultats de manière détaillée
            console.log('\nRésultats détaillés des erreurs :');
            invalidElements.forEach(elem => {
                console.log(`\nÉlément #${elem.index} (${elem.localName}) :`);
                elem.errors.forEach(err => {
                    console.log(`  - ${err.key}: ${err.message}`);
                });
            });

            return result;
        }

        return {
            status: "Base à jour",
            details: "Toutes les vérifications sont passées avec succès"
        };

    } catch (error) {
        return {
            status: "Erreur",
            details: `Erreur lors de la vérification : ${error.message}`
        };
    }
}

// Exécution du script avec affichage formaté
const result = checkSeries();
console.log('\nStatut:', result.status);
console.log('Détails:', result.details);

module.exports = checkSeries;
console.log(checkSeries());