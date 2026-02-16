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
  this.consecutiveErrors = 0; // 🔥 NOUVEAU : Compteur d'erreurs consécutives
  this.requestCounter = 0;     // 🔥 NOUVEAU : Compteur de requêtes
  this.stats = {
    startTime: null,
    endTime: null,
    totalRows: 0,
    processedSuccessfully: 0,
    skipped: 0,
    errors: 0,
    blocked: 0  // 🔥 NOUVEAU : Compteur de blocages détectés
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
   * Utiliser le clic humain
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
      // 🔥 REMPLACER LE CLIC PAR :
      await ScraperUtils.humanClick(this.page, '#loadMoreButton');
      
      console.log(`   Clic "Load More" (${attempt + 1}/${conf.PRICE_CONFIG.maxLoadAttempts})`);
      await ScraperUtils.randomDelay(
        conf.PRICE_CONFIG.loadMoreTimeout, 
        conf.PRICE_CONFIG.loadMoreTimeout + 2000  // Plus de variation
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
    
    // 🔥 NOUVEAU : Incrémenter le compteur
    this.requestCounter++;
    
    // 🔥 CRITIQUE : DÉLAI AVANT CHAQUE REQUÊTE (pas après !)
    if (this.requestCounter > 1) {
      const delayMin = conf.minDelayBetweenRequests || conf.urlDelay;
      const delayMax = conf.maxDelayBetweenRequests || (conf.urlDelay + 3000);
      const randomDelay = delayMin + Math.random() * (delayMax - delayMin);
      
      console.log(`⏱️  Attente de ${(randomDelay / 1000).toFixed(1)}s avant requête...`);
      await new Promise(resolve => setTimeout(resolve, randomDelay));
    }
    
    // 🔥 NOUVEAU : Changer de signature tous les X requêtes
    if (this.requestCounter % (conf.changeSignatureEvery || 10) === 0) {
      console.log('🔄 Rotation de signature navigateur...');
      await browser.returnPageToPool(this.page);
      this.page = await browser.getPageFromPool(true);
      await ScraperUtils.randomDelay(3000, 5000);
    }
    
    // Navigation avec retry
    await ScraperUtils.retry(
      async () => {
        await ScraperUtils.humanNavigate(this.page, url, {
          waitUntil: 'domcontentloaded',
          timeout: conf.PRICE_CONFIG.pageNavigationTimeout
        });
        
        // 🔥 CRITIQUE : Vérifier captcha IMMÉDIATEMENT
        const hasCaptcha = await this.checkForCaptcha();
        if (hasCaptcha) {
          console.log('🚨 CAPTCHA DÉTECTÉ !');
          await this.handleCaptcha();
        }
        
        // 🔥 CRITIQUE : Vérifier si bloqué
        const blockStatus = await ScraperUtils.isPageBlocked(this.page);
        if (blockStatus.blocked) {
          console.log(`🚫 Blocage détecté : ${blockStatus.reason}`);
          this.stats.blocked++;
          throw new Error(`Page bloquée: ${blockStatus.reason}`);
        }
        
        // Sauvegarder les cookies
        await browser.saveCookies(this.page);
      },
      {
        maxAttempts: this.retryAttempts,
        baseDelay: 5000,
        exponential: true,
      }
    );

    // Comportements humains
    await ScraperUtils.randomDelay(1000, 2000);
    
    if (Math.random() > 0.5) {
      await ScraperUtils.humanMouseMove(this.page);
    }
    
    if (Math.random() > 0.5) {
      await ScraperUtils.humanScroll(this.page, 200 + Math.random() * 300);
    }
    
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
      this.consecutiveErrors = 0; // Réinitialiser
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
    
    this.consecutiveErrors++;
    
    // 🔥 NOUVEAU : Gérer les erreurs consécutives
    if (this.consecutiveErrors >= (conf.maxConsecutiveErrors || 3)) {
      console.log('⚠️  Trop d\'erreurs consécutives. Pause de sécurité...');
      const cooldown = conf.errorCooldownTime || 60000;
      console.log(`⏸️  Pause de ${(cooldown / 60000).toFixed(1)} minutes...`);
      await new Promise(resolve => setTimeout(resolve, cooldown));
      
      // Recréer page avec nouvelle signature
      await browser.returnPageToPool(this.page);
      this.page = await browser.getPageFromPool(true);
      this.consecutiveErrors = 0;
    }
    
    this.sheet[`G${rowIndex}`] = { v: '' };
    this.errorCount++;
    this.stats.errors++;
    await this.checkAndSaveProgress();
  }
}

// Détection du captcha
async checkForCaptcha() {
  try {
    const captchaDetected = await this.page.evaluate(() => {
      // Vérifier différents types de captcha
      const selectors = [
        'iframe[src*="recaptcha"]',
        'iframe[src*="captcha"]',
        '.g-recaptcha',
        '#captcha',
        '[class*="captcha"]',
        '[id*="captcha"]',
      ];
      
      for (const selector of selectors) {
        if (document.querySelector(selector)) {
          return true;
        }
      }
      
      // Vérifier dans le texte de la page
      const bodyText = document.body.textContent.toLowerCase();
      return bodyText.includes('captcha') || 
             bodyText.includes('verify you are human') ||
             bodyText.includes('complete the challenge');
    });
    
    return captchaDetected;
  } catch (error) {
    return false;
  }
}

// Gestion du captcha
async handleCaptcha() {
  console.log('\n' + '='.repeat(60));
  console.log('🚨 CAPTCHA DÉTECTÉ - INTERVENTION MANUELLE REQUISE');
  console.log('='.repeat(60));
  console.log('');
  console.log('Instructions :');
  console.log('1. Le navigateur est ouvert devant vous');
  console.log('2. Résolvez le captcha manuellement');
  console.log('3. Attendez que la page se charge complètement');
  console.log('');
  console.log('⏰ Le script va attendre 3 minutes maximum...');
  console.log('   Appuyez sur Entrée dans le terminal une fois terminé');
  console.log('');
  console.log('='.repeat(60));
  
  // Screenshot pour debug
  try {
    await this.page.screenshot({ path: `captcha_${Date.now()}.png` });
    console.log('📸 Screenshot sauvegardé: captcha_XXXXX.png');
  } catch (e) {}
  
  // Attendre validation manuelle
  const startTime = Date.now();
  const maxWaitTime = 180000; // 3 minutes
  
  return new Promise((resolve) => {
    // Option 1 : Attendre input utilisateur
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    
    const listener = (key) => {
      if (key === '\r' || key === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', listener);
        clearInterval(checkInterval);
        console.log('✅ Reprise du traitement...\n');
        resolve();
      }
    };
    
    stdin.on('data', listener);
    
    // Option 2 : Vérifier automatiquement si le captcha a disparu
    const checkInterval = setInterval(async () => {
      try {
        const stillHasCaptcha = await this.checkForCaptcha();
        
        if (!stillHasCaptcha) {
          console.log('✅ Captcha résolu automatiquement détecté !');
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', listener);
          clearInterval(checkInterval);
          resolve();
        }
        
        // Timeout après 3 minutes
        if (Date.now() - startTime > maxWaitTime) {
          console.log('⏰ Timeout - reprise du traitement');
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', listener);
          clearInterval(checkInterval);
          resolve();
        }
      } catch (error) {
        // Ignorer les erreurs de vérification
      }
    }, 5000); // Vérifier toutes les 5 secondes
  });
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
   * Utiliser le clic humain
   */
async clickLoadMoreButton() {
  try {
    await this.page.waitForSelector(conf.PRICE_CONFIG.selectors.loadMoreButton, {
      timeout: conf.PRICE_CONFIG.waitTimeout
    });
    
    // 🔥 REMPLACER PAR :
    await ScraperUtils.humanClick(this.page, conf.PRICE_CONFIG.selectors.loadMoreButton);
    await ScraperUtils.randomDelay(15000, 25000);
    
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
  
  // 🔥 NOUVEAU : Afficher la configuration
  console.log('⚙️  CONFIGURATION ACTIVE:');
  console.log(`   Délai min entre requêtes: ${((conf.minDelayBetweenRequests || conf.urlDelay) / 1000).toFixed(0)}s`);
  console.log(`   Délai max entre requêtes: ${((conf.maxDelayBetweenRequests || conf.urlDelay) / 1000).toFixed(0)}s`);
  console.log(`   Changement signature: tous les ${conf.changeSignatureEvery || 10} req`);
  console.log(`   Headless: ${false}`);
  console.log('');
  
  try {
    // Initialisation navigateur et page
    await browser.getBrowser();
    this.page = await browser.getPageFromPool();
    
    // Vérifier que la feuille existe
    this.sheet = this.workbook.Sheets[this.currentDate];
    if (!this.sheet) {
      throw new Error(`La feuille "${this.currentDate}" n'existe pas dans le classeur.`);
    }

    // 🔥 AMÉLIORER : Optimisation - Bloquer plus de ressources
    await this.page.setRequestInterception(true);
    
    this.page.removeAllListeners('request');
    
    this.page.on('request', request => {
      const resourceType = request.resourceType();
      const url = request.url();
      
      // Bloquer encore plus de ressources inutiles
      if (['image', 'font', 'media', 'stylesheet', 'other'].includes(resourceType)) {
        request.abort();
      } else if (url.includes('google-analytics') || 
                 url.includes('facebook') ||
                 url.includes('doubleclick') ||
                 url.includes('analytics')) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // 🔥 NOUVEAU : Charger les cookies sauvegardés
    const fs = require('fs');
    if (fs.existsSync('./cookies_cardmarket.json')) {
      console.log('🍪 Chargement des cookies sauvegardés...');
      const cookies = JSON.parse(fs.readFileSync('./cookies_cardmarket.json'));
      for (const cookie of cookies) {
        await this.page.setCookie(cookie);
      }
    }

    // Traiter chaque ligne du fichier
    const range = xlsx.utils.decode_range(this.sheet['!ref']);
    this.stats.totalRows = range.e.r;
    
    console.log(`📊 ${range.e.r} lignes à traiter\n`);
    
    for (let rowIndex = 2; rowIndex <= range.e.r + 1; rowIndex++) {
      await this.processRow(rowIndex);

      // 🔥 MODIFIER : Plus de variation dans le feedback
      if (rowIndex % 5 === 0) {
        const progress = Math.round((rowIndex - 1) / range.e.r * 100);
        const progressBar = ScraperUtils.progressBar(rowIndex - 1, range.e.r, 30);
        console.log(`\n${progressBar}`);
        console.log(`📊 Stats: ✅ ${this.stats.processedSuccessfully} | ⏭️ ${this.stats.skipped} | ❌ ${this.stats.errors} | 🚫 ${this.stats.blocked}`);
      }
    }

    // Sauvegarde finale
    await this.saveWorkbook();
    
    // 🔥 NOUVEAU : Sauvegarder les cookies sur disque
    const finalCookies = await this.page.cookies();
    fs.writeFileSync('./cookies_cardmarket.json', JSON.stringify(finalCookies, null, 2));
    console.log('🍪 Cookies sauvegardés pour la prochaine session');
    
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

// Vérification préventive avant de continuer
async shouldPauseForSafety() {
  // Si captcha détecté précédemment
  if (this.stats.captchaCount > 0) {
    console.log('⚠️  Captcha détecté précédemment - pause de sécurité');
    return true;
  }
  
  // Si trop de blocages
  if (this.stats.blocked > 2) {
    console.log('⚠️  Trop de blocages détectés');
    return true;
  }
  
  // Si taux d'erreur élevé
  const total = this.stats.processedSuccessfully + this.stats.errors;
  if (total > 5 && (this.stats.errors / total) > 0.4) {
    console.log('⚠️  Taux d\'erreur élevé');
    return true;
  }
  
  return false;
}
  
  /**
   * Affiche un résumé de l'exécution avec les blocages
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
  console.log(`🚫 Blocages détectés: ${this.stats.blocked}`);  // 🔥 NOUVEAU
  console.log(`🔄 Requêtes totales: ${this.requestCounter}`);  // 🔥 NOUVEAU
  console.log(`⏱️  Durée: ${ScraperUtils.formatTime(duration)}`);
  
  if (this.stats.processedSuccessfully > 0) {
    const avgTime = duration / this.stats.processedSuccessfully;
    console.log(`⏱️  Temps moyen: ${avgTime.toFixed(2)}s par ligne`);
  }
  
  // 🔥 NOUVEAU : Taux de succès
  const successRate = ((this.stats.processedSuccessfully / (this.stats.processedSuccessfully + this.stats.errors)) * 100).toFixed(1);
  console.log(`📈 Taux de succès: ${successRate}%`);
  
  console.log('='.repeat(60));
}

/**
 * Détection préventive de pattern suspect
 * Appeler périodiquement pour vérifier si on est en train d'être détecté
 */
async checkForSuspiciousActivity() {
  // Si trop d'erreurs consécutives
  if (this.consecutiveErrors >= 2) {
    console.log('⚠️  Pattern d\'erreurs suspect détecté');
    return true;
  }
  
  // Si trop de blocages
  if (this.stats.blocked > 5) {
    console.log('⚠️  Trop de blocages détectés');
    return true;
  }
  
  // Si ratio erreurs/succès trop élevé
  const errorRate = this.stats.errors / (this.stats.processedSuccessfully + this.stats.errors);
  if (errorRate > 0.3 && this.stats.processedSuccessfully > 5) {
    console.log('⚠️  Taux d\'erreur élevé détecté');
    return true;
  }
  
  return false;
}

/**
 * Pause de sécurité intelligente
 */
async safetyCooldown() {
  console.log('🛑 Pause de sécurité activée...');
  
  // Fermer la page actuelle
  if (this.page) {
    await browser.returnPageToPool(this.page);
  }
  
  // Attendre 2-5 minutes
  const cooldownTime = 120000 + Math.random() * 180000; // 2-5 min
  console.log(`⏸️  Pause de ${(cooldownTime / 60000).toFixed(1)} minutes...`);
  await new Promise(resolve => setTimeout(resolve, cooldownTime));
  
  // Recréer une nouvelle page avec nouvelle signature
  this.page = await browser.getPageFromPool(true);
  this.consecutiveErrors = 0;
  
  console.log('✅ Reprise du traitement');
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