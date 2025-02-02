const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    url: 'https://www.cardmarket.com/fr/Pokemon/Expansions',
    outputPath: '../',
    jsonFileName: 'data.json',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    timeout: 120000,
    months: {
        'janvier': 0, 'février': 1, 'mars': 2, 'avril': 3, 'mai': 4, 'juin': 5,
        'juillet': 6, 'août': 7, 'septembre': 8, 'octobre': 9, 'novembre': 10, 'décembre': 11
    }
};

class CardMarketScraper {
    constructor(config) {
        this.config = config;
        this.browser = null;
        this.page = null;
    }

    getFormattedDate() {
        const today = new Date();
        return today.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).replace(/\//g, '_');
    }

    parseDate(dateStr) {
        if (dateStr === 'Date non trouvée') return new Date(0);
        const [day, month, year] = dateStr.split(' ');
        return new Date(year, this.config.months[month.toLowerCase()], parseInt(day));
    }

    async initBrowser() {
        this.browser = await puppeteer.launch();
        this.page = await this.browser.newPage();
        await this.page.setUserAgent(this.config.userAgent);
        this.page.on('console', message => 
            console.log(`${message.type().substr(0, 3).toUpperCase()} ${message.text()}`));
    }

    async cleanHtmlFiles() {
        const files = await fs.promises.readdir(this.config.outputPath);
        const htmlFiles = files.filter(file => path.extname(file).toLowerCase() === '.html');
        
        for (const file of htmlFiles) {
            const filePath = path.join(this.config.outputPath, file);
            await fs.promises.unlink(filePath);
            console.log(`Fichier supprimé : ${filePath}`);
        }
    }

    async saveHtml() {
        // Supprimer les anciens fichiers HTML
        await this.cleanHtmlFiles();
        
        // Sauvegarder le nouveau fichier HTML
        const html = await this.page.content();
        const htmlFileName = path.join(this.config.outputPath, `${this.getFormattedDate()}.html`);
        await fs.promises.writeFile(htmlFileName, html);
        console.log(`Page HTML téléchargée : ${htmlFileName}`);
        return html;
    }

    async scrapeSeriesData() {
        return await this.page.evaluate(() => {
            const dataInfo = [];
            document.querySelectorAll('[id^="collapse"]').forEach(collapseDiv => {
                collapseDiv.querySelectorAll('div[data-url]').forEach(subDiv => {
                    const urlParts = subDiv.getAttribute('data-url');
                    dataInfo.push({
                        localName: subDiv.getAttribute('data-local-name'),
                        url: `https://www.cardmarket.com${urlParts}`,
                        urlCards: `https://www.cardmarket.com${urlParts.replace('Expansions', 'Products/Singles')}`,
                        date: subDiv.querySelector('.col-3.text-center.d-none.d-md-block')?.textContent.trim() || 'Date non trouvée'
                    });
                });
            });
            return dataInfo;
        });
    }

    async updateJsonFile(newData) {
        const jsonPath = path.join(this.config.outputPath, this.config.jsonFileName);
        let finalData = newData;

        if (fs.existsSync(jsonPath)) {
            const existingData = JSON.parse(await fs.promises.readFile(jsonPath, 'utf8'));
            // Fusionner les données existantes avec les nouvelles données uniques
            finalData = [...existingData];
            newData.forEach(newItem => {
                if (!finalData.some(item => item.url === newItem.url)) {
                    finalData.push(newItem);
                }
            });
        }

        // Trier les données
        finalData.sort((a, b) => {
            if (a.date === 'Date non trouvée') return 1;
            if (b.date === 'Date non trouvée') return -1;
            return this.parseDate(b.date) - this.parseDate(a.date);
        });

        await fs.promises.writeFile(jsonPath, JSON.stringify(finalData, null, 2));
        console.log(`Fichier JSON ${fs.existsSync(jsonPath) ? 'mis à jour' : 'créé'} avec succès.`);
    }

    async run() {
        try {
            await this.initBrowser();
            await this.page.goto(this.config.url, { timeout: this.config.timeout });
            await this.saveHtml();
            const seriesData = await this.scrapeSeriesData();
            await this.updateJsonFile(seriesData);
        } catch (error) {
            console.error('Erreur lors du scraping:', error);
        } finally {
            if (this.browser) await this.browser.close();
        }
    }
}

// Exécution
const scraper = new CardMarketScraper(CONFIG);
scraper.run();