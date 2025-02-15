const browser = require('../../src/BrowserFactory');
const path = require('path');
const { sortSeriesByDate } = require('../../src/parseDate');
const config = require(path.resolve(__dirname, '../../src/config.js'));

const { checkJsonSeries } = require(config.jsonControl);
const db = require(config.databasePath);

//const db = require('../database');

class DataUpdater {
    constructor() {
        this.page = null;
        this.data = null; // Ajout d'une propriété pour stocker les données
    }

    async initialize() {
        this.page = await browser.createPage();
        this.data = db.getData(); // Initialisation des données
    }

    async updateSeriesData() {
        try {
            await this.initialize();

            // Vérification des URLs à mettre à jour
            const { urlsToUpdate } = await checkJsonSeries(this.data);

            if (urlsToUpdate.length === 0) {
                console.log("Toutes les données sont déjà mises à jour.");
                return;
            }

            const itemsToUpdate = this.data.filter(item => urlsToUpdate.includes(item.url));
            const totalUrls = itemsToUpdate.length;
            let urlsProcessed = 0;

            for (const item of itemsToUpdate) {
                try {
                    await this.page.goto(item.url, { waitUntil: 'domcontentloaded' });

                    // Extraction des données en parallèle
                    const [languages, bloc, numCards] = await Promise.all([
                        this.page.$$eval('.languages span[data-original-title]', elements =>
                            elements.map(el => el.getAttribute('data-original-title').trim())),
                        this.page.$eval('.col-auto.col-md-12.pe-0', el =>
                            el.textContent.trim()).catch(() => ''),
                        this.page.$eval('.col-auto.col-md-12:not(.pe-0):not(.span)', el =>
                            el.textContent.replace(/●\s*/, '').trim()).catch(() => 'Nombre de cartes non trouvé')
                    ]);

                    // Formatage de la date
                    const now = new Date();
                    const formattedDate = [
                        now.getDate().toString().padStart(2, '0'),
                        (now.getMonth() + 1).toString().padStart(2, '0'),
                        now.getFullYear()
                    ].join('/');

                    // Mise à jour des données
                    const updatedData = this.data.map(entry => {
                        if (entry.url === item.url) {
                            return {
                                ...entry,
                                langues: languages.join(', '),
                                bloc,
                                numCards,
                                lastUpdate: formattedDate
                            };
                        }
                        return entry;
                    });

                    // Tri et sauvegarde des données
                    try {
                        this.data = sortSeriesByDate(updatedData);
                        db.saveData(this.data);
                    } catch (sortError) {
                        console.error(`Erreur lors du tri des données: ${sortError}`);
                        this.data = updatedData;
                        db.saveData(this.data);
                    }

                    urlsProcessed++;
                    console.log(`Progression : ${(urlsProcessed / totalUrls * 100).toFixed(2)}% - URL: ${item.url}`);
                    await this.page.waitForTimeout(1000);
                } catch (error) {
                    console.error(`Erreur lors de la récupération des données pour l'URL ${item.url}: ${error}`);
                    continue;
                }
            }

            console.log("Mise à jour terminée.");
        } catch (error) {
            console.error("Une erreur s'est produite : ", error);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    async cleanup() {
        await browser.closeBrowser();
    }
}

// Exécution
if (require.main === module) {
    const updater = new DataUpdater();
    updater.updateSeriesData()
        .catch(console.error);
}

module.exports = DataUpdater;
