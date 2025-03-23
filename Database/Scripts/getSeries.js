const fs = require('fs').promises;
const path = require('path');
const browserFactory = require('../../src/BrowserFactory');
const config = require(path.resolve(__dirname, '../../src/config.js'));
const db = require(config.databasePath);
const { MONTHS_MAP, parseCardMarketDate, sortSeriesByDate } = require('../../src/parseDate.js');

const CONFIG = {
    url: 'https://www.cardmarket.com/fr/Pokemon/Expansions',
    timeout: 120000
};

class CardMarketScraper {
    constructor(config) {
        this.config = config;
        this.page = null;
    }

    parseDate(dateStr) {
        return parseCardMarketDate(dateStr);
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

    async updateData(newData) {
        const existingData = db.getData();
        let addedCount = 0;
        let updatedCount = 0;

        // Créer une Map des données existantes pour une recherche plus rapide
        const existingDataMap = new Map(existingData.map(item => [item.url, item]));
        
        // Traiter les nouvelles données
        for (const newItem of newData) {
            const existingItem = existingDataMap.get(newItem.url);
            
            if (!existingItem) {
                existingDataMap.set(newItem.url, newItem);
                addedCount++;
            } else if (existingItem.date !== newItem.date) {
                existingDataMap.set(newItem.url, {
                    ...existingItem,
                    date: newItem.date,
                });
                updatedCount++;
            }
        }

        // Convertir la Map en array et trier
        const finalData = sortSeriesByDate(Array.from(existingDataMap.values()));

        // Sauvegarder les données via le module db
        db.saveData(finalData);
        
        // Log détaillé des modifications
        console.log(`
Mise à jour de la base de données terminée :
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
            const result = await this.updateData(seriesData);
            
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

module.exports = {
    CardMarketScraper
};

if (require.main === module) {
    const scraper = new CardMarketScraper(CONFIG);
    scraper.run().catch(console.error);
}
