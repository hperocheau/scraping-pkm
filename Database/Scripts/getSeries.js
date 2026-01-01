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
    
    // Masquer les traces d'automatisation
    await this.page.evaluateOnNewDocument(() => {
      // Supprimer les propriétés webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      
      // Ajouter des plugins pour sembler plus humain
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // Masquer l'automatisation
      window.chrome = {
        runtime: {},
      };
      
      Object.defineProperty(navigator, 'languages', {
        get: () => ['fr-FR', 'fr', 'en-US', 'en'],
      });
    });
    
    // Définir un User-Agent réaliste
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    
    // Définir des en-têtes HTTP supplémentaires
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    });
  }

  async scrapeSeriesData() {
        
    // Vérifier si on a un challenge Cloudflare
    const isChallenge = await this.page.evaluate(() => {
      return document.body.innerHTML.includes('Verify you are human') || 
             document.body.innerHTML.includes('challenge-platform') ||
             document.body.innerHTML.includes('cf-turnstile');
    });
    
    if (isChallenge) {
      console.log('🔒 Challenge Cloudflare détecté. Attente de résolution (jusqu\'à 30 secondes)...');
      
      // Attendre que le challenge soit résolu
      try {
        await this.page.waitForFunction(
          () => {
            return !document.body.innerHTML.includes('Verify you are human') &&
                   document.querySelectorAll('div[data-url]').length > 0;
          },
          { timeout: 30000 }
        );
        console.log('✅ Challenge résolu, contenu chargé');
      } catch (error) {
        console.log('❌ Le challenge n\'a pas pu être résolu automatiquement');
        console.log('💡 Conseil: Le site peut bloquer les bots. Essayez d\'ajouter un délai ou utilisez puppeteer-extra-plugin-stealth');
      }
    }
    
    // Attendre les éléments data-url
    try {
      await this.page.waitForSelector('div[data-url]', { timeout: 30000 });
      console.log('✅ Éléments data-url trouvés');
    } catch (error) {
      console.log('⚠️ Timeout en attendant les éléments data-url');
      
      // Capturer le HTML pour débogage
      const bodyHTML = await this.page.evaluate(() => document.body.innerHTML);
      console.log('📄 Longueur du HTML chargé:', bodyHTML.length);
      console.log('📄 Aperçu HTML:', bodyHTML.substring(0, 1000));
    }

    // Attendre un peu plus pour s'assurer que tout est chargé
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Débogage: vérifier la structure de la page
    const debugInfo = await this.page.evaluate(() => {
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

    console.log('📊 Informations de débogage:');
    console.log(`  - Sections expansion-group: ${debugInfo.sectionsCount}`);
    console.log(`  - Éléments [id^="collapse"]: ${debugInfo.collapseCount}`);
    console.log(`  - Éléments div[data-url]: ${debugInfo.dataUrlCount}`);
    console.log(`  - Sélecteur [id^="collapse"] div[data-url]: ${debugInfo.targetCount}`);
    console.log(`  - Sélecteur alternatif .collapse div[data-url]: ${debugInfo.alternativeCount}`);

    // Tenter d'ouvrir tous les accordéons (Bootstrap 5)
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

    // Attendre que les accordéons s'ouvrent
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Scraper les données
    return await this.page.evaluate(() => {
      const dataInfo = [];
      
      // Essayer le sélecteur original
      let elements = document.querySelectorAll('[id^="collapse"] div[data-url]');
      console.log(`Sélecteur [id^="collapse"] div[data-url]: ${elements.length} éléments`);
      
      // Si pas de résultats, essayer un sélecteur alternatif
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
  }

  async updateData(newData) {
    const existingData = db.getData();
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
    db.saveData(finalData);

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

  async validateAndFixData(scrapedData) {
    console.log('\n🔍 Validation des données...');
    
    const data = db.getData();
    let fixedCount = 0;
    let duplicatesRemoved = 0;
    
    // 1. Supprimer les doublons basés sur l'URL
    const uniqueMap = new Map();
    for (const item of data) {
      if (uniqueMap.has(item.url)) {
        duplicatesRemoved++;
        console.log(`⚠️ Doublon détecté et supprimé: ${item.url}`);
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
          // Corriger avec les données scrapées
          uniqueMap.set(url, {
            ...item,
            localName: item.localName || scrapedItem.localName,
            url: item.url || scrapedItem.url,
            urlCards: item.urlCards || scrapedItem.urlCards
          });
          fixedCount++;
          console.log(`✏️ Entrée corrigée: ${url}`);
        } else {
          console.log(`⚠️ Impossible de corriger l'entrée (non trouvée dans les données scrapées): ${url}`);
        }
      }
    }
    
    // 3. Sauvegarder les données nettoyées
    const cleanedData = sortSeriesByDate(Array.from(uniqueMap.values()));
    db.saveData(cleanedData);
    
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

  async run() {
    try {
      console.time('Scraping duration');
      await this.initPage();
      
      console.log(`🌐 Navigation vers ${this.config.url}...`);
      
      await this.page.goto(this.config.url, {
        timeout: this.config.timeout,
        waitUntil: 'networkidle2'
      });
      console.log('✅ Page chargée');

      const seriesData = await this.scrapeSeriesData();
      console.log(`\n📊 Nombre d'entrées scrapées: ${seriesData.length}\n`);
      
      if (seriesData.length === 0) {
        console.log('⚠️ ATTENTION: Aucune donnée n\'a été scrapée.');
        console.log('💡 Le site utilise Cloudflare qui peut bloquer les scrapers.');
        console.log('💡 Solutions possibles:');
        console.log('   1. Installer puppeteer-extra-plugin-stealth');
        console.log('   2. Utiliser un proxy résidentiel');
        console.log('   3. Ajouter des cookies de session valides');
      }
      
      const result = await this.updateData(seriesData);
      
      // Validation et correction des données
      const validationResult = await this.validateAndFixData(seriesData);
      
      console.timeEnd('Scraping duration');
      
      return {
        ...result,
        validation: validationResult
      };
    } catch (error) {
      console.error('Erreur lors du scraping:', error);
      throw error;
    } finally {
      await browserFactory.closeBrowser();
    }
  }
}

module.exports = { CardMarketScraper };

if (require.main === module) {
  const scraper = new CardMarketScraper(CONFIG);
  scraper.run().catch(console.error);
}