const fs = require('fs').promises;
const path = require('path');
const browserFactory = require('../../src/BrowserFactory');

const CONFIG = {
    url: 'https://www.cardmarket.com/fr/Pokemon/Expansions',
    jsonFileName: './Database/Test1.json',
    timeout: 120000,
    months: new Map([
        ['janvier', 0], ['février', 1], ['mars', 2], ['avril', 3], 
        ['mai', 4], ['juin', 5], ['juillet', 6], ['août', 7], 
        ['septembre', 8], ['octobre', 9], ['novembre', 10], ['décembre', 11]
    ])
};

class CardMarketScraper {
    constructor(config) {
        this.config = config;
        this.page = null;
    }

    parseDate(dateStr) {
        if (dateStr === 'Date non trouvée') return new Date(0);
        const [day, month, year] = dateStr.split(' ');
        return new Date(year, this.config.months.get(month.toLowerCase()), parseInt(day));
    }

    async initPage() {
        this.page = await browserFactory.createPage();
        await this.page.setRequestInterception(true);

        this.page.on('request', request => {
            const resourceType = request.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                request.abort();
            } else {
                request.continue();
            }
        });
    }

    async scrapeSeriesData() {
        return await this.page.evaluate(() => {
            const dataInfo = [];
            const selector = '[id^="collapse"] div[data-url]';
            
            document.querySelectorAll(selector).forEach(subDiv => {
                const urlParts = subDiv.getAttribute('data-url');
                const baseUrl = 'https://www.cardmarket.com';
                
                dataInfo.push({
                    localName: subDiv.getAttribute('data-local-name'),
                    url: `${baseUrl}${urlParts}`,
                    urlCards: `${baseUrl}${urlParts.replace('Expansions', 'Products/Singles')}`,
                    date: subDiv.querySelector('.col-3.text-center.d-none.d-md-block')?.textContent.trim() || 'Date non trouvée'
                });
            });
            
            return dataInfo;
        });
    }

    async loadExistingData() {
        try {
            const jsonPath = path.join(this.config.jsonFileName);
            const data = await fs.readFile(jsonPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') return [];
            throw error;
        }
    }

    async updateJsonFile(newData) {
        const existingData = await this.loadExistingData();
        let addedCount = 0;
        let updatedCount = 0;

        // Créer une Map des données existantes pour une recherche plus rapide
        const existingDataMap = new Map(existingData.map(item => [item.url, item]));
        
        // Traiter les nouvelles données
        for (const newItem of newData) {
            const existingItem = existingDataMap.get(newItem.url);
            
            if (!existingItem) {
                // Nouvelle série
                existingDataMap.set(newItem.url, newItem);
                addedCount++;
            } else if (existingItem.date !== newItem.date) {
                // Mise à jour seulement si la date a changé
                existingDataMap.set(newItem.url, {
                    ...existingItem,
                    date: newItem.date,
                });
                updatedCount++;
            }
        }

        // Convertir la Map en array et trier
        const finalData = Array.from(existingDataMap.values())
            .sort((a, b) => {
                if (a.date === 'Date non trouvée') return 1;
                if (b.date === 'Date non trouvée') return -1;
                return this.parseDate(b.date) - this.parseDate(a.date);
            });

        // Écrire les données mises à jour
        await fs.writeFile(
            this.config.jsonFileName,
            JSON.stringify(finalData, null, 2)
        );
        
        // Log détaillé des modifications
        console.log(`
Mise à jour du fichier JSON terminée :
- Nombre total d'entrées : ${finalData.length}
- Nouvelles séries ajoutées : ${addedCount}
- Séries mises à jour : ${updatedCount}
- Séries inchangées : ${finalData.length - (addedCount + updatedCount)}
        `);

        return {
            data: finalData,
            stats: {
                total: finalData.length,
                added: addedCount,
                updated: updatedCount,
                unchanged: finalData.length - (addedCount + updatedCount)
            }
        };
    }

    async run() {
        try {
            console.time('Scraping duration');
            await this.initPage();
            
            await this.page.goto(this.config.url, {
                timeout: this.config.timeout,
                waitUntil: 'domcontentloaded'
            });

            const seriesData = await this.scrapeSeriesData();
            const result = await this.updateJsonFile(seriesData);
            
            console.timeEnd('Scraping duration');
            
            return result;
        } catch (error) {
            console.error('Erreur lors du scraping:', error);
            throw error;
        } finally {
            await browserFactory.closeBrowser();
        }
    }
}

//module.exports = CardMarketScraper;

// Assurez-vous d'exporter à la fois CONFIG et setJsonPath
module.exports = {
    CardMarketScraper
};

// Exécution uniquement si appelé directement
if (require.main === module) {
    const scraper = new CardMarketScraper(CONFIG);
    scraper.run().catch(console.error);
}