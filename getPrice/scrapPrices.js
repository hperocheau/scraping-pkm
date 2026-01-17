const xlsx = require('xlsx');
const moment = require('moment');
const path = require('path');
const config = require(path.resolve(__dirname, '../src/config.js'));
const browser = require(path.resolve(config.BrowserFactory));
const ScraperUtils = require(path.resolve(config.BrowserUtils));
const conf = require('../src/configPrices');

/**
 * Utilitaires pour le traitement des données.
 */
const Utils = {
  /**
   * Convertit une chaîne de texte représentant un prix en nombre flottant
   */
  formatPrice(priceText) {
    if (!priceText) return NaN;
    const cleanPrice = priceText
      .replace(/[^\d,\.]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    return parseFloat(cleanPrice);
  },

  /**
   * Extrait le contenu entre parenthèses d'une chaîne de texte
   */
  extractContentInParentheses(text) {
    if (!text) return null;
    const match = text.match(/\(([^)]+)\)/);
    return match ? match[1].trim() : null;
  },

  /**
   * Normalise une chaîne (supprime les accents)
   */
  normalizeString(text) {
    if (!text) return '';
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  },

  /**
   * Vérifie si une chaîne contient un terme, avec ou sans accents
   */
  containsWithAccentVariants(text, term) {
    if (!text || !term) return false;
    return this.normalizeString(text).includes(this.normalizeString(term));
  }
};

class PriceProcessor {
  constructor() {
    this.workbook = xlsx.readFile(config.xlsxFile);
    this.currentDate = moment().format("DD_MM_YYYY");
    this.sheet = null;
    this.page = null;
    this.processedCount = 0;
    this.errorCount = 0;
    this.lastSaveCount = 0;
    this.retryAttempts = 3;
    this.stats = {
      startTime: null,
      endTime: null,
      totalRows: 0,
      processedSuccessfully: 0,
      skipped: 0,
      errors: 0
    };
  }

  /**
   * Récupère la valeur d'une cellule d'une feuille Excel
   */
  getCellValue(sheet, cell) {
    const cellRef = sheet[cell];
    return cellRef ? (cellRef.v ?? '') : '';
  }

  /**
   * Sauvegarde le workbook sur le disque
   */
  async saveWorkbook() {
    try {
      xlsx.writeFile(this.workbook, config.xlsxFile);
      console.log(`💾 Sauvegarde Excel (${this.processedCount} lignes traitées)`);
      return true;
    } catch (error) {
      console.error('❌ Erreur sauvegarde Excel:', error.message);
      return false;
    }
  }

  /**
   * Vérifie si une sauvegarde est nécessaire et la déclenche
   */
  async checkAndSaveProgress() {
    if (this.processedCount - this.lastSaveCount >= conf.PRICE_CONFIG.saveInterval) {
      await this.saveWorkbook();
      this.lastSaveCount = this.processedCount;
    }
  }

  /**
   * Charge tous les résultats disponibles en cliquant sur "Load More"
   */
  async loadAllResults() {
    console.log('⏳ Chargement des résultats supplémentaires...');
    
    for (let attempt = 0; attempt < conf.PRICE_CONFIG.maxLoadAttempts; attempt++) {
      const buttonVisible = await this.page.evaluate(() => {
        const button = document.getElementById('loadMoreButton');
        if (!button) return false;
        
        const style = window.getComputedStyle(button);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      
      if (!buttonVisible) {
        console.log('✅ Tous les résultats chargés');
        return true;
      }
      
      try {
        await this.page.evaluate(() => {
          document.getElementById('loadMoreButton').click();
        });
        console.log(`   Clic "Load More" (${attempt + 1}/${conf.PRICE_CONFIG.maxLoadAttempts})`);
        await ScraperUtils.randomDelay(
          conf.PRICE_CONFIG.loadMoreTimeout, 
          conf.PRICE_CONFIG.loadMoreTimeout + 1000
        );
      } catch (error) {
        console.error(`⚠️ Erreur chargement (tentative ${attempt + 1}):`, error.message);
      }
    }
    
    console.log(`⚠️ Nombre max de tentatives atteint (${conf.PRICE_CONFIG.maxLoadAttempts})`);
    return true;
  }

  /**
   * Traite une ligne du fichier Excel
   */
  async processRow(rowIndex) {
    // Vérifier si déjà rempli
    const existingValue = this.getCellValue(this.sheet, `G${rowIndex}`);
    if (existingValue) {
      console.log(`⏭️  Ligne ${rowIndex} ignorée - Déjà remplie: ${existingValue}`);
      this.stats.skipped++;
      return;
    }

    const url = this.getCellValue(this.sheet, `F${rowIndex}`);
    if (!url) {
      console.log(`⏭️  Ligne ${rowIndex} ignorée - Aucune URL`);
      this.stats.skipped++;
      return;
    }

    const condition = this.getCellValue(this.sheet, `E${rowIndex}`);
    const cellAValue = this.getCellValue(this.sheet, `A${rowIndex}`);
    const specificFilter = Utils.extractContentInParentheses(cellAValue);

    try {
      console.log(`\n🔄 Ligne ${rowIndex}: ${url}`);
      
      // Navigation avec retry
      await ScraperUtils.retry(
        async () => {
          await this.page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: conf.PRICE_CONFIG.pageNavigationTimeout
          });
        },
        {
          maxAttempts: this.retryAttempts,
          baseDelay: 3000,
          exponential: true,
        }
      );

      await ScraperUtils.randomDelay(500, 1000);
      
      // Premier essai avec les résultats actuels
      let averagePrice = await this.calculateAveragePrice(condition, specificFilter, rowIndex, false);
      
      // Si aucun prix valide, charger plus de résultats
      if (averagePrice === null) {
        console.log(`   Aucun prix trouvé, chargement de plus de résultats...`);
        await this.loadAllResults();
        averagePrice = await this.calculateAveragePrice(condition, specificFilter, rowIndex, true);
      }

      // Vérification du nombre d'articles
      const articlesCount = await this.page.evaluate(selector => 
        document.querySelectorAll(selector).length, 
        conf.PRICE_CONFIG.selectors.articleRow
      );

      // Mise à jour de la cellule
      if (averagePrice !== null) {
        this.sheet[`G${rowIndex}`] = { v: averagePrice, t: 'n' };
        console.log(`✅ Ligne ${rowIndex}: Prix moyen = ${averagePrice}€`);
        this.processedCount++;
        this.stats.processedSuccessfully++;
      } else if (articlesCount > 0) {
        this.sheet[`G${rowIndex}`] = { v: 'price calculation failed' };
        console.log(`⚠️  Ligne ${rowIndex}: Échec calcul (${articlesCount} articles)`);
        this.errorCount++;
        this.stats.errors++;
      } else {
        this.sheet[`G${rowIndex}`] = { v: '' };
        console.log(`⚠️  Ligne ${rowIndex}: Aucun article trouvé`);
        this.errorCount++;
        this.stats.errors++;
      }
      
      await this.checkAndSaveProgress();
      
    } catch (error) {
      console.error(`❌ Erreur ligne ${rowIndex}:`, error.message);
      this.sheet[`G${rowIndex}`] = { v: '' };
      this.errorCount++;
      this.stats.errors++;
      await this.checkAndSaveProgress();
    }
  }

  /**
   * Calcule le prix moyen basé sur les éléments de la page
   */
  async calculateAveragePrice(cardCondition, specificFilter, rowIndex, isSecondAttempt = false) {
    try {
      // Attendre les éléments de prix
      try {
        await this.page.waitForSelector(conf.PRICE_CONFIG.selectors.articleRow, {
          timeout: conf.PRICE_CONFIG.waitTimeout
        });
      } catch (e) {
        // Timeout, continuer quand même
      }
      
      // Récupérer les prix et conditions
      let pricesData = await this.page.evaluate(selectors => {
        const articles = Array.from(document.querySelectorAll(selectors.articleRow));
        return articles.map(article => ({
          price: article.querySelector(selectors.priceContainer)?.textContent.trim() || null,
          condition: article.querySelector(selectors.conditionBadge)?.textContent.trim() || null,
          comments: article.querySelector(selectors.productComments)?.textContent.toLowerCase() || ''
        }));
      }, conf.PRICE_CONFIG.selectors);
      
      if (!pricesData.length) {
        return null;
      }
  
      // 1. Vérifier si l'état recherché existe
      const hasDesiredCondition = pricesData.some(data => data.condition === cardCondition);
      
      if (!hasDesiredCondition) {
        return null;
      }
      
      // 2. Si specificFilter défini, vérifier s'il existe
      if (specificFilter) {
        const hasSpecificFilter = pricesData.some(data => 
          Utils.containsWithAccentVariants(data.comments, specificFilter)
        );
        
        if (!hasSpecificFilter) {
          // Tenter de charger plus d'articles
          try {
            await this.clickLoadMoreButton();
            
            // Récupérer les données mises à jour
            const updatedPricesData = await this.page.evaluate(selectors => {
              const articles = Array.from(document.querySelectorAll(selectors.articleRow));
              return articles.map(article => ({
                price: article.querySelector(selectors.priceContainer)?.textContent.trim() || null,
                condition: article.querySelector(selectors.conditionBadge)?.textContent.trim() || null,
                comments: article.querySelector(selectors.productComments)?.textContent.toLowerCase() || ''
              }));
            }, conf.PRICE_CONFIG.selectors);
            
            const hasSpecificFilterAfterLoad = updatedPricesData.some(data => 
              Utils.containsWithAccentVariants(data.comments, specificFilter)
            );
            
            if (!hasSpecificFilterAfterLoad) {
              return null;
            }
            
            // Mettre à jour pricesData
            pricesData = updatedPricesData;
          } catch (error) {
            return null;
          }
        }
      }
      
      // 3. Filtrer les prix selon les critères
      const filteredPricesData = pricesData.filter(data => {
        if (!data.price || !data.condition) return false;
        
        const hasExcludedTerm = conf.PRICE_CONFIG.excludedTerms.some(term => 
          data.comments.toUpperCase().includes(term)
        );
        
        const hasSearchTerm = specificFilter ? 
          Utils.containsWithAccentVariants(data.comments, specificFilter) : 
          true;
        
        return !hasExcludedTerm && hasSearchTerm;
      });
      
      // 4. Trouver la position du dernier prix avec l'état recherché
      let lastDesiredConditionIndex = -1;
      for (let i = filteredPricesData.length - 1; i >= 0; i--) {
        if (filteredPricesData[i].condition === cardCondition) {
          lastDesiredConditionIndex = i;
          break;
        }
      }
      
      if (lastDesiredConditionIndex === -1) {
        return null;
      }
      
      // 5. Collecter les prix selon la logique
      const validPrices = [];
      let firstDesiredConditionIndex = -1;
      
      for (let i = 0; i < filteredPricesData.length; i++) {
        if (filteredPricesData[i].condition === cardCondition) {
          firstDesiredConditionIndex = i;
          break;
        }
      }
      
      // Si le premier prix avec l'état recherché est en position 3 ou plus
      if (firstDesiredConditionIndex >= conf.PRICE_CONFIG.maxPricesToAverage - 1) {
        for (let i = 0; i < Math.min(conf.PRICE_CONFIG.maxPricesToAverage, filteredPricesData.length); i++) {
          const formattedPrice = Utils.formatPrice(filteredPricesData[i].price);
          if (!isNaN(formattedPrice)) {
            validPrices.push(formattedPrice);
          }
        }
      } else {
        for (let i = 0; i < filteredPricesData.length && validPrices.length < conf.PRICE_CONFIG.maxPricesToAverage; i++) {
          const data = filteredPricesData[i];
          const formattedPrice = Utils.formatPrice(data.price);
          
          if (isNaN(formattedPrice)) continue;
          
          const isPriceWanted = data.condition === cardCondition;
          const isPriceBetter = i < lastDesiredConditionIndex;
          
          if (isPriceWanted || isPriceBetter) {
            validPrices.push(formattedPrice);
          }
        }
      }
      
      if (validPrices.length === 0) {
        return null;
      }
      
      console.log(`   💰 Prix retenus: ${validPrices.join(', ')}€`);
      const averagePrice = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
      
      return parseFloat(averagePrice.toFixed(2));
    } catch (error) {
      console.error(`❌ Erreur calcul prix ligne ${rowIndex}:`, error.message);
      return null;
    }
  }
  
  /**
   * Clique sur le bouton "Charger plus"
   */
  async clickLoadMoreButton() {
    try {
      await this.page.waitForSelector(conf.PRICE_CONFIG.selectors.loadMoreButton, {
        timeout: conf.PRICE_CONFIG.waitTimeout
      });
      
      await this.page.click(conf.PRICE_CONFIG.selectors.loadMoreButton);
      await ScraperUtils.randomDelay(1500, 2500);
      
      return true;
    } catch (error) {
      console.error("⚠️ Erreur clic 'Charger plus':", error.message);
      return false;
    }
  }

  /**
   * Processus principal - traite toutes les lignes du fichier Excel
   */
  async process() {
    this.stats.startTime = Date.now();
    console.log(`\n🚀 Traitement des prix - Feuille "${this.currentDate}"\n`);
    
    try {
      // Initialisation navigateur et page
      await browser.getBrowser();
      this.page = await browser.getPageFromPool();
      
      // Vérifier que la feuille existe
      this.sheet = this.workbook.Sheets[this.currentDate];
      if (!this.sheet) {
        throw new Error(`La feuille "${this.currentDate}" n'existe pas dans le classeur.`);
      }

      // Optimisation - Bloquer les ressources inutiles
      await this.page.setRequestInterception(true);
      
      // Supprimer les anciens listeners pour éviter les doublons
      this.page.removeAllListeners('request');
      
      this.page.on('request', request => {
        const resourceType = request.resourceType();
        if (['image', 'font', 'media', 'stylesheet'].includes(resourceType)) {
          request.abort();
        } else {
          request.continue();
        }
      });

      // Traiter chaque ligne du fichier
      const range = xlsx.utils.decode_range(this.sheet['!ref']);
      this.stats.totalRows = range.e.r;
      
      console.log(`📊 ${range.e.r} lignes à traiter\n`);
      
      for (let rowIndex = 2; rowIndex <= range.e.r + 1; rowIndex++) {
        await this.processRow(rowIndex);

        // Délai aléatoire entre chaque URL
        await ScraperUtils.randomDelay(
          conf.PRICE_CONFIG.urlDelay, 
          conf.PRICE_CONFIG.urlDelay + 1000
        );
        
        // Feedback de progression
        if (rowIndex % 5 === 0) {
          const progress = Math.round((rowIndex - 1) / range.e.r * 100);
          const progressBar = ScraperUtils.progressBar(rowIndex - 1, range.e.r, 30);
          console.log(`\n${progressBar}`);
        }
      }

      // Sauvegarde finale
      await this.saveWorkbook();
      
    } catch (error) {
      console.error('❌ Échec exécution script:', error.message);
      // Sauvegarde d'urgence
      if (this.processedCount > this.lastSaveCount) {
        await this.saveWorkbook();
      }
    } finally {
      this.stats.endTime = Date.now();
      this.printSummary();
      
      // Cleanup
      if (this.page) {
        await browser.returnPageToPool(this.page);
        this.page = null;
      }
      await browser.closeBrowser();
    }
  }
  
  /**
   * Affiche un résumé de l'exécution
   */
  printSummary() {
    const duration = (this.stats.endTime - this.stats.startTime) / 1000;
    
    console.log(`\n${'='.repeat(60)}`);
    console.log("📊 RÉSUMÉ D'EXÉCUTION");
    console.log('='.repeat(60));
    console.log(`📄 Feuille: ${this.currentDate}`);
    console.log(`📝 Lignes totales: ${this.stats.totalRows}`);
    console.log(`✅ Traitées avec succès: ${this.stats.processedSuccessfully}`);
    console.log(`⏭️  Ignorées: ${this.stats.skipped}`);
    console.log(`❌ Erreurs: ${this.stats.errors}`);
    console.log(`⏱️  Durée: ${ScraperUtils.formatTime(duration)}`);
    
    if (this.stats.processedSuccessfully > 0) {
      const avgTime = duration / this.stats.processedSuccessfully;
      console.log(`⏱️  Temps moyen: ${avgTime.toFixed(2)}s par ligne`);
    }
    console.log('='.repeat(60));
  }
}

// Point d'entrée principal
(async () => {
  try {
    const processor = new PriceProcessor();
    await processor.process();
    console.log("\n✅ Traitement terminé");
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  }
})();