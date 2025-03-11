const puppeteer = require('puppeteer');
const xlsx = require('xlsx');
const moment = require('moment');
const browser = require('../src/BrowserFactory');
const path = require('path');
const config = require(path.resolve(__dirname, '../src/config.js'));
const conf = require('../src/configPrices');

// Configuration
const CONFIG = {
  //xlsxFilePath: config.xlsxFile,
  selectors: {
    articleRow: '[id^="articleRow"]',
    priceContainer: '.price-container',
    conditionBadge: '.article-condition .badge',
    productComments: '.d-block.text-truncate.text-muted.fst-italic.small',
    loadMoreButton: '#loadMoreButton'
  },
  maxPricesToAverage: 3,
  excludedTerms: ['PSA', 'PCA', 'CGC', 'SFG', 'CCC', 'BGS', 'AOG', ' 10 ', ' 9.5 ', ' 9 '],
  pageNavigationTimeout: 20000,
  waitTimeout: 2000,
  loadMoreTimeout: 750,
  maxLoadAttempts: 5,
  saveInterval: 10
};

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
    if (this.processedCount - this.lastSaveCount >= CONFIG.saveInterval) {
      await this.saveWorkbook();
      this.lastSaveCount = this.processedCount;
    }
  }

  /**
   * Charge tous les résultats disponibles en cliquant sur "Load More"
   */
  async loadAllResults() {
    console.log('Tentative de chargement des résultats supplémentaires...');
    
    for (let attempt = 0; attempt < CONFIG.maxLoadAttempts; attempt++) {
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
        console.log(`Clic sur "Load More" (tentative ${attempt + 1}/${CONFIG.maxLoadAttempts})`);
        
        // Attendre le chargement des nouveaux résultats
        await this.page.waitForTimeout(CONFIG.loadMoreTimeout);
      } catch (error) {
        console.error(`Erreur lors du chargement des résultats (tentative ${attempt + 1}):`, error.message);
      }
    }
    
    console.log(`Nombre maximal de tentatives atteint (${CONFIG.maxLoadAttempts})`);
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
    
    if (specificFilter) {
      console.log(`Ligne ${rowIndex}: Utilisation du filtre spécifique "${specificFilter}"`);
    }

    try {
      console.log(`Traitement ligne ${rowIndex}: Navigation vers ${url}`);
      
      // Navigation avec gestion des erreurs améliorée
      await Promise.race([
        this.page.goto(url, {
          waitUntil: ['networkidle0', 'domcontentloaded'],
          timeout: CONFIG.pageNavigationTimeout
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Navigation timeout exceeded')), CONFIG.pageNavigationTimeout + 5000)
        )
      ]);

      // Attente courte pour assurer le chargement
      await this.page.waitForTimeout(1000);
      
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
        CONFIG.selectors.articleRow
      );

      console.log(`Ligne ${rowIndex}: ${articlesCount} articles trouvés`);

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
      this.sheet[`G${rowIndex}`] = { v: 'error' };
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
        await this.page.waitForSelector(CONFIG.selectors.articleRow, {
          timeout: CONFIG.waitTimeout
        });
      } catch (e) {
        console.log(`Timeout en attendant les articles pour ligne ${rowIndex}, continuation...`);
      }
      
      // Récupérer directement les prix et conditions
      const pricesData = await this.page.evaluate(selectors => {
        const articles = Array.from(document.querySelectorAll(selectors.articleRow));
        return articles.map(article => ({
          price: article.querySelector(selectors.priceContainer)?.textContent.trim() || null,
          condition: article.querySelector(selectors.conditionBadge)?.textContent.trim() || null,
          comments: article.querySelector(selectors.productComments)?.textContent.toLowerCase() || ''
        }));
      }, CONFIG.selectors);
      
      const attemptLabel = isSecondAttempt ? 'seconde tentative' : 'première tentative';
      console.log(`Ligne ${rowIndex} (${attemptLabel}): ${pricesData.length} articles trouvés`);
      
      if (!pricesData.length) {
        console.log(`Aucun article trouvé pour ligne ${rowIndex}`);
        return null;
      }
  
      // 1. Vérifier si l'état recherché existe
      const hasDesiredCondition = pricesData.some(data => data.condition === cardCondition);
      console.log(`Ligne ${rowIndex}: État recherché (${cardCondition}) trouvé: ${hasDesiredCondition}`);
      
      if (!hasDesiredCondition) {
        console.log(`Ligne ${rowIndex}: État recherché non trouvé -> FIN`);
        return null;
      }
      
      // 2. Si specificFilter défini, vérifier s'il existe des articles avec ce filtre
      if (specificFilter) {
        const hasSpecificFilter = pricesData.some(data => 
          Utils.containsWithAccentVariants(data.comments, specificFilter)
        );
        
        console.log(`Ligne ${rowIndex}: Filtre spécifique (${specificFilter}) trouvé: ${hasSpecificFilter}`);
        
        if (!hasSpecificFilter) {
          // Si le filtre spécifique n'est pas trouvé, charger plus d'articles
          console.log(`Ligne ${rowIndex}: Filtre spécifique non trouvé, tentative de chargement d'articles supplémentaires`);
          
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
            }, CONFIG.selectors);
            
            // Vérifier à nouveau si le filtre spécifique existe
            const hasSpecificFilterAfterLoad = updatedPricesData.some(data => 
              Utils.containsWithAccentVariants(data.comments, specificFilter)
            );
            
            console.log(`Ligne ${rowIndex}: Après chargement, filtre spécifique trouvé: ${hasSpecificFilterAfterLoad}`);
            
            if (!hasSpecificFilterAfterLoad) {
              console.log(`Ligne ${rowIndex}: Filtre spécifique toujours non trouvé après chargement -> FIN`);
              return null;
            }
            
            // Mettre à jour pricesData avec les nouvelles données
            pricesData.length = 0; // Vider le tableau
            updatedPricesData.forEach(item => pricesData.push(item)); // Ajouter les nouvelles données
          } catch (error) {
            console.error(`Erreur lors du chargement d'articles supplémentaires: ${error.message}`);
            console.log(`Ligne ${rowIndex}: Filtre spécifique non trouvé -> FIN`);
            return null;
          }
        }
      }
      
      // 3. Filtrer les prix selon les critères
      // Créer une version filtrée de pricesData qui ne contient que les articles valides
      const filteredPricesData = pricesData.filter(data => {
        if (!data.price || !data.condition) return false;
        
        const hasExcludedTerm = CONFIG.excludedTerms.some(term => 
          data.comments.toUpperCase().includes(term)
        );
        
        const hasSearchTerm = specificFilter ? 
          Utils.containsWithAccentVariants(data.comments, specificFilter) : 
          true;
        
        return !hasExcludedTerm && hasSearchTerm;
      });
      
      console.log(`Ligne ${rowIndex}: ${filteredPricesData.length} articles après filtrage des termes exclus/recherchés`);
      
      // 4. Trouver la position du dernier prix avec l'état recherché
      let lastDesiredConditionIndex = -1;
      for (let i = filteredPricesData.length - 1; i >= 0; i--) {
        if (filteredPricesData[i].condition === cardCondition) {
          lastDesiredConditionIndex = i;
          break;
        }
      }
      
      console.log(`Ligne ${rowIndex}: Position du dernier prix avec état recherché: ${lastDesiredConditionIndex}`);
      
      if (lastDesiredConditionIndex === -1) {
        console.log(`Ligne ${rowIndex}: Aucun prix avec état recherché après filtrage -> FIN`);
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
      
      console.log(`Ligne ${rowIndex}: Position du premier prix avec état recherché: ${firstDesiredConditionIndex}`);
      
      // Si le premier prix avec l'état recherché est en position 3 ou plus
      if (firstDesiredConditionIndex >= 2) {
        console.log(`Ligne ${rowIndex}: Premier prix avec état recherché en position ${firstDesiredConditionIndex} (>= 3), ajout des 3 premiers prix`);
        
        // Ajouter les 3 premiers prix à validPrices
        for (let i = 0; i < Math.min(3, filteredPricesData.length); i++) {
          const data = filteredPricesData[i];
          const formattedPrice = Utils.formatPrice(data.price);
          
          if (!isNaN(formattedPrice)) {
            validPrices.push(formattedPrice);
            console.log(`=> Prix ${formattedPrice} (${data.condition}) ajouté (position ${i+1})`);
          }
        }
      } else {
        // Sinon, ajouter les prix selon la logique spécifiée
        console.log(`Ligne ${rowIndex}: Ajout sélectif des prix selon les critères`);
        
        for (let i = 0; i < filteredPricesData.length && validPrices.length < 3; i++) {
          const data = filteredPricesData[i];
          const formattedPrice = Utils.formatPrice(data.price);
          
          if (isNaN(formattedPrice)) continue;
          
          // Vérifier si c'est un prix voulu (état recherché) OU 
          // un prix supérieur ET position inférieure à la position du dernier prix voulu
          const isPriceWanted = data.condition === cardCondition;
          const isPriceBetter = i < lastDesiredConditionIndex;
          
          if (isPriceWanted || isPriceBetter) {
            validPrices.push(formattedPrice);
            console.log(`=> Prix ${formattedPrice} (${data.condition}) ajouté (${isPriceWanted ? 'état recherché' : 'meilleur prix'}, position ${i+1})`);
          }
        }
      }
      
      if (validPrices.length === 0) {
        console.log(`Ligne ${rowIndex}: Aucun prix valide collecté -> FIN`);
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
      await this.page.waitForSelector(CONFIG.selectors.loadMoreButton, {
        timeout: CONFIG.waitTimeout
      });
      
      // Cliquer sur le bouton
      await this.page.click(CONFIG.selectors.loadMoreButton);
      
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
        console.log('Tentative de sauvegarde d\'urgence avant sortie...');
        await this.saveWorkbook();
      }
    } finally {
      this.stats.endTime = Date.now();
      this.printSummary();
      console.log("Fermeture du navigateur en cours...");
      await browser.closeBrowser();
      console.log("Navigateur fermé avec succès");
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