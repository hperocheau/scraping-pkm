const path = require('path');
const config = require(path.resolve(__dirname, '../../src/config.js'));
const { sortSeriesByDate } = require(config.parseDate);
const { returnSeriesInfosToUpdate } = require(path.resolve(config.databaseControl, 'seriesInfosToUpdate.js'));
const database = require(config.databasePath);
const browser = require(config.BrowserFactory);
const ScraperUtils = require(config.BrowserUtils);

class DataUpdater {
    constructor() {
        this.page = null;
        this.retryAttempts = 3;
        this.baseRetryDelay = 3000;
        this.minDelay = 1000;
        this.maxDelay = 3000;
    }

    async initialize() {
        await browser.getBrowser();
        this.page = await browser.getPageFromPool();
    }

    /**
     * Extrait les données d'une page de série
     */
    async extractSeriesData(url) {
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await ScraperUtils.randomDelay(500, 1500);

        // Extraction des données en parallèle
        const [languages, bloc, numCards] = await Promise.all([
            this.page.$$eval('.languages span[data-original-title]', elements =>
                elements.map(el => el.getAttribute('data-original-title').trim())
            ).catch(() => []),
            
            this.page.$eval('.col-auto.col-md-12.pe-0', el =>
                el.textContent.trim()
            ).catch(() => ''),
            
            this.page.$eval('.col-auto.col-md-12:not(.pe-0):not(.span)', el =>
                el.textContent.replace(/●\s*/, '').trim()
            ).catch(() => '0')
        ]);

        return {
            langues: languages.join(', '),
            bloc,
            numCards,
            lastUpdate: this.getFormattedDate()
        };
    }

    /**
     * Formate la date actuelle
     */
    getFormattedDate() {
        const now = new Date();
        return [
            now.getDate().toString().padStart(2, '0'),
            (now.getMonth() + 1).toString().padStart(2, '0'),
            now.getFullYear()
        ].join('/');
    }

    /**
     * Met à jour une entrée dans les données
     */
    updateEntry(data, url, newData) {
        return data.map(entry => {
            if (entry.url === url) {
                return { ...entry, ...newData };
            }
            return entry;
        });
    }

    /**
     * Met à jour toutes les séries nécessitant une mise à jour
     */
    async updateSeriesData() {
        const startTime = Date.now();

        try {
            await this.initialize();

            // Récupération des données
            let data = database.getData();

            // Vérification des URLs à mettre à jour
            const { urlsToUpdate } = await returnSeriesInfosToUpdate(data);

            if (urlsToUpdate.length === 0) {
                console.log("✅ Toutes les données sont déjà à jour.");
                return;
            }

            const itemsToUpdate = data.filter(item => urlsToUpdate.includes(item.url));
            const totalUrls = itemsToUpdate.length;

            console.log(`\n🚀 Début de la mise à jour de ${totalUrls} série(s)\n`);

            for (const [index, item] of itemsToUpdate.entries()) {
                try {
                    console.log(`\n${'='.repeat(60)}`);
                    console.log(`📦 [${index + 1}/${totalUrls}] ${item.url}`);
                    console.log('='.repeat(60));

                    // Extraction avec retry
                    const seriesData = await ScraperUtils.retry(
                        async () => await this.extractSeriesData(item.url),
                        {
                            maxAttempts: this.retryAttempts,
                            baseDelay: this.baseRetryDelay,
                            exponential: true,
                            jitter: true,
                        }
                    );

                    // Mise à jour des données en mémoire
                    data = this.updateEntry(data, item.url, seriesData);

                    // Affichage des infos
                    console.log(`📊 Langues: ${seriesData.langues || 'N/A'}`);
                    console.log(`📦 Bloc: ${seriesData.bloc || 'N/A'}`);
                    console.log(`🃏 Cartes: ${seriesData.numCards}`);
                    console.log(`📅 Mise à jour: ${seriesData.lastUpdate}`);

                    // Sauvegarde différée (optimisation I/O)
                    try {
                        const sortedData = sortSeriesByDate(data);
                        database.saveDataDeferred(sortedData, 3000);
                        data = sortedData;
                    } catch (sortError) {
                        console.error(`⚠️  Erreur lors du tri: ${sortError.message}`);
                        database.saveDataDeferred(data, 3000);
                    }

                    // Barre de progression
                    const progress = ScraperUtils.progressBar(index + 1, totalUrls, 30);
                    console.log(`\n${progress}`);

                    // Délai aléatoire entre les requêtes (sauf pour la dernière)
                    if (index < totalUrls - 1) {
                        const delay = Math.random() * (this.maxDelay - this.minDelay) + this.minDelay;
                        console.log(`⏸️  Pause de ${(delay / 1000).toFixed(1)}s...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }

                } catch (error) {
                    console.error(`❌ Erreur pour ${item.url}: ${error.message}`);
                    // Continuer avec les autres URLs
                    continue;
                }
            }

            // Sauvegarde finale forcée
            await database.flush();
            console.log('\n💾 Sauvegarde finale effectuée');

            const executionTime = (Date.now() - startTime) / 1000;
            console.log(`\n${'='.repeat(60)}`);
            console.log(`✅ Mise à jour terminée en ${ScraperUtils.formatTime(executionTime)}`);
            console.log(`📊 ${totalUrls} série(s) traitée(s)`);
            console.log('='.repeat(60));

        } catch (error) {
            console.error("❌ Une erreur critique s'est produite:", error);
            // Sauvegarder même en cas d'erreur
            await database.flush();
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    /**
     * Nettoie les ressources
     */
    async cleanup() {
        if (this.page) {
            await browser.returnPageToPool(this.page);
            this.page = null;
        }
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