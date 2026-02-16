/**
 * BrowserUtils_STEALTH.js
 * 
 * Utilitaires réutilisables pour le scraping furtif avec comportements humains
 */

class ScraperUtils {
  /**
   * Attend un délai aléatoire entre min et max (en millisecondes)
   * @param {number} min - Délai minimum en ms
   * @param {number} max - Délai maximum en ms
   * @returns {Promise<void>}
   */
  static async randomDelay(min, max) {
    const delay = Math.random() * (max - min) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * 🔥 NOUVEAU : Mouvement de souris aléatoire humain
   * @param {Page} page - Page Puppeteer
   */
  static async humanMouseMove(page) {
    try {
      const viewport = page.viewport();
      const startX = Math.floor(Math.random() * (viewport.width || 1920));
      const startY = Math.floor(Math.random() * (viewport.height || 1080));
      
      // Déplacer la souris de manière progressive
      for (let i = 0; i < 5; i++) {
        const targetX = Math.floor(Math.random() * (viewport.width || 1920));
        const targetY = Math.floor(Math.random() * (viewport.height || 1080));
        
        await page.mouse.move(targetX, targetY, { steps: 10 + Math.floor(Math.random() * 10) });
        await this.randomDelay(100, 300);
      }
    } catch (error) {
      // Ignore en cas d'erreur
    }
  }

  /**
   * 🔥 NOUVEAU : Scroll humain progressif avec variation
   * @param {Page} page - Page Puppeteer
   * @param {number} scrollDistance - Distance à scroller (défaut: jusqu'en bas)
   */
  static async humanScroll(page, scrollDistance = null) {
    try {
      const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
      const targetDistance = scrollDistance || scrollHeight;
      
      const steps = 5 + Math.floor(Math.random() * 5); // 5-10 étapes
      const stepSize = targetDistance / steps;
      
      for (let i = 0; i < steps; i++) {
        const scrollY = stepSize * i;
        
        // Variation aléatoire dans chaque step
        const variation = (Math.random() - 0.5) * 50;
        await page.evaluate((y) => window.scrollTo(0, y), scrollY + variation);
        
        // Délai variable (plus rapide au début, plus lent à la fin)
        const delay = 200 + Math.random() * 400 + (i * 50);
        await this.randomDelay(delay, delay + 200);
      }
      
      // Revenir légèrement en arrière (comportement humain)
      if (Math.random() > 0.5) {
        await page.evaluate(() => window.scrollBy(0, -50 - Math.random() * 50));
        await this.randomDelay(200, 500);
      }
    } catch (error) {
      // Ignore
    }
  }

  /**
   * 🔥 NOUVEAU : Cliquer comme un humain avec délais et mouvement
   * @param {Page} page - Page Puppeteer
   * @param {string} selector - Sélecteur CSS
   */
  static async humanClick(page, selector) {
    try {
      // Attendre que l'élément soit visible
      await page.waitForSelector(selector, { visible: true, timeout: 5000 });
      
      // Récupérer les coordonnées de l'élément
      const element = await page.$(selector);
      const box = await element.boundingBox();
      
      if (box) {
        // Déplacer la souris vers l'élément avec un peu de variation
        const x = box.x + box.width / 2 + (Math.random() - 0.5) * 10;
        const y = box.y + box.height / 2 + (Math.random() - 0.5) * 10;
        
        await page.mouse.move(x, y, { steps: 10 + Math.floor(Math.random() * 20) });
        await this.randomDelay(100, 300);
        
        // Cliquer
        await page.mouse.click(x, y, { delay: 50 + Math.random() * 100 });
        await this.randomDelay(200, 500);
      } else {
        // Fallback
        await element.click({ delay: 50 + Math.random() * 100 });
      }
    } catch (error) {
      console.error(`⚠️  Erreur clic humain sur ${selector}:`, error.message);
      throw error;
    }
  }

  /**
   * 🔥 NOUVEAU : Navigation humaine vers une URL
   * @param {Page} page - Page Puppeteer
   * @param {string} url - URL cible
   * @param {Object} options - Options de navigation
   */
  static async humanNavigate(page, url, options = {}) {
    const defaultOptions = {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
      ...options
    };
    
    // Petit délai avant navigation
    await this.randomDelay(500, 1500);
    
    try {
      await page.goto(url, defaultOptions);
      
      // Simuler le chargement
      await this.randomDelay(1000, 2000);
      
      // Mouvement de souris aléatoire
      if (Math.random() > 0.5) {
        await this.humanMouseMove(page);
      }
      
      // Petit scroll aléatoire
      if (Math.random() > 0.6) {
        const scrollAmount = 100 + Math.random() * 200;
        await page.evaluate((y) => window.scrollTo(0, y), scrollAmount);
        await this.randomDelay(300, 700);
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Retry avec backoff exponentiel
   * @param {Function} fn - Fonction async à exécuter
   * @param {Object} options - Options de retry
   * @param {number} options.maxAttempts - Nombre max de tentatives (défaut: 3)
   * @param {number} options.baseDelay - Délai de base en ms (défaut: 3000)
   * @param {boolean} options.exponential - Utiliser le backoff exponentiel (défaut: true)
   * @param {boolean} options.jitter - Ajouter du jitter aléatoire (défaut: true)
   * @param {Function} options.onRetry - Callback appelé avant chaque retry
   * @returns {Promise<any>} Résultat de la fonction
   */
  static async retry(fn, options = {}) {
    const {
      maxAttempts = 3,
      baseDelay = 3000,
      exponential = true,
      jitter = true,
      onRetry = null,
    } = options;

    let lastError;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt < maxAttempts - 1) {
          // Calcul du délai
          let delay = exponential 
            ? baseDelay * Math.pow(2, attempt)
            : baseDelay;

          // Ajouter du jitter (0-2000ms aléatoire pour plus de variabilité)
          if (jitter) {
            delay += Math.random() * 2000;
          }

          // Callback personnalisé
          if (onRetry) {
            onRetry(attempt, maxAttempts, delay, error);
          } else {
            console.log(
              `⚠️  Tentative ${attempt + 1}/${maxAttempts} échouée. ` +
              `Nouvelle tentative dans ${(delay / 1000).toFixed(1)}s...`
            );
            console.log(`   Erreur: ${error.message}`);
          }

          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Attend que la page soit complètement chargée avec timeout
   * @param {Page} page - Page Puppeteer
   * @param {string} selector - Selecteur CSS à attendre
   * @param {number} timeout - Timeout en ms (défaut: 10000)
   * @returns {Promise<boolean>} True si trouvé, false sinon
   */
  static async waitForSelector(page, selector, timeout = 10000) {
    try {
      await page.waitForSelector(selector, { timeout });
      return true;
    } catch (error) {
      console.log(`⚠️  Timeout: élément "${selector}" non trouvé`);
      return false;
    }
  }

  /**
   * Vérifie si une page est bloquée par CloudFlare
   * @param {Page} page - Page Puppeteer
   * @returns {Promise<boolean>} True si bloqué
   */
  static async isCloudFlareBlocked(page) {
    try {
      const title = await page.title();
      const content = await page.content();
      
      return (
        title.includes('Just a moment') ||
        title.includes('Attention Required') ||
        content.includes('cf-browser-verification') ||
        content.includes('Checking your browser')
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * 🔥 NOUVEAU : Vérifie si la page est bloquée (détection générique)
   * @param {Page} page - Page Puppeteer
   * @returns {Promise<Object>} {blocked: boolean, reason: string}
   */
  static async isPageBlocked(page) {
    try {
      const title = await page.title();
      const content = await page.content();
      const url = page.url();
      
      // Cloudflare
      if (title.includes('Just a moment') || 
          title.includes('Attention Required') ||
          content.includes('cf-browser-verification') ||
          content.includes('Checking your browser')) {
        return { blocked: true, reason: 'Cloudflare' };
      }
      
      // Captcha générique
      if (content.toLowerCase().includes('captcha') ||
          content.toLowerCase().includes('recaptcha')) {
        return { blocked: true, reason: 'Captcha' };
      }
      
      // Access denied
      if (title.toLowerCase().includes('access denied') ||
          title.toLowerCase().includes('403') ||
          content.toLowerCase().includes('access denied')) {
        return { blocked: true, reason: 'Access Denied (403)' };
      }
      
      // Rate limit
      if (title.toLowerCase().includes('rate limit') ||
          title.toLowerCase().includes('too many requests') ||
          content.toLowerCase().includes('rate limit')) {
        return { blocked: true, reason: 'Rate Limited (429)' };
      }
      
      return { blocked: false, reason: null };
    } catch (error) {
      return { blocked: false, reason: null };
    }
  }

  /**
   * Extrait du texte avec un sélecteur CSS
   * @param {Page} page - Page Puppeteer
   * @param {string} selector - Sélecteur CSS
   * @param {string} defaultValue - Valeur par défaut si non trouvé
   * @returns {Promise<string>}
   */
  static async extractText(page, selector, defaultValue = '') {
    try {
      return await page.$eval(selector, el => el.textContent.trim());
    } catch (error) {
      return defaultValue;
    }
  }

  /**
   * Extrait un attribut avec un sélecteur CSS
   * @param {Page} page - Page Puppeteer
   * @param {string} selector - Sélecteur CSS
   * @param {string} attribute - Nom de l'attribut
   * @param {string} defaultValue - Valeur par défaut
   * @returns {Promise<string>}
   */
  static async extractAttribute(page, selector, attribute, defaultValue = '') {
    try {
      return await page.$eval(selector, (el, attr) => el.getAttribute(attr), attribute);
    } catch (error) {
      return defaultValue;
    }
  }

  /**
   * Attend un temps aléatoire qui simule la lecture humaine
   * @param {number} contentLength - Longueur du contenu (caractères)
   * @param {number} wpm - Mots par minute de lecture (défaut: 200)
   */
  static async humanReadingDelay(contentLength, wpm = 200) {
    // Estimation: 5 caractères par mot
    const words = contentLength / 5;
    const readingTimeMs = (words / wpm) * 60 * 1000;
    
    // Ajouter de la variabilité (50%-150% du temps calculé)
    const min = readingTimeMs * 0.5;
    const max = readingTimeMs * 1.5;
    
    await this.randomDelay(min, max);
  }

  /**
   * Crée un délai progressif (augmente à chaque appel)
   * Utile pour espacer les requêtes de plus en plus
   */
  static createProgressiveDelay(baseDelay = 1000, increment = 500, max = 10000) {
    let currentDelay = baseDelay;

    return async () => {
      await new Promise(resolve => setTimeout(resolve, currentDelay));
      currentDelay = Math.min(currentDelay + increment, max);
    };
  }

  /**
   * Batch des opérations avec délai entre chaque batch
   * @param {Array} items - Items à traiter
   * @param {Function} processor - Fonction de traitement async
   * @param {number} batchSize - Taille des batchs
   * @param {number} batchDelay - Délai entre batchs en ms
   */
  static async processBatches(items, processor, batchSize = 10, batchDelay = 3000) {
    const results = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      console.log(`📦 Traitement du batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)}`);

      const batchResults = await Promise.all(
        batch.map(item => processor(item))
      );

      results.push(...batchResults);

      // Délai entre les batchs (sauf pour le dernier)
      if (i + batchSize < items.length) {
        console.log(`⏸️  Pause de ${(batchDelay / 1000).toFixed(1)}s entre les batchs...`);
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }

    return results;
  }

  /**
   * Formatte un temps en secondes de manière lisible
   * @param {number} seconds - Temps en secondes
   * @returns {string} Temps formaté (ex: "2m 35s")
   */
  static formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  /**
   * Crée une barre de progression simple
   * @param {number} current - Valeur actuelle
   * @param {number} total - Valeur totale
   * @param {number} width - Largeur de la barre (défaut: 40)
   * @returns {string} Barre de progression
   */
  static progressBar(current, total, width = 40) {
    const percentage = Math.floor((current / total) * 100);
    const filled = Math.floor((current / total) * width);
    const empty = width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `[${bar}] ${percentage}% (${current}/${total})`;
  }

  /**
   * Nettoie une chaîne de caractères (trim, espaces multiples, etc.)
   * @param {string} text - Texte à nettoyer
   * @returns {string} Texte nettoyé
   */
  static cleanText(text) {
    if (!text) return '';
    return text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ');
  }

  /**
   * Vérifie si une URL est valide
   * @param {string} url - URL à vérifier
   * @returns {boolean}
   */
  static isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 🔥 NOUVEAU : Attendre avec variation aléatoire exponentielle
   * Utile entre requêtes pour éviter patterns suspects
   * @param {number} baseDelay - Délai de base en ms
   * @param {number} requestNumber - Numéro de la requête (pour augmenter le délai)
   */
  static async adaptiveDelay(baseDelay = 2000, requestNumber = 0) {
    // Plus on avance, plus on attend (éviter les bans)
    const scaleFactor = 1 + (requestNumber * 0.1);
    const delay = baseDelay * scaleFactor;
    
    // Ajouter variation aléatoire ±30%
    const variation = delay * 0.3;
    const finalDelay = delay + (Math.random() - 0.5) * variation;
    
    await new Promise(resolve => setTimeout(resolve, finalDelay));
  }
}

module.exports = ScraperUtils;