const puppeteer = require('puppeteer');

class BrowserFactory {
  constructor() {
    this.browser = null;
  }

  /**
   * Obtient l'instance unique du navigateur ou en crée une nouvelle
   * @returns {Promise<Browser>} Instance du navigateur
   */
  async getBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        waitUntil: ['networkidle0', 'domcontentloaded'],
        args: [
          '--disable-gpu',
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--ignore-certificate-errors',
          '--disable-extensions',
          '--disable-infobars',
          '--disable-notifications',
          '--disable-popup-blocking',
          '--disable-logging',
          '--window-size=1920x1080',
        ],
      });
    }
    return this.browser;
  }

  /**
   * Crée une nouvelle page avec la configuration standard
   * @returns {Promise<Page>} Instance de la page configurée
   */
  async createPage() {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );
    return page;
  }

  /**
   * Ferme proprement le navigateur
   */
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// Export d'une instance unique
module.exports = new BrowserFactory();