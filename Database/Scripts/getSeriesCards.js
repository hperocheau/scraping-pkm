const puppeteer = require('puppeteer');
const path = require('path');
const browser = require('../../src/BrowserFactory');
const config = require(path.resolve(__dirname, '../../src/config.js'));
const db = require(config.databasePath);

//const db = require('.Database/database.js');

class CardScraper {
    constructor() {
        this.browser = null;
        this.concurrentPages = 3;
        this.retryAttempts = 3;
        this.retryDelay = 2000;
        this.pageGroupDelay = 750;
        this.requestDelay = 300;
    }

    async initialize() {
        this.browser = await browser.getBrowser();
    }

    async createPage() {
        const page = await browser.createPage();
        await page.setRequestInterception(true);

        page.on('request', (request) => {
            const resourceType = request.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                request.abort();
            } else {
                request.continue();
            }
        });

        return page;
    }

    async retry(fn, retryCount = 0) {
        try {
            return await fn();
        } catch (error) {
            if (retryCount < this.retryAttempts) {
                console.log(`Tentative échouée, nouvelle tentative dans ${this.retryDelay/1000}s...`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.retry(fn, retryCount + 1);
            }
            throw error;
        }
    }

    async getTotalPages(url) {
        const page = await this.createPage();
        try {
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            const pageCountElement = await page.$('.mx-1');
            const pageCountText = pageCountElement
                ? await pageCountElement.evaluate(span => span.textContent.trim())
                : '1';

            const pageCountMatches = pageCountText.match(/(\d+\s*\+*)$/);
            const totalPages = pageCountMatches ? parseInt(pageCountMatches[1].replace('+', '')) : 1;
            const hasPlusSymbol = pageCountText.includes('+');

            return { totalPages, hasPlusSymbol };
        } finally {
            await page.close();
        }
    }

    async scrapePage(url, page) {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.waitForTimeout(Math.random() * 1000 + 500);

        return page.evaluate(() => {
            return Array.from(document.querySelectorAll('[id^="productRow"]')).map(productRow => {
                const cardNameElement = productRow.querySelector('.col-10.col-md-8.px-2.flex-column.align-items-start.justify-content-center a');
                const cardNameText = cardNameElement?.textContent.trim();

                return {
                    cardUrl: cardNameElement?.href,
                    cardName: cardNameText?.replace(/\s* $[^)]*$ \s*$/g, '').trim(),
                    cardEngname: productRow.querySelector('.d-block.small.text-muted.fst-italic')?.textContent.trim(),
                    cardNumber: '',
                    cardFullTitle: cardNameElement?.textContent.trim() || '',
                    codeSerie: '',
                    cardRarity: productRow.querySelector('.d-none.d-md-flex span[data-original-title]')?.getAttribute('data-original-title'),
                    productRowId: productRow.id
                };
            });
        });
    }

    async scrapePages(baseUrl, totalPages, lastCardProductRowId = null) {
        const pages = new Array(Math.min(totalPages, this.concurrentPages))
            .fill(null)
            .map(() => this.createPage());
        const initializedPages = await Promise.all(pages);
        const productInfoList = [];

        for (let i = 1; i <= totalPages; i += this.concurrentPages) {
            const pagePromises = initializedPages.map(async (page, index) => {
                const currentPage = i + index;
                if (currentPage > totalPages) return null;

                await new Promise(resolve => setTimeout(resolve, this.requestDelay * index));

                const url = `${baseUrl}${currentPage}`;
                console.log(`Traitement de la page ${currentPage}/${totalPages}`);

                return this.retry(async () => {
                    const pageData = await this.scrapePage(url, page);
                    if (lastCardProductRowId && pageData.some(info => info.productRowId === lastCardProductRowId)) {
                        return { pageData, stopScraping: true };
                    }
                    return { pageData, stopScraping: false };
                });
            });

            const results = await Promise.all(pagePromises);
            let shouldStop = false;

            results.forEach(result => {
                if (result && result.pageData) {
                    productInfoList.push(...result.pageData);
                    if (result.stopScraping) shouldStop = true;
                }
            });

            if (shouldStop) break;

            if (i + this.concurrentPages <= totalPages) {
                console.log(`Pause de ${this.pageGroupDelay/1000} secondes entre les groupes de pages...`);
                await new Promise(resolve => setTimeout(resolve, this.pageGroupDelay));
            }
        }

        await Promise.all(initializedPages.map(page => page.close()));
        return productInfoList;
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

    async processData() {
        return db.getData();
    }

    async updateData(updatedData) {
        return db.saveData(updatedData);
    }

    async updateDataWithCards(url, productInfoList) {
        const existingData = await this.processData();
        const existingEntry = existingData.find((entry) => entry.urlCards === url);

        if (existingEntry) {
            if (!Array.isArray(existingEntry.cards)) {
                existingEntry.cards = [];
            }

            if (productInfoList && productInfoList.length > 0) {
                console.log("Nombre de cartes à traiter:", productInfoList.length);

                const allSeries = productInfoList
                    .map(card => card.cardFullTitle)
                    .filter(Boolean);

                const commonString = this.findCommonString(allSeries);
                console.log("Code série trouvé:", commonString);

                if (commonString) {
                    productInfoList.forEach(card => {
                        if (card.cardFullTitle) {
                            card.codeSerie = commonString;
                            card.cardNumber = this.extractCardNumber(card.cardFullTitle, commonString);
                        }
                    });
                }
            }

            const uniqueProductInfoList = Array.from(
                new Map(
                    [...existingEntry.cards, ...productInfoList]
                    .filter(Boolean)
                    .map(card => [card.cardUrl, card])
                ).values()
            );

            existingEntry.cards = uniqueProductInfoList;
        }

        await this.updateData(existingData);
    }

    async processUrl(entry) {
        const { urlCards, numCards, cards } = entry;

        if (numCards === "0" || numCards === 0) {
            console.log(`${urlCards}: pas de cartes à traiter (numCards = 0)`);
            return;
        }

        if (cards?.length === parseInt(numCards)) {
            console.log(`${urlCards}: nombre de cartes correspond (${numCards})`);
            return;
        }

        const baseUrlDesc = `${urlCards}?sortBy=collectorsnumber_desc&site=`;
        const { totalPages, hasPlusSymbol } = await this.getTotalPages(baseUrlDesc);

        if (totalPages === null) return;

        if (hasPlusSymbol) {
            const baseUrlAsc = `${urlCards}?sortBy=collectorsnumber_asc&site=`;
            const descProducts = await this.scrapePages(baseUrlDesc, totalPages);
            const lastCardId = descProducts[descProducts.length - 1]?.productRowId;
            const ascProducts = await this.scrapePages(baseUrlAsc, totalPages, lastCardId);
            await this.updateDataWithCards(urlCards, [...descProducts, ...ascProducts]);
        } else {
            const products = await this.scrapePages(baseUrlDesc, totalPages);
            await this.updateDataWithCards(urlCards, products);
        }
    }

    async run() {
        const startTime = Date.now();
        try {
            await this.initialize();
            const dataArray = await this.processData();

            for (const entry of dataArray) {
                await this.processUrl(entry);
                if (entry.numCards !== "0" && entry.numCards !== 0 &&
                    (!entry.cards || entry.cards.length !== parseInt(entry.numCards))) {
                    console.log("Attente avant le prochain traitement...");
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        } catch (error) {
            console.error('Erreur lors de l\'exécution:', error);
        } finally {
            if (this.browser) {
                await browser.closeBrowser();
            }
            const executionTime = (Date.now() - startTime) / 1000;
            console.log(`Exécution terminée en ${executionTime.toFixed(2)} secondes`);
        }
    }
}

// Exécution
if (require.main === module) {
    const scraper = new CardScraper();
    scraper.run()
        .catch(console.error);
}

module.exports = CardScraper;