const fs = require('fs').promises;

class JsonUpdater {
    constructor(inputFilePath, outputFilePath) {
        this.inputFilePath = inputFilePath;
        this.outputFilePath = outputFilePath || inputFilePath;
    }

    async readJsonFile() {
        try {
            const data = await fs.readFile(this.inputFilePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Erreur lors de la lecture du fichier:', error);
            return [];
        }
    }

    async writeJsonFile(data) {
        try {
            await fs.writeFile(this.outputFilePath, JSON.stringify(data, null, 2));
            console.log('Fichier mis à jour avec succès');
        } catch (error) {
            console.error('Erreur lors de l\'écriture du fichier:', error);
        }
    }

    findCommonString(strings) {
        if (!strings.length) return '';

        const parenthesesContents = strings
            .map(str => {
                const lastParentheses = str.split('(').pop().replace(')', '').trim();
                return lastParentheses.split(' ');
            })
            .filter(parts => parts.length > 0);

        if (parenthesesContents.length === 0) return '';

        const firstParts = parenthesesContents[0];
        
        for (const part of firstParts) {
            if (parenthesesContents.every(parts => parts.includes(part))) {
                return part;
            }
        }

        return '';
    }

    extractCardNumber(cardFullTitle, codeSerie) {
        if (!cardFullTitle || !codeSerie) return '';

        const lastParentheses = cardFullTitle.split('(').pop().replace(')', '').trim();
        const parts = lastParentheses.split(' ');
        const remainingParts = parts.filter(part => part !== codeSerie);
        
        return remainingParts.join(' ');
    }

    async updateCards() {
        const data = await this.readJsonFile();

        // Pour chaque entrée dans le fichier
        data.forEach(entry => {
            if (entry.cards && Array.isArray(entry.cards)) {
                console.log(`Traitement de ${entry.cards.length} cartes pour ${entry.urlCards}`);

                // Récupérer tous les titres de cartes
                const allCardTitles = entry.cards
                    .map(card => card.cardFullTitle)
                    .filter(Boolean);

                // Trouver le code série commun
                const commonString = this.findCommonString(allCardTitles);
                console.log("Code série trouvé:", commonString);

                if (commonString) {
                    // Mettre à jour chaque carte
                    entry.cards.forEach(card => {
                        if (card.cardFullTitle) {
                            card.codeSerie = commonString;
                            card.cardNumber = this.extractCardNumber(card.cardFullTitle, commonString);
                            console.log(`Carte mise à jour: ${card.cardFullTitle}`);
                            console.log(`→ Code série: ${card.codeSerie}`);
                            console.log(`→ Numéro: ${card.cardNumber}`);
                        }
                    });
                }
            }
        });

        // Sauvegarder les modifications
        await this.writeJsonFile(data);
    }
}

// Utilisation du script
async function main() {
    const updater = new JsonUpdater('../Test3.json');
    await updater.updateCards();
}

main().catch(console.error);
