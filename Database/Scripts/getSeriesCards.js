const path = require('path');
const config = require(path.resolve(__dirname, '../../src/config.js'));
const browser = require(config.BrowserFactory);
const ScraperUtils = require(config.BrowserUtils);
const database = require(config.databasePath);
const { returnSeriesCardsToUpdate } = require(path.resolve(config.databaseControl, 'SeriesCardsToUpdate.js'));

class CardScraper {
    constructor() {
        this.browser = null;
        this.concurrentPages = 3;
        this.retryAttempts = 3;
        this.baseRetryDelay = 3000;
        this.minPageDelay = 2000;
        this.maxPageDelay = 5000;
        this.minRequestDelay = 800;
        this.maxRequestDelay = 2000;
    }

    async initialize() {
        this.browser = await browser.getBrowser();
    }

    /**
     * Crée une page avec interception des ressources inutiles
     */
    async createPage() {
        const page = await browser.getPageFromPool();
        
        // Réactiver l'interception si elle a été désactivée
        try {
            await page.setRequestInterception(true);
        } catch (error) {
            // L'interception est peut-être déjà active
        }

        // Supprimer les anciens listeners pour éviter les doublons
        page.removeAllListeners('request');

        // Ajouter le nouveau listener
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

    /**
     * Retry avec backoff exponentiel
     */
    async retry(fn, retryCount = 0) {
        return ScraperUtils.retry(fn, {
            maxAttempts: this.retryAttempts,
            baseDelay: this.baseRetryDelay,
            exponential: true,
            jitter: true,
        });
    }

    /**
     * Délai aléatoire pour éviter la détection
     */
    async randomDelay(min, max) {
        return ScraperUtils.randomDelay(min, max);
    }

    /**
     * Récupère le nombre total de pages
     */
    async getTotalPages(url, numCards) {
        const page = await this.createPage();
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            
            // Délai aléatoire pour simuler un comportement humain
            await this.randomDelay(1500, 3000);
            
            // Attendre les cartes avec timeout
            await page.waitForSelector('[id^="productRow"]', { timeout: 10000 })
                .catch(() => console.log('⚠️  Aucune carte trouvée sur la page'));

            const pageData = await page.evaluate(() => {
                const cardsOnPage = document.querySelectorAll('[id^="productRow"]').length;
                let maxPages = null;
                
                // Recherche optimisée avec regex
                const pageRegex = /Page\s+\d+\s+sur\s+(\d+)/i;
                
                // Chercher dans les spans avec classe mx-1
                const pageSpan = document.querySelector('span.mx-1');
                if (pageSpan) {
                    const match = pageSpan.textContent.match(pageRegex);
                    if (match) maxPages = parseInt(match[1]);
                }
                
                // Fallback: chercher dans tout le body
                if (!maxPages) {
                    const match = document.body.textContent.match(pageRegex);
                    if (match) maxPages = parseInt(match[1]);
                }
                
                return { cardsOnPage, maxPages };
            });

            const totalCards = parseInt(numCards);
            const totalPages = pageData.cardsOnPage > 0 
                ? Math.ceil(totalCards / pageData.cardsOnPage) 
                : 1;

            console.log(`📊 Cartes: ${totalCards} | Pages: ${totalPages} | Cartes/page: ${pageData.cardsOnPage}`);

            return { totalPages, hasPlusSymbol: false };
        } finally {
            await browser.returnPageToPool(page);
        }
    }

    /**
     * Scrape une page individuelle
     */
    async scrapePage(url, page) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await this.randomDelay(500, 1500);
    
        return page.evaluate(() => {
            return Array.from(document.querySelectorAll('[id^="productRow"]')).map(productRow => {
                const cardNameElement = productRow.querySelector('.col-10.col-md-8.px-2.flex-column.align-items-start.justify-content-center a');
                const cardFullTitle = cardNameElement?.textContent.trim() || '';
                const cardName = cardFullTitle.split('(')[0].trim();
    
                return {
                    cardUrl: cardNameElement?.href || '',
                    cardName,
                    cardEngname: productRow.querySelector('.d-block.small.text-muted.fst-italic')?.textContent.trim() || '',
                    cardNumber: '',
                    cardFullTitle,
                    codeSerie: '',
                    cardRarity: productRow.querySelector('.d-none.d-md-flex span[data-original-title]')?.getAttribute('data-original-title') || '',
                    productRowId: productRow.id
                };
            });
        });
    }

    /**
     * Scrape plusieurs pages en parallèle avec pool de pages
     */
    async scrapePages(baseUrl, totalPages, lastCardProductRowId = null) {
        const pagePool = await Promise.all(
            Array(Math.min(totalPages, this.concurrentPages))
                .fill(null)
                .map(() => this.createPage())
        );
        
        const productInfoList = [];
        let shouldStop = false;

        try {
            for (let i = 1; i <= totalPages && !shouldStop; i += this.concurrentPages) {
                const pagePromises = pagePool.map(async (page, index) => {
                    const currentPage = i + index;
                    if (currentPage > totalPages) return null;

                    // Délai aléatoire entre les requêtes
                    await this.randomDelay(
                        this.minRequestDelay * index, 
                        this.maxRequestDelay * index
                    );

                    const url = `${baseUrl}${currentPage}`;
                    console.log(`🔄 Page ${currentPage}/${totalPages}`);

                    return this.retry(async () => {
                        const pageData = await this.scrapePage(url, page);
                        
                        if (lastCardProductRowId && pageData.some(info => info.productRowId === lastCardProductRowId)) {
                            return { pageData, stopScraping: true };
                        }
                        return { pageData, stopScraping: false };
                    });
                });

                const results = await Promise.all(pagePromises);

                results.forEach(result => {
                    if (result?.pageData) {
                        productInfoList.push(...result.pageData);
                        if (result.stopScraping) shouldStop = true;
                    }
                });

                if (!shouldStop && i + this.concurrentPages <= totalPages) {
                    const delay = Math.random() * (this.maxPageDelay - this.minPageDelay) + this.minPageDelay;
                    console.log(`⏸️  Pause de ${(delay/1000).toFixed(1)}s...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        } finally {
            // Retourner toutes les pages au pool
            await Promise.all(pagePool.map(page => browser.returnPageToPool(page)));
        }

        return productInfoList;
    }

    /**
     * Trouve le code série commun dans les titres
     */
    findCommonString(strings) {
        if (!strings.length) return '';

        const parenthesesContents = strings
            .map(str => {
                const match = str.match(/\(([^)]+)\)$/);
                return match ? match[1].trim().split(' ') : [];
            })
            .filter(parts => parts.length > 0);

        if (!parenthesesContents.length) return '';

        const firstParts = parenthesesContents[0];
        return firstParts.find(part => 
            parenthesesContents.every(parts => parts.includes(part))
        ) || '';
    }

    /**
     * Extrait le numéro de carte
     */
    extractCardNumber(cardFullTitle, codeSerie) {
        if (!cardFullTitle || !codeSerie) return '';

        const match = cardFullTitle.match(/\(([^)]+)\)$/);
        if (!match) return '';

        const content = match[1].trim();
        return content.split(' ')
            .filter(part => part !== codeSerie)
            .join(' ');
    }

    /**
     * Met à jour les données avec les nouvelles cartes
     */
    async updateDataWithCards(url, productInfoList) {
        const existingData = database.getData();
        const existingEntry = existingData.find(entry => entry.urlCards === url);

        if (!existingEntry) return;

        existingEntry.cards = existingEntry.cards || [];

        if (productInfoList?.length > 0) {
            console.log(`📝 Traitement de ${productInfoList.length} cartes`);

            const commonString = this.findCommonString(
                productInfoList.map(card => card.cardFullTitle).filter(Boolean)
            );

            if (commonString) {
                productInfoList.forEach(card => {
                    if (card.cardFullTitle) {
                        card.codeSerie = commonString;
                        card.cardNumber = this.extractCardNumber(card.cardFullTitle, commonString);
                    }
                });
            }

            // Fusion avec déduplication par cardUrl
            const cardMap = new Map(
                [...existingEntry.cards, ...productInfoList]
                    .filter(Boolean)
                    .map(card => [card.cardUrl, card])
            );
            
            existingEntry.cards = Array.from(cardMap.values());
        }

        // Sauvegarde différée pour optimiser les I/O
        database.saveDataDeferred(existingData);
    }

    /**
     * Traite une URL de série
     */
    async processUrl(urlCards, numCards, cards) {
        if (numCards === "0" || numCards === 0) {
            console.log(`⏭️  ${urlCards}: pas de cartes (numCards = 0)`);
            return;
        }

        if (cards?.length === parseInt(numCards)) {
            console.log(`✅ ${urlCards}: ${numCards} cartes déjà présentes`);
            return;
        }

        const baseUrlDesc = `${urlCards}?sortBy=collectorsnumber_desc&perSite=100&site=`;
        const { totalPages, hasPlusSymbol } = await this.getTotalPages(baseUrlDesc, numCards);

        if (totalPages === null) return;

        if (hasPlusSymbol) {
            const baseUrlAsc = `${urlCards}?sortBy=collectorsnumber_asc&perSite=100&site=`;
            const descProducts = await this.scrapePages(baseUrlDesc, totalPages);
            const lastCardId = descProducts[descProducts.length - 1]?.productRowId;
            const ascProducts = await this.scrapePages(baseUrlAsc, totalPages, lastCardId);
            await this.updateDataWithCards(urlCards, [...descProducts, ...ascProducts]);
        } else {
            const products = await this.scrapePages(baseUrlDesc, totalPages);
            await this.updateDataWithCards(urlCards, products);
        }
    }

    /**
     * Exécute le scraping complet
     */
    async run() {
        const startTime = Date.now();
        
        try {
            await this.initialize();
            
            const { urlsToScrape } = await returnSeriesCardsToUpdate();
            
            if (urlsToScrape.length === 0) {
                console.log("ℹ️  Aucune URL à scraper.");
                return;
            }

            const allData = database.getData();

            for (const [index, entry] of urlsToScrape.entries()) {
                const { url, numCards } = entry;
                const fullEntry = allData.find(e => e.localName === url);
                
                if (!fullEntry) {
                    console.log(`❌ URL non trouvée: ${url}`);
                    continue;
                }

                console.log(`📦 [${index + 1}/${urlsToScrape.length}] ${fullEntry.urlCards}`);
                console.log('='.repeat(60));
                
                await this.processUrl(fullEntry.urlCards, numCards, fullEntry.cards);
                
                if (numCards !== "0" && numCards !== 0 && index < urlsToScrape.length - 1) {
                    const delay = Math.random() * 3000 + 4000;
                    console.log(`⏸️  Pause de ${(delay/1000).toFixed(1)}s avant la prochaine série...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            // Forcer la sauvegarde finale
            await database.flush();
            console.log('💾 Sauvegarde finale effectuée');

        } catch (error) {
            console.error('❌ Erreur lors de l\'exécution:', error);
            // Sauvegarder même en cas d'erreur
            await database.flush();
        } finally {
            await browser.closeBrowser();
            
            const executionTime = (Date.now() - startTime) / 1000;
            const minutes = Math.floor(executionTime / 60);
            const seconds = (executionTime % 60).toFixed(2);
            
            console.log(`\n${'='.repeat(60)}`);
            console.log(`✅ Exécution terminée en ${minutes}m ${seconds}s`);
            console.log('='.repeat(60));
        }
    }
}

// Exécution
if (require.main === module) {
    const scraper = new CardScraper();
    scraper.run().catch(console.error);
}

module.exports = CardScraper;