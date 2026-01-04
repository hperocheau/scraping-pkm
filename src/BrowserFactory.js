const puppeteer = require('puppeteer');

class BrowserFactory {
  constructor() {
    this.browser = null;
    this.pagePool = [];
    this.maxPoolSize = 5;
  }

  /**
   * Obtient l'instance unique du navigateur avec configuration anti-détection
   * @returns {Promise<Browser>} Instance du navigateur
   */
  async getBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--disable-blink-features=AutomationControlled', // 🔥 Masque Puppeteer
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-web-security',
        ],
        ignoreHTTPSErrors: true,
        defaultViewport: null,
      });

      // Gérer la fermeture propre
      this.browser.on('disconnected', () => {
        console.log('⚠️  Navigateur déconnecté');
        this.browser = null;
        this.pagePool = [];
      });
    }
    return this.browser;
  }

  /**
   * Configure une page pour éviter la détection (CloudFlare, bot detection)
   * @param {Page} page - Page Puppeteer à configurer
   */
  async configurePage(page) {
    // 🔥 Injecter des scripts anti-détection AVANT le chargement de la page
    await page.evaluateOnNewDocument(() => {
      // Masquer webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // Ajouter chrome object (absent en headless)
      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {},
      };

      // Simuler les permissions comme un vrai navigateur
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );

      // Masquer les propriétés headless
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      Object.defineProperty(navigator, 'languages', {
        get: () => ['fr-FR', 'fr', 'en-US', 'en'],
      });

      // Override du toString pour masquer les proxies
      const originalToString = Function.prototype.toString;
      Function.prototype.toString = function() {
        if (this === window.navigator.permissions.query) {
          return 'function query() { [native code] }';
        }
        return originalToString.call(this);
      };
    });

    // User-Agent réaliste (Chrome récent)
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Headers HTTP réalistes
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    });

    // Viewport réaliste
    await page.setViewport({ 
      width: 1920, 
      height: 1080,
      deviceScaleFactor: 1,
    });

    // Timezone
    await page.emulateTimezone('Europe/Paris');
  }

  /**
   * Crée une nouvelle page avec configuration anti-détection
   * @returns {Promise<Page>} Instance de la page configurée
   */
  async createPage() {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    await this.configurePage(page);
    return page;
  }

  /**
   * Récupère une page du pool (ou en crée une nouvelle)
   * @returns {Promise<Page>} Page prête à l'emploi
   */
  async getPageFromPool() {
    if (this.pagePool.length > 0) {
      const page = this.pagePool.pop();
      // Vérifier que la page est toujours valide
      try {
        await page.evaluate(() => true);
        return page;
      } catch (error) {
        // Page invalide, en créer une nouvelle
        return this.createPage();
      }
    }
    return this.createPage();
  }

  /**
   * Retourne une page au pool pour réutilisation
   * @param {Page} page - Page à retourner au pool
   */
  async returnPageToPool(page) {
    try {
      // Vérifier que la page est toujours valide
      await page.evaluate(() => true);

      if (this.pagePool.length < this.maxPoolSize) {
        // Nettoyer la page avant de la remettre dans le pool
        await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
        
        // Supprimer tous les listeners pour éviter les fuites mémoire
        page.removeAllListeners('request');
        
        // Désactiver l'interception (sera réactivée lors de la prochaine utilisation)
        try {
          await page.setRequestInterception(false);
        } catch (e) {
          // L'interception n'était peut-être pas activée
        }
        
        this.pagePool.push(page);
      } else {
        await page.close();
      }
    } catch (error) {
      // Page déjà fermée ou invalide, ne rien faire
      console.log('⚠️  Page invalide lors du retour au pool');
    }
  }

  /**
   * Ferme proprement toutes les pages du pool et le navigateur
   */
  async closeBrowser() {
    // Fermer toutes les pages du pool
    const closePromises = this.pagePool.map(async (page) => {
      try {
        await page.close();
      } catch (error) {
        // Page déjà fermée
      }
    });
    await Promise.all(closePromises);
    this.pagePool = [];

    // Fermer le navigateur
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        console.log('⚠️  Erreur lors de la fermeture du navigateur:', error.message);
      }
      this.browser = null;
    }
  }

  /**
   * Nettoie les pages inactives du pool
   */
  async cleanPool() {
    const validPages = [];
    
    for (const page of this.pagePool) {
      try {
        await page.evaluate(() => true);
        validPages.push(page);
      } catch (error) {
        // Page invalide, ne pas la garder
      }
    }
    
    this.pagePool = validPages;
  }

  /**
   * Retourne les statistiques du pool
   */
  getPoolStats() {
    return {
      poolSize: this.pagePool.length,
      maxPoolSize: this.maxPoolSize,
      browserActive: this.browser !== null,
    };
  }
}

// Export d'une instance unique (Singleton)
module.exports = new BrowserFactory();