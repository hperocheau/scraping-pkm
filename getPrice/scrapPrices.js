const puppeteer = require('puppeteer');
const xlsx = require('xlsx');
const moment = require('moment');
const browser = require('../src/BrowserFactory');
const path = require('path');
const config = require(path.resolve(__dirname, '../src/config.js'));

// Configuration constante
const CONFIG = {
  xlsxFilePath: config.xlsxFile,
  selectors: {
    articleRow: '[id^="articleRow"]',
    priceContainer: '.price-container',
    conditionBadge: '.article-condition .badge',
    productComments: '.d-block.text-truncate.text-muted.fst-italic.small',
    loadMoreButton: '#loadMoreButton'
  },
  maxPricesToAverage: 3,
  excludedTerms: ['PSA', 'PCA', 'CGC', 'SFG', 'CCC', 'BGS', 'AOG', ' 10 ', ' 9.5 ', ' 9 '],
  pageNavigationTimeout: 60000,
  waitTimeout: 10000,
  loadMoreTimeout: 2000,
  maxLoadAttempts: 5,
  saveInterval: 10 // Sauvegarder après chaque lot de 5 lignes traitées
};

/**
 * Convertit une chaîne de texte représentant un prix en nombre flottant
 * @param {string} priceText - Texte du prix à formater
 * @returns {number} - Prix formaté ou NaN si non valide
 */
function formatPrice(priceText) {
  if (!priceText) return NaN;
  
  // Nettoyer la chaîne de prix
  const cleanPrice = priceText
    .replace(/[^\d,\.]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  
  return parseFloat(cleanPrice);
}

/**
 * Extrait le contenu entre parenthèses d'une chaîne de texte
 * @param {string} text - Texte à analyser
 * @returns {string|null} - Contenu entre parenthèses ou null
 */
function extractContentInParentheses(text) {
  if (!text) return null;
  const match = text.match(/\(([^)]+)\)/);
  return match ? match[1].trim() : null;
}

/**
 * Normalise une chaîne de caractères (supprime les accents)
 * @param {string} text - Texte à normaliser
 * @returns {string} - Texte normalisé
 */
function normalizeString(text) {
  if (!text) return '';
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Vérifie si une chaîne contient un terme spécifique, avec ou sans accents
 * @param {string} text - Texte à vérifier
 * @param {string} term - Terme à rechercher
 * @returns {boolean} - Vrai si le terme est trouvé
 */
function containsWithAccentVariants(text, term) {
  if (!text || !term) return false;
  return normalizeString(text).includes(normalizeString(term));
}

class PriceProcessor {
  constructor() {
    this.workbook = xlsx.readFile(CONFIG.xlsxFilePath);
    this.currentDate = moment().format("DD_MM_YYYY");
    this.sheet = null;
    this.page = null;
    this.processedCount = 0;
    this.errorCount = 0;
    this.lastSaveCount = 0;
  }

  /**
   * Récupère la valeur d'une cellule d'une feuille Excel
   * @param {Object} sheet - Feuille Excel
   * @param {string} cell - Référence de cellule
   * @returns {string} - Valeur de la cellule
   */
  getCellValue(sheet, cell) {
    if (!sheet[cell]) return '';
    const value = sheet[cell].v;
    return value === null || value === undefined ? '' : value;
  }

  /**
   * Sauvegarde le workbook sur le disque
   * @returns {Promise<void>}
   */
  async saveWorkbook() {
    try {
      xlsx.writeFile(this.workbook, CONFIG.xlsxFilePath);
      console.log(`💾 Fichier Excel sauvegardé (${this.processedCount} lignes traitées jusqu'à présent)`);
    } catch (error) {
      console.error('⚠️ Erreur lors de la sauvegarde du fichier Excel:', error.message);
    }
  }

  /**
   * Vérifie si une sauvegarde est nécessaire et la déclenche le cas échéant
   * @returns {Promise<void>}
   */
  async checkAndSaveProgress() {
    const rowsProcessedSinceLastSave = this.processedCount - this.lastSaveCount;
    
    if (rowsProcessedSinceLastSave >= CONFIG.saveInterval) {
      await this.saveWorkbook();
      this.lastSaveCount = this.processedCount;
    }
  }

  /**
   * Charge tous les résultats disponibles en cliquant sur "Load More"
   * @returns {Promise<boolean>} - Vrai si le chargement a réussi
   */
  async loadAllResults() {
    let loadAttempts = 0;
    
    try {
      // Vérifier si le bouton existe et est visible
      const hasLoadMoreButton = await this.page.evaluate((selector) => {
        const button = document.getElementById('loadMoreButton');
        if (!button) return false;
        
        const style = window.getComputedStyle(button);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }, CONFIG.selectors.loadMoreButton);
      
      if (!hasLoadMoreButton) {
        console.log('All results already displayed (no "Load More" button found)');
        return true;
      }
      
      console.log('Found "Load More" button - loading additional results');
      
      // Cliquer sur le bouton jusqu'à ce qu'il disparaisse ou que la limite soit atteinte
      while (loadAttempts < CONFIG.maxLoadAttempts) {
        const buttonVisible = await this.page.evaluate(() => {
          const button = document.getElementById('loadMoreButton');
          if (!button) return false;
          
          const style = window.getComputedStyle(button);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });
        
        if (!buttonVisible) {
          console.log('All results loaded successfully');
          return true;
        }
        
        // Cliquer sur le bouton et attendre le chargement
        await this.page.evaluate(() => {
          document.getElementById('loadMoreButton').click();
        });
        
        console.log(`Clicked "Load More" button (attempt ${loadAttempts + 1}/${CONFIG.maxLoadAttempts})`);
        loadAttempts++;
        
        // Attendre que de nouveaux résultats soient chargés
        await this.page.waitForTimeout(CONFIG.loadMoreTimeout);
      }
      
      if (loadAttempts >= CONFIG.maxLoadAttempts) {
        console.log(`Reached maximum load attempts (${CONFIG.maxLoadAttempts})`);
        return true; // Considérer que nous avons suffisamment de résultats
      }
      
    } catch (error) {
      console.error('Error while loading more results:', error);
    }
    
    return false;
  }

  /**
   * Traite une ligne du fichier Excel
   * @param {number} rowIndex - Index de la ligne à traiter
   * @returns {Promise<void>}
   */
  async processRow(rowIndex) {
    // Vérifier si la cellule G est déjà remplie
    const existingValue = this.getCellValue(this.sheet, `G${rowIndex}`);
    if (existingValue) {
      console.log(`Skipping row ${rowIndex} - Cell G already contains: ${existingValue}`);
      return;
    }

    const url = this.getCellValue(this.sheet, `F${rowIndex}`);
    const condition = this.getCellValue(this.sheet, `E${rowIndex}`);
    const cellAValue = this.getCellValue(this.sheet, `A${rowIndex}`);
    const specificFilter = extractContentInParentheses(cellAValue);
    
    if (specificFilter) {
      console.log(`Row ${rowIndex}: Using specific filter "${specificFilter}"`);
    }

    if (!url) {
      console.log(`Skipping row ${rowIndex} - No URL found`);
      return;
    }

    try {
      console.log(`Processing row ${rowIndex}: Navigating to ${url}`);
      await this.page.goto(url, {
        waitUntil: ['networkidle0', 'domcontentloaded'],
        timeout: CONFIG.pageNavigationTimeout
      });

      // Attendre que la page soit chargée
      await this.page.waitForTimeout(1000);
      
      // Premier essai avec les résultats actuels
      let averagePrice = await this.calculateAveragePrice(condition, specificFilter, rowIndex, false);
      
      // Si aucun prix valide n'a été trouvé, charger plus de résultats
      if (averagePrice === null) {
        console.log(`No valid prices found initially for row ${rowIndex}. Loading more results...`);
        await this.loadAllResults();
        
        // Recalculer après avoir chargé plus de résultats
        averagePrice = await this.calculateAveragePrice(condition, specificFilter, rowIndex, true);
      }

      // Vérification détaillée des éléments
      const articlesCount = await this.page.evaluate((selector) => {
        return document.querySelectorAll(selector).length;
      }, CONFIG.selectors.articleRow);

      console.log(`Row ${rowIndex}: ${articlesCount} articles found`);

      // Mise à jour de la cellule en fonction du résultat
      if (averagePrice !== null) {
        this.sheet[`G${rowIndex}`] = { v: averagePrice, t: 'n' };
        console.log(`✓ Row ${rowIndex}: Updated with average price ${averagePrice}`);
        this.processedCount++;
      } else if (articlesCount > 0) {
        this.sheet[`G${rowIndex}`] = { v: 'price calculation failed' };
        console.log(`⚠ Row ${rowIndex}: Price calculation failed despite finding articles`);
        this.errorCount++;
      } else {
        this.sheet[`G${rowIndex}`] = { v: '' };
        console.log(`⚠ Row ${rowIndex}: No articles found`);
        this.errorCount++;
      }
      
      // Vérifier si une sauvegarde est nécessaire
      await this.checkAndSaveProgress();
      
    } catch (error) {
      console.error(`❌ Error processing row ${rowIndex}:`, error.message);
      this.sheet[`G${rowIndex}`] = { v: 'error' };
      this.errorCount++;
      
      // Sauvegarder même en cas d'erreur pour ne pas perdre les progrès
      await this.checkAndSaveProgress();
    }
  }

  /**
   * Calcule le prix moyen basé sur les éléments de la page
   * @param {string} cardCondition - Condition de la carte à filtrer
   * @param {string} specificFilter - Filtre spécifique à appliquer
   * @param {number} rowIndex - Index de la ligne pour le log
   * @param {boolean} isSecondAttempt - Indique s'il s'agit d'une seconde tentative
   * @returns {Promise<number|null>} - Prix moyen ou null
   */
  async calculateAveragePrice(cardCondition, specificFilter, rowIndex, isSecondAttempt = false) {
    try {
      // Attendre les éléments de prix
      await this.page.waitForSelector(CONFIG.selectors.articleRow, {
        timeout: CONFIG.waitTimeout
      }).catch(() => {
        console.log(`Timeout waiting for article rows in row ${rowIndex}, proceeding anyway`);
      });
      
      // Extraction du searchTerm depuis le workbook
      let searchTerm = null;
      if (this.workbook) {
        const sheet = this.workbook.Sheets[this.currentDate];
        const cellAddress = `A${rowIndex}`;
        const cellA = sheet[cellAddress] ? sheet[cellAddress].v : '';
        
        if (cellA && typeof cellA === 'string') {
          const startIndex = cellA.indexOf('(');
          const endIndex = cellA.indexOf(')');
          if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
            searchTerm = cellA.substring(startIndex + 1, endIndex).toLowerCase().trim();
          }
        }
      }
      
      // Si specificFilter est fourni, il a priorité sur searchTerm
      const effectiveSearchTerm = specificFilter || searchTerm;
      const excludedTerms = ['PSA', 'PCA', 'CGC', 'SFG', 'CCC', 'BGS', 'AOG', ' 10 ', ' 9.5 ', ' 9 '];
      
      // Récupérer directement les prix et conditions
      const pricesData = await this.page.evaluate((selectors) => {
        const articles = Array.from(document.querySelectorAll(selectors.articleRow));
        return articles.map(article => {
          const priceElement = article.querySelector(selectors.priceContainer);
          const conditionElement = article.querySelector(selectors.conditionBadge);
          const commentsElement = article.querySelector(selectors.productComments);
          
          return {
            price: priceElement ? priceElement.textContent.trim() : null,
            condition: conditionElement ? conditionElement.textContent.trim() : null,
            comments: commentsElement ? commentsElement.textContent.toLowerCase() : ''
          };
        });
      }, CONFIG.selectors);
      
      const attemptLabel = isSecondAttempt ? 'second attempt' : 'first attempt';
      console.log(`Row ${rowIndex} (${attemptLabel}): Found ${pricesData.length} price items`);
      
      if (!pricesData.length) {
        console.log(`No price data found for row ${rowIndex}`);
        return null;
      }
  
      // Vérifier s'il existe au moins un prix avec l'état désiré
      let hasDesiredCondition = false;
      for (let i = 0; i < pricesData.length; i++) {
        const data = pricesData[i];
        if (!data.price || !data.condition) continue;
        
        const hasExcludedTerm = excludedTerms.some(term => data.comments.toUpperCase().includes(term));
        const hasSearchTerm = effectiveSearchTerm ? 
          (typeof containsWithAccentVariants === 'function' ? 
            containsWithAccentVariants(data.comments, effectiveSearchTerm) : 
            data.comments.includes(effectiveSearchTerm)) : 
          true;
        
        if (!hasExcludedTerm && data.condition === cardCondition && hasSearchTerm) {
          hasDesiredCondition = true;
          console.log(`Row ${rowIndex}: Found desired condition (${cardCondition}) at item ${i + 1}`);
          break;
        }
      }
      
      console.log(`Row ${rowIndex} (${attemptLabel}): Has desired condition: ${hasDesiredCondition}`);
      
      // Collecte des prix valides
      let validPrices = [];
      
      for (let i = 0; i < pricesData.length && validPrices.length < CONFIG.maxPricesToAverage; i++) {
        const data = pricesData[i];
        if (!data.price || !data.condition) continue;
        
        console.log(`\nAnalyzing item ${i + 1}:`);
        console.log(`- Price: ${data.price}`);
        console.log(`- Condition: ${data.condition}`);
        console.log(`- Comments: "${data.comments}"`);
        
        const hasExcludedTerm = excludedTerms.some(term => data.comments.toUpperCase().includes(term));
        const hasSearchTerm = effectiveSearchTerm ? 
          (typeof containsWithAccentVariants === 'function' ? 
            containsWithAccentVariants(data.comments, effectiveSearchTerm) : 
            data.comments.includes(effectiveSearchTerm)) : 
          true;
        
        if (hasExcludedTerm || !hasSearchTerm) {
          console.log(`=> Item ${i + 1} is not valid (excluded term or search term)`);
          continue;
        }
        
        const formattedPrice = formatPrice(data.price);
        if (isNaN(formattedPrice)) {
          console.log(`=> Item ${i + 1} has invalid price format`);
          continue;
        }
        
        // Implémentation exacte de la logique originale
        if (data.condition === cardCondition || (hasDesiredCondition && data.condition !== cardCondition)) {
          validPrices.push(formattedPrice);
          console.log(`=> Added price ${formattedPrice} to valid prices list (${data.condition === cardCondition ? 'desired condition' : 'other condition but desired exists elsewhere'})`);
        } else if (!hasDesiredCondition) {
          // Si on arrive ici, c'est que la condition n'est pas celle désirée et qu'il n'y a pas de condition désirée ailleurs
          console.log(`=> No desired condition found anywhere, stopping price collection`);
          break;
        }
      }
      
      if (validPrices.length === 0) {
        console.log(`No valid prices found for row ${rowIndex}`);
        return null;
      }
      
      console.log(`\nFinal valid prices: ${validPrices.join(', ')}`);
      const averagePrice = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
      
      return parseFloat(averagePrice.toFixed(2));
    } catch (error) {
      console.error(`Error calculating average price for row ${rowIndex}:`, error.message);
      return null;
    }
  }

  /**
   * Traite toutes les lignes du fichier Excel
   * @returns {Promise<void>}
   */
  async process() {
    console.time('script-execution');
    console.log(`Starting price processing on sheet "${this.currentDate}"`);
    
    try {
      this.page = await browser.createPage();
      
      // Vérifier que la feuille existe
      this.sheet = this.workbook.Sheets[this.currentDate];
      if (!this.sheet) {
        throw new Error(`Sheet "${this.currentDate}" does not exist in the workbook.`);
      }

      // Configuration de la page pour optimiser les performances
      await this.page.setRequestInterception(true);
      this.page.on('request', request => {
        // Bloquer les ressources non essentielles
        const resourceType = request.resourceType();
        if (['image', 'font', 'media'].includes(resourceType)) {
          request.abort();
        } else {
          request.continue();
        }
      });

      // Traiter chaque ligne du fichier
      const range = xlsx.utils.decode_range(this.sheet['!ref']);
      for (let rowIndex = 2; rowIndex <= range.e.r + 1; rowIndex++) {
        await this.processRow(rowIndex);
      }

      // Sauvegarde finale (pour les dernières lignes qui n'auraient pas atteint la limite de sauvegarde)
      await this.saveWorkbook();
      
      console.log(`✅ Excel file updated successfully. Sheet used: ${this.currentDate}`);
      console.log(`   Processed: ${this.processedCount} rows successfully`);
      console.log(`   Errors: ${this.errorCount} rows`);
    } catch (error) {
      console.error('❌ Script execution failed:', error.message);
      // Sauvegarde d'urgence en cas d'erreur critique
      if (this.processedCount > this.lastSaveCount) {
        console.log('Attempting emergency save before exit...');
        await this.saveWorkbook();
      }
    } finally {
      await browser.closeBrowser();
      console.timeEnd('script-execution');
    }
  }
}

// Exécution
const processor = new PriceProcessor();
processor.process().catch(error => {
  console.error('Fatal error during execution:', error);
  process.exit(1);
});