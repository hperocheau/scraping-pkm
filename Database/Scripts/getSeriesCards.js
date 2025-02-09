const fs = require('fs').promises;
const puppeteer = require('puppeteer');
const path = require('path');
const browser = require('../../src/BrowserFactory');

class CardScraper {
  constructor(jsonFilePath) {
    this.jsonFilePath = jsonFilePath;
    this.browser = null;
    this.concurrentPages = 3; // Nombre de pages à traiter en parallèle
    this.retryAttempts = 3; // Nombre de tentatives en cas d'échec
    this.retryDelay = 2000; // Délai entre les tentatives en ms
    this.pageGroupDelay = 750; // Délai entre les groupes de pages
    this.requestDelay = 300;   // Délai entre les requêtes individuelles
  }

  async initialize() {
    // Initialiser le browserFactory au lieu de puppeteer directement
    this.browser = await browser.getBrowser();
  }

  async readJsonFile() {
    try {
      const rawData = await fs.readFile(this.jsonFilePath, 'utf-8');
      return JSON.parse(rawData);
    } catch (error) {
      console.error(`Erreur de lecture du fichier JSON: ${error.message}`);
      return [];
    }
  }

  async writeJsonFile(data) {
    try {
      await fs.writeFile(this.jsonFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Erreur d'écriture du fichier JSON: ${error.message}`);
    }
  }

  async createPage() {

    const page = await browser.createPage();
    await page.setRequestInterception(true);
    
    // Optimisation : bloquer les ressources non nécessaires
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
          cardName: cardNameText?.replace(/\s*\([^)]*\)\s*$/g, '').trim(),
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

        // Ajout d'un délai entre les requêtes individuelles
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

      // Ajout d'un délai entre les groupes de pages
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
    
    let commonStr = '';
    const firstString = strings[0];
    
    for (let i = 0; i < firstString.length; i++) {
      for (let j = i + 1; j <= firstString.length; j++) {
        const substring = firstString.substring(i, j);
        if (substring.length > 1 && // Ignore single characters
            strings.every(str => str.includes(substring))) {
          if (substring.length > commonStr.length) {
            commonStr = substring;
          }
        }
      }
    }
    
    // Nettoyer les parenthèses de la chaîne commune trouvée
    return commonStr.replace(/[()]/g, '').trim();
  }

  extractCardNumber(cardFullTitle, codeSerie) {
    // Trouve la dernière parenthèse
    const match = cardFullTitle.match(/\(([^)]+)\)$/);
    if (match && match[1]) {
      // Contenu de la dernière parenthèse
      const parenthesesContent = match[1];
      // Retire le codeSerie du contenu de la parenthèse et nettoie les espaces
      return parenthesesContent.replace(codeSerie, '').trim();
    }
    return '';
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
          cardName: cardNameText?.replace(/\s*\([^)]*\)\s*$/g, '').trim(),
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

  async updateJsonFile(url, productInfoList) {
    const existingData = await this.readJsonFile();
    const existingEntry = existingData.find((entry) => entry.urlCards === url);

    if (existingEntry) {
      if (!Array.isArray(existingEntry.cards)) {
        existingEntry.cards = [];
      }

      if (productInfoList.length > 0) {
        const allSeries = productInfoList.map(card => card.cardFullTitle);
        const commonString = this.findCommonString(allSeries);
        
        // Mise à jour des cartes avec le code de série et le numéro
        productInfoList.forEach(card => {
          card.codeSerie = commonString;
          card.cardNumber = this.extractCardNumber(card.cardFullTitle, commonString);
        });
      }

      const uniqueProductInfoList = Array.from(
        new Map(
          [...existingEntry.cards, ...productInfoList]
            .map(card => [card.cardUrl, card])
        ).values()
      ).sort((a, b) => {
        const numA = parseInt(a.cardNumber) || 0;
        const numB = parseInt(b.cardNumber) || 0;
        return numA - numB;
      });

      existingEntry.cards = uniqueProductInfoList;
    }

    await this.writeJsonFile(existingData);
  }


  async processUrl(entry) {
    const { urlCards, numCards, cards } = entry;

        // Vérification rapide pour numCards = 0
    if (numCards === "0" || numCards === 0) {
      console.log(`${urlCards}: pas de cartes à traiter (numCards = 0)`);
      return;
    }

    if (cards?.length === parseInt(numCards)) {
      console.log(`${urlCards}: nombre de cartes correspond (${numCards})`);
      return;
    }

    console.log(`Traitement de ${urlCards} (${cards?.length || 0}/${numCards} cartes)`);

    const baseUrlDesc = `${urlCards}?sortBy=collectorsnumber_desc&site=`;
    const { totalPages, hasPlusSymbol } = await this.getTotalPages(baseUrlDesc);

    if (totalPages === null) return;

    if (hasPlusSymbol) {
      const baseUrlAsc = `${urlCards}?sortBy=collectorsnumber_asc&site=`;
      const descProducts = await this.scrapePages(baseUrlDesc, totalPages);
      const lastCardId = descProducts[descProducts.length - 1]?.productRowId;
      const ascProducts = await this.scrapePages(baseUrlAsc, totalPages, lastCardId);
      await this.updateJsonFile(urlCards, [...descProducts, ...ascProducts]);
    } else {
      const products = await this.scrapePages(baseUrlDesc, totalPages);
      await this.updateJsonFile(urlCards, products);
    }
  }

  async run() {
    const startTime = Date.now();
    try {
      await this.initialize();
      const dataArray = await this.readJsonFile();

      for (const entry of dataArray) {
        await this.processUrl(entry);
        if (entry.numCards !== "0" && entry.numCards !== 0 && 
          (!entry.cards || entry.cards.length !== parseInt(entry.numCards))) {
          console.log("Attente de 5 secondes avant le prochain traitement...");
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    } catch (error) {
      console.error('Erreur lors de l\'exécution:', error);
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
      const executionTime = (Date.now() - startTime) / 1000;
      console.log(`Exécution terminée en ${executionTime.toFixed(2)} secondes`);
    }
  }
}

const scraper = new CardScraper(path.join(__dirname, '../Test2.json'));
scraper.run();