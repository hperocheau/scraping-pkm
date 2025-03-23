const puppeteer = require('puppeteer');
const xlsx = require('xlsx');
const moment = require('moment');
const browser = require('../src/BrowserFactory');
const path = require('path');
const config = require(path.resolve(__dirname, '../src/config.js'));
const conf = require('../src/configPrices');

/**
 * Utilitaires pour le traitement des données
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
      console.log(`💾 Fichier Excel sauvegardé (${this.processedCount} lignes traitées)`);
      return true;
    } catch (error) {
      console.error('⚠️ Erreur lors de la sauvegarde du fichier Excel:', error.message);
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
    console.log('Tentative de chargement des résultats supplémentaires...');
    
    for (let attempt = 0; attempt < conf.PRICE_CONFIG.maxLoadAttempts; attempt++) {
      // Vérifier si le bouton existe et est visible
      const buttonVisible = await this.page.evaluate(() => {
        const button = document.getElementById('loadMoreButton');
        if (!button) return false;
        
        const style = window.getComputedStyle(button);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      
      if (!buttonVisible) {
        console.log('✓ Tous les résultats sont chargés');
        return true;
      }
      
      // Cliquer sur le bouton et attendre le chargement
      try {
        await this.page.evaluate(() => {
          document.getElementById('loadMoreButton').click();
        });
        console.log(`Clic sur "Load More" (tentative ${attempt + 1}/${conf.PRICE_CONFIG.maxLoadAttempts})`);
        
        // Attendre le chargement des nouveaux résultats
        await this.page.waitForTimeout(conf.PRICE_CONFIG.loadMoreTimeout);
      } catch (error) {
        console.error(`Erreur lors du chargement des résultats (tentative ${attempt + 1}):`, error.message);
      }
    }
    
    console.log(`Nombre maximal de tentatives atteint (${conf.PRICE_CONFIG.maxLoadAttempts})`);
    return true;
  }

  /**
   * Traite une ligne du fichier Excel
   */
  async processRow(rowIndex) {
    // Vérifier si la cellule G est déjà remplie
    const existingValue = this.getCellValue(this.sheet, `G${rowIndex}`);
    if (existingValue) {
      console.log(`Ligne ${rowIndex} ignorée - Cellule G déjà remplie: ${existingValue}`);
      this.stats.skipped++;
      return;
    }

    const url = this.getCellValue(this.sheet, `F${rowIndex}`);
    if (!url) {
      console.log(`Ligne ${rowIndex} ignorée - Aucune URL trouvée`);
      this.stats.skipped++;
      return;
    }

    const condition = this.getCellValue(this.sheet, `E${rowIndex}`);
    const cellAValue = this.getCellValue(this.sheet, `A${rowIndex}`);
    const specificFilter = Utils.extractContentInParentheses(cellAValue);

    try {
      console.log(`Traitement ligne ${rowIndex}: Navigation vers ${url}`);
      
      // Navigation avec gestion des erreurs améliorée
      await Promise.race([
        this.page.goto(url, {
          waitUntil: ['networkidle0', 'domcontentloaded'],
          timeout: conf.PRICE_CONFIG.pageNavigationTimeout
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Navigation timeout exceeded')), conf.PRICE_CONFIG.pageNavigationTimeout + 5000)
        )
      ]);


      await this.page.waitForTimeout(500);
      
      // Premier essai avec les résultats actuels
      let averagePrice = await this.calculateAveragePrice(condition, specificFilter, rowIndex, false);
      
      // Si aucun prix valide, charger plus de résultats
      if (averagePrice === null) {
        console.log(`Aucun prix valide trouvé initialement pour ligne ${rowIndex}. Chargement de plus de résultats...`);
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
        console.log(`✓ Ligne ${rowIndex}: Prix moyen calculé ${averagePrice}`);
        this.processedCount++;
        this.stats.processedSuccessfully++;
      } else if (articlesCount > 0) {
        this.sheet[`G${rowIndex}`] = { v: 'price calculation failed' };
        console.log(`⚠ Ligne ${rowIndex}: Échec du calcul malgré des articles trouvés`);
        this.errorCount++;
        this.stats.errors++;
      } else {
        this.sheet[`G${rowIndex}`] = { v: '' };
        console.log(`⚠ Ligne ${rowIndex}: Aucun article trouvé`);
        this.errorCount++;
        this.stats.errors++;
      }
      
      // Vérifier si sauvegarde nécessaire
      await this.checkAndSaveProgress();
      
    } catch (error) {
      console.error(`❌ Erreur traitement ligne ${rowIndex}:`, error.message);
      this.sheet[`G${rowIndex}`] = { v: 'ERROR' };
      this.errorCount++;
      this.stats.errors++;
      
      // Sauvegarde d'urgence
      await this.checkAndSaveProgress();
    }
  }

  /**
   * Calcule le prix moyen basé sur les éléments de la page
   */
  async calculateAveragePrice(cardCondition, specificFilter, rowIndex, isSecondAttempt = false) {
    try {
      // Attendre les éléments de prix avec gestion du timeout
      try {
        await this.page.waitForSelector(conf.PRICE_CONFIG.selectors.articleRow, {
          timeout: conf.PRICE_CONFIG.waitTimeout
        });
      } catch (e) {
      }
      
      // Récupérer directement les prix et conditions
      const pricesData = await this.page.evaluate(selectors => {
        const articles = Array.from(document.querySelectorAll(selectors.articleRow));
        return articles.map(article => ({
          price: article.querySelector(selectors.priceContainer)?.textContent.trim() || null,
          condition: article.querySelector(selectors.conditionBadge)?.textContent.trim() || null,
          comments: article.querySelector(selectors.productComments)?.textContent.toLowerCase() || ''
        }));
      }, conf.PRICE_CONFIG.selectors);
      
      const attemptLabel = isSecondAttempt ? 'seconde tentative' : 'première tentative';
      
      if (!pricesData.length) {
        return null;
      }
  
      // 1. Vérifier si l'état recherché existe
      const hasDesiredCondition = pricesData.some(data => data.condition === cardCondition);
      
      if (!hasDesiredCondition) {
        return null;
      }
      
      // 2. Si specificFilter défini, vérifier s'il existe des articles avec ce filtre
      if (specificFilter) {
        const hasSpecificFilter = pricesData.some(data => 
          Utils.containsWithAccentVariants(data.comments, specificFilter)
        );
        
        if (!hasSpecificFilter) {
          
          // Tenter de charger plus d'articles en cliquant sur le bouton "Charger plus"
          try {
            await this.clickLoadMoreButton();
            
            // Récupérer à nouveau les données après le chargement
            const updatedPricesData = await this.page.evaluate(selectors => {
              const articles = Array.from(document.querySelectorAll(selectors.articleRow));
              return articles.map(article => ({
                price: article.querySelector(selectors.priceContainer)?.textContent.trim() || null,
                condition: article.querySelector(selectors.conditionBadge)?.textContent.trim() || null,
                comments: article.querySelector(selectors.productComments)?.textContent.toLowerCase() || ''
              }));
            }, conf.PRICE_CONFIG.selectors);
            
            // Vérifier à nouveau si le filtre spécifique existe
            const hasSpecificFilterAfterLoad = updatedPricesData.some(data => 
              Utils.containsWithAccentVariants(data.comments, specificFilter)
            );
            
            if (!hasSpecificFilterAfterLoad) {
              return null;
            }
            
            // Mettre à jour pricesData avec les nouvelles données
            pricesData.length = 0; // Vider le tableau
            updatedPricesData.forEach(item => pricesData.push(item)); // Ajouter les nouvelles données
          } catch (error) {
            return null;
          }
        }
      }
      
      // 3. Filtrer les prix selon les critères
      // Créer une version filtrée de pricesData qui ne contient que les articles valides
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
      
      // 5. Collecter les prix selon la nouvelle logique
      const validPrices = [];
      
      // Vérifier la position du premier prix avec l'état recherché
      let firstDesiredConditionIndex = -1;
      for (let i = 0; i < filteredPricesData.length; i++) {
        if (filteredPricesData[i].condition === cardCondition) {
          firstDesiredConditionIndex = i;
          break;
        }
      }
      
      
      // Si le premier prix avec l'état recherché est en position 3 ou plus
      if (firstDesiredConditionIndex >= conf.PRICE_CONFIG.maxPricesToAverage-1) {
        
        // Ajouter les 3 premiers prix à validPrices
        for (let i = 0; i < Math.min(conf.PRICE_CONFIG.maxPricesToAverage, filteredPricesData.length); i++) {
          const data = filteredPricesData[i];
          const formattedPrice = Utils.formatPrice(data.price);
          
          if (!isNaN(formattedPrice)) {
            validPrices.push(formattedPrice);
          }
        }
      } else {
        
        for (let i = 0; i < filteredPricesData.length && validPrices.length < conf.PRICE_CONFIG.maxPricesToAverage; i++) {
          const data = filteredPricesData[i];
          const formattedPrice = Utils.formatPrice(data.price);
          
          if (isNaN(formattedPrice)) continue;
          
          // Vérifier si c'est un prix voulu (état recherché) OU 
          // un prix supérieur ET position inférieure à la position du dernier prix voulu
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
      
      console.log(`\nPrix valides finaux: ${validPrices.join(', ')}`);
      const averagePrice = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
      
      return parseFloat(averagePrice.toFixed(2));
    } catch (error) {
      console.error(`Erreur calcul prix moyen ligne ${rowIndex}:`, error.message);
      return null;
    }
  }
  
  // Fonction hypothétique pour cliquer sur le bouton "Charger plus"
  async clickLoadMoreButton() {
    try {
      // Attendre que le bouton soit visible
      await this.page.waitForSelector(conf.PRICE_CONFIG.selectors.loadMoreButton, {
        timeout: conf.PRICE_CONFIG.waitTimeout
      });
      
      // Cliquer sur le bouton
      await this.page.click(conf.PRICE_CONFIG.selectors.loadMoreButton);
      
      // Attendre que le chargement soit terminé
      await this.page.waitForTimeout(2000); // Attente arbitraire, ajuster selon le comportement du site
      
      return true;
    } catch (error) {
      console.error("Erreur lors du clic sur le bouton 'Charger plus':", error.message);
      return false;
    }
  }

  /**
   * Processus principal - traite toutes les lignes du fichier Excel
   */
  async process() {
    this.stats.startTime = Date.now();
    console.log(`Démarrage traitement des prix sur feuille "${this.currentDate}"`);
    
    try {
      // Création et configuration de la page
      this.page = await browser.createPage();
      
      // Vérifier que la feuille existe
      this.sheet = this.workbook.Sheets[this.currentDate];
      if (!this.sheet) {
        throw new Error(`La feuille "${this.currentDate}" n'existe pas dans le classeur.`);
      }

      // Optimisation des performances de navigation
      await this.page.setRequestInterception(true);
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
      
      for (let rowIndex = 2; rowIndex <= range.e.r + 1; rowIndex++) {
        await this.processRow(rowIndex);
        
        // Feedback de progression
        if (rowIndex % 5 === 0) {
          const progress = Math.round((rowIndex - 1) / range.e.r * 100);
          console.log(`Progression: ${progress}% (${rowIndex - 1}/${range.e.r})`);
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
      await browser.closeBrowser();
    }
  }
  
  /**
   * Affiche un résumé de l'exécution
   */
  printSummary() {
    const duration = (this.stats.endTime - this.stats.startTime) / 1000;
    console.log("\n📊 RÉSUMÉ D'EXÉCUTION 📊");
    console.log(`Feuille utilisée: ${this.currentDate}`);
    console.log(`Lignes totales: ${this.stats.totalRows}`);
    console.log(`✓ Traitées avec succès: ${this.stats.processedSuccessfully}`);
    console.log(`⏩ Ignorées: ${this.stats.skipped}`);
    console.log(`❌ Erreurs: ${this.stats.errors}`);
    console.log(`⏱️ Durée: ${duration.toFixed(2)} secondes`);
    
    if (this.stats.processedSuccessfully > 0) {
      const avgTime = duration / this.stats.processedSuccessfully;
      console.log(`⏱️ Temps moyen par ligne: ${avgTime.toFixed(2)} secondes`);
    }
  }
}

// Point d'entrée principal
(async () => {
  try {
    const processor = new PriceProcessor();
    await processor.process();
    console.log("Traitement terminé, arrêt du processus...");
    process.exit(0);  // Force la fin du processus
  } catch (error) {
    console.error('Erreur fatale durant l\'exécution:', error);
    process.exit(1);
  }
})();