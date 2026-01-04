const path = require('path');
const config = require(path.resolve(__dirname, '../../src/config.js'));
const browser = require(config.BrowserFactory);
const ScraperUtils = require(config.BrowserUtils);
const database = require(config.databasePath);
const { parseCardMarketDate, sortSeriesByDate } = require(config.parseDate);

const CONFIG = {
  url: 'https://www.cardmarket.com/fr/Pokemon/Expansions',
  timeout: 120000,
  maxWaitCloudflare: 30000,
  accordionDelay: 2000,
  pageLoadDelay: 3000,
};

class CardMarketScraper {
  constructor(config) {
    this.config = config;
    this.page = null;
  }

  /**
   * Parse une date CardMarket
   */
  parseDate(dateStr) {
    return parseCardMarketDate(dateStr);
  }

  /**
   * Initialise la page avec pool
   */
  async initPage() {
    await browser.getBrowser();
    this.page = await browser.getPageFromPool();
  }

  /**
   * Vérifie si la page contient un challenge CloudFlare
   */
  async checkCloudflareChallenge() {
    const isChallenge = await this.page.evaluate(() => {
      return document.body.innerHTML.includes('Verify you are human') || 
             document.body.innerHTML.includes('challenge-platform') ||
             document.body.innerHTML.includes('cf-turnstile');
    });
    
    if (isChallenge) {
      console.log('🔒 Challenge CloudFlare détecté, attente de résolution...');
      
      try {
        await this.page.waitForFunction(
          () => {
            return !document.body.innerHTML.includes('Verify you are human') &&
                   document.querySelectorAll('div[data-url]').length > 0;
          },
          { timeout: this.config.maxWaitCloudflare }
        );
        console.log('✅ Challenge résolu');
        return true;
      } catch (error) {
        console.log('❌ Challenge non résolu automatiquement');
        console.log('💡 Conseil: Augmentez les délais ou utilisez puppeteer-extra-plugin-stealth');
        return false;
      }
    }
    
    return true;
  }

  /**
   * Attend et vérifie le chargement des éléments
   */
  async waitForElements() {
    try {
      await this.page.waitForSelector('div[data-url]', { timeout: 30000 });
      console.log('✅ Éléments data-url trouvés');
      return true;
    } catch (error) {
      console.log('⚠️ Timeout en attendant les éléments data-url');
      
      // Debug HTML
      const bodyHTML = await this.page.evaluate(() => document.body.innerHTML);
      console.log('📄 Longueur du HTML chargé:', bodyHTML.length);
      console.log('📄 Aperçu HTML:', bodyHTML.substring(0, 500));
      
      return false;
    }
  }

  /**
   * Collecte des informations de debug sur la structure de la page
   */
  async getDebugInfo() {
    return await this.page.evaluate(() => {
      const sections = document.querySelectorAll('section.expansion-group');
      const collapseElements = document.querySelectorAll('[id^="collapse"]');
      const dataUrlElements = document.querySelectorAll('div[data-url]');
      const targetElements = document.querySelectorAll('[id^="collapse"] div[data-url]');
      const alternativeSelector = document.querySelectorAll('.collapse div[data-url]');
      
      return {
        sectionsCount: sections.length,
        collapseCount: collapseElements.length,
        dataUrlCount: dataUrlElements.length,
        targetCount: targetElements.length,
        alternativeCount: alternativeSelector.length,
        sampleDataUrl: dataUrlElements[0]?.outerHTML?.substring(0, 300) || 'Aucun élément data-url',
        sampleCollapse: collapseElements[0]?.outerHTML?.substring(0, 300) || 'Aucun élément collapse'
      };
    });
  }

  /**
   * Ouvre tous les accordéons Bootstrap
   */
  async openAllAccordions() {
    await this.page.evaluate(() => {
      const buttons = document.querySelectorAll('[data-bs-toggle="collapse"]');
      console.log(`Tentative d'ouverture de ${buttons.length} accordéons Bootstrap 5`);
      buttons.forEach(button => {
        const target = button.getAttribute('data-bs-target');
        if (target) {
          const collapseDiv = document.querySelector(target);
          if (collapseDiv && !collapseDiv.classList.contains('show')) {
            button.click();
          }
        }
      });
    });

    await new Promise(resolve => setTimeout(resolve, this.config.accordionDelay));
  }

  /**
   * Scrape les données des séries
   */
  async scrapeSeriesData() {
    // Vérifier CloudFlare
    const cfPassed = await this.checkCloudflareChallenge();
    if (!cfPassed) {
      throw new Error('CloudFlare challenge non résolu');
    }

    // Attendre les éléments
    await this.waitForElements();

    // Délai supplémentaire pour s'assurer du chargement
    await new Promise(resolve => setTimeout(resolve, this.config.pageLoadDelay));

    // Debug info
    const debugInfo = await this.getDebugInfo();
    console.log('📊 Informations de débogage:');
    console.log(`  - Sections expansion-group: ${debugInfo.sectionsCount}`);
    console.log(`  - Éléments [id^="collapse"]: ${debugInfo.collapseCount}`);
    console.log(`  - Éléments div[data-url]: ${debugInfo.dataUrlCount}`);
    console.log(`  - Sélecteur ciblé: ${debugInfo.targetCount}`);
    console.log(`  - Sélecteur alternatif: ${debugInfo.alternativeCount}`);

    // Ouvrir les accordéons
    await this.openAllAccordions();

    // Extraire les données
    const seriesData = await this.page.evaluate(() => {
      const dataInfo = [];
      
      // Essayer le sélecteur principal
      let elements = document.querySelectorAll('[id^="collapse"] div[data-url]');
      console.log(`Sélecteur [id^="collapse"] div[data-url]: ${elements.length} éléments`);
      
      // Fallback sur sélecteur alternatif
      if (elements.length === 0) {
        elements = document.querySelectorAll('div[data-url]');
        console.log(`Sélecteur alternatif div[data-url]: ${elements.length} éléments`);
      }
      
      console.log(`✅ Nombre total d'entrées trouvées: ${elements.length}`);
      
      elements.forEach(subDiv => {
        const urlParts = subDiv.getAttribute('data-url');
        if (urlParts) {
          const baseUrl = 'https://www.cardmarket.com';
          dataInfo.push({
            localName: subDiv.getAttribute('data-local-name'),
            url: `${baseUrl}${urlParts}`,
            urlCards: `${baseUrl}${urlParts.replace('Expansions', 'Products/Singles')}`,
            date: subDiv.querySelector('.col-3.text-center.d-none.d-md-block')?.textContent.trim() || 'Date non trouvée'
          });
        }
      });
      
      return dataInfo;
    });

    return seriesData;
  }

  /**
   * Met à jour la base de données avec les nouvelles séries
   */
  async updateData(newData) {
    const existingData = database.getData();
    let addedCount = 0;
    let updatedCount = 0;

    const existingDataMap = new Map(existingData.map(item => [item.url, item]));

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

    const finalData = sortSeriesByDate(Array.from(existingDataMap.values()));
    
    // Sauvegarde avec la nouvelle API
    await database.saveData(finalData);

    console.log(`
📊 Mise à jour de la base de données :
  - Total d'entrées : ${finalData.length}
  - Nouvelles séries : ${addedCount}
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

  /**
   * Valide et corrige les données
   */
  async validateAndFixData(scrapedData) {
    console.log('\n🔍 Validation des données...');
    
    const data = database.getData();
    let fixedCount = 0;
    let duplicatesRemoved = 0;
    
    // 1. Supprimer les doublons basés sur l'URL
    const uniqueMap = new Map();
    for (const item of data) {
      if (uniqueMap.has(item.url)) {
        duplicatesRemoved++;
        console.log(`⚠️ Doublon supprimé: ${item.localName || item.url}`);
      } else {
        uniqueMap.set(item.url, item);
      }
    }
    
    // 2. Vérifier et corriger les clés manquantes
    const scrapedDataMap = new Map(scrapedData.map(item => [item.url, item]));
    
    for (const [url, item] of uniqueMap) {
      const needsFix = !item.localName || !item.url || !item.urlCards;
      
      if (needsFix) {
        const scrapedItem = scrapedDataMap.get(url);
        
        if (scrapedItem) {
          uniqueMap.set(url, {
            ...item,
            localName: item.localName || scrapedItem.localName,
            url: item.url || scrapedItem.url,
            urlCards: item.urlCards || scrapedItem.urlCards
          });
          fixedCount++;
          console.log(`✏️ Entrée corrigée: ${item.localName || url}`);
        } else {
          console.log(`⚠️ Impossible de corriger: ${url}`);
        }
      }
    }
    
    // 3. Sauvegarder les données nettoyées
    const cleanedData = sortSeriesByDate(Array.from(uniqueMap.values()));
    await database.saveData(cleanedData);
    
    console.log(`
✅ Validation terminée :
  - Doublons supprimés : ${duplicatesRemoved}
  - Entrées corrigées : ${fixedCount}
  - Total d'entrées valides : ${cleanedData.length}
    `);
    
    return {
      duplicatesRemoved,
      fixedCount,
      totalValid: cleanedData.length
    };
  }

  /**
   * Exécute le scraping complet
   */
  async run() {
    const startTime = Date.now();

    try {
      await this.initPage();
      
      console.log(`\n🚀 CardMarket Scraper\n`);
      console.log(`🌐 Navigation vers ${this.config.url}...`);
      
      // Navigation avec retry
      await ScraperUtils.retry(
        async () => {
          await this.page.goto(this.config.url, {
            timeout: this.config.timeout,
            waitUntil: 'domcontentloaded'
          });
        },
        {
          maxAttempts: 3,
          baseDelay: 5000,
          exponential: true,
        }
      );

      console.log('✅ Page chargée');

      // Scraping
      const seriesData = await this.scrapeSeriesData();
      console.log(`\n📊 ${seriesData.length} séries scrapées\n`);
      
      if (seriesData.length === 0) {
        throw new Error('Aucune série trouvée. Possible blocage CloudFlare.');
      }

      // Mise à jour
      const result = await this.updateData(seriesData);
      
      // Validation
      const validationResult = await this.validateAndFixData(seriesData);
      
      const executionTime = (Date.now() - startTime) / 1000;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`✅ Scraping terminé en ${ScraperUtils.formatTime(executionTime)}`);
      console.log('='.repeat(60));
      
      return {
        ...result,
        validation: validationResult
      };

    } catch (error) {
      console.error('❌ Erreur lors du scraping:', error.message);
      throw error;
    } finally {
      if (this.page) {
        await browser.returnPageToPool(this.page);
        this.page = null;
      }
      await browser.closeBrowser();
    }
  }
}

module.exports = { CardMarketScraper };

if (require.main === module) {
  const scraper = new CardMarketScraper(CONFIG);
  scraper.run().catch(console.error);
}