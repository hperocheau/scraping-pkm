// BrowserFactory_STEALTH.js - Version ultra-furtive pour Cardmarket
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// 🔥 ACTIVATION DU PLUGIN STEALTH
puppeteer.use(StealthPlugin());

/**
 * Signatures de navigateurs réalistes pour rotation
 */
const BROWSER_SIGNATURES = [
  {
    name: 'Chrome 120 Windows',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    screen: { width: 1920, height: 1080 },
    platform: 'Win32',
    vendor: 'Google Inc.',
    isFirefox: false,
  },
  {
    name: 'Chrome 119 Windows',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    viewport: { width: 1536, height: 864 },
    screen: { width: 1920, height: 1080 },
    platform: 'Win32',
    vendor: 'Google Inc.',
    isFirefox: false,
  },
  {
    name: 'Chrome 121 macOS',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    screen: { width: 2560, height: 1440 },
    platform: 'MacIntel',
    vendor: 'Google Inc.',
    isFirefox: false,
  },
  {
    name: 'Edge 120 Windows',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    viewport: { width: 1920, height: 1080 },
    screen: { width: 2560, height: 1440 },
    platform: 'Win32',
    vendor: 'Google Inc.',
    isFirefox: false,
  },
  {
    name: 'Chrome 118 Windows',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    viewport: { width: 1600, height: 900 },
    screen: { width: 1920, height: 1080 },
    platform: 'Win32',
    vendor: 'Google Inc.',
    isFirefox: false,
  },
];

class BrowserFactory {
  constructor() {
    this.browser = null;
    this.pagePool = [];
    this.maxPoolSize = 3; // Réduit pour éviter la détection
    this.currentSignatureIndex = 0;
    this.sessionCookies = new Map(); // Stockage des cookies par domaine
  }

  getRandomSignature() {
    return BROWSER_SIGNATURES[Math.floor(Math.random() * BROWSER_SIGNATURES.length)];
  }

  getNextSignature() {
    const signature = BROWSER_SIGNATURES[this.currentSignatureIndex];
    this.currentSignatureIndex = (this.currentSignatureIndex + 1) % BROWSER_SIGNATURES.length;
    return signature;
  }

  async getBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: false, // 🔥 HEADLESS = FALSE pour Cardmarket !
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-infobars',
          '--window-size=1920,1080',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-background-networking',
          '--disable-breakpad',
          '--disable-component-extensions-with-background-pages',
          '--disable-extensions',
          '--disable-features=TranslateUI,BlinkGenPropertyTrees',
          '--disable-ipc-flooding-protection',
          '--disable-hang-monitor',
          '--disable-popup-blocking',
          '--disable-prompt-on-repost',
          '--disable-sync',
          '--force-color-profile=srgb',
          '--metrics-recording-only',
          '--no-first-run',
          '--enable-automation=false',
          '--password-store=basic',
          '--use-mock-keychain',
          '--disable-blink-features=AutomationControlled',
        ],
        ignoreHTTPSErrors: true,
        defaultViewport: null,
      });

      this.browser.on('disconnected', () => {
        console.log('⚠️  Navigateur déconnecté');
        this.browser = null;
        this.pagePool = [];
      });
    }
    return this.browser;
  }

  /**
   * 🔥 Configure une page avec une signature de navigateur spécifique
   * + AMÉLIORATIONS ANTI-DÉTECTION AVANCÉES
   */
  async configurePage(page, signature = null) {
    const browserSig = signature || this.getNextSignature();
    
    console.log(`🎭 Signature: ${browserSig.name}`);

    // User-Agent
    await page.setUserAgent(browserSig.userAgent);

    // Viewport
    await page.setViewport({ 
      ...browserSig.viewport,
      deviceScaleFactor: 1,
    });

    // Timezone aléatoire européen
    const timezones = ['Europe/Paris', 'Europe/London', 'Europe/Berlin', 'Europe/Madrid'];
    const randomTimezone = timezones[Math.floor(Math.random() * timezones.length)];
    await page.emulateTimezone(randomTimezone);

    // Locale aléatoire
    const locales = ['fr-FR', 'en-GB', 'en-US', 'de-DE'];
    const randomLocale = locales[Math.floor(Math.random() * locales.length)];

    // Headers HTTP réalistes
    const headers = {
      'Accept-Language': `${randomLocale},fr;q=0.9,en;q=0.8`,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    };
    
    if (Math.random() > 0.3) {
      headers['DNT'] = '1';
    }
    
    await page.setExtraHTTPHeaders(headers);

    // 🔥 INJECTION TRÈS AGRESSIVE - ANTI-DÉTECTION ULTIME
    const antiDetectionScript = `
      (() => {
        const sig = ${JSON.stringify(browserSig)};
        
        // 🔥 MASQUAGE WEBDRIVER (le plus important)
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
          configurable: true
        });

        // 🔥 SUPPRESSION DES PROPRIÉTÉS AUTOMATION
        delete navigator.__proto__.webdriver;
        
        // 🔥 CHROME OBJECT (très important pour Cardmarket)
        if (!sig.isFirefox) {
          window.chrome = {
            app: {
              isInstalled: false,
              InstallState: {
                DISABLED: 'disabled',
                INSTALLED: 'installed',
                NOT_INSTALLED: 'not_installed'
              },
              RunningState: {
                CANNOT_RUN: 'cannot_run',
                READY_TO_RUN: 'ready_to_run',
                RUNNING: 'running'
              }
            },
            runtime: {
              OnInstalledReason: {
                CHROME_UPDATE: 'chrome_update',
                INSTALL: 'install',
                SHARED_MODULE_UPDATE: 'shared_module_update',
                UPDATE: 'update'
              },
              OnRestartRequiredReason: {
                APP_UPDATE: 'app_update',
                OS_UPDATE: 'os_update',
                PERIODIC: 'periodic'
              },
              PlatformArch: {
                ARM: 'arm',
                ARM64: 'arm64',
                MIPS: 'mips',
                MIPS64: 'mips64',
                X86_32: 'x86-32',
                X86_64: 'x86-64'
              },
              PlatformNaclArch: {
                ARM: 'arm',
                MIPS: 'mips',
                MIPS64: 'mips64',
                X86_32: 'x86-32',
                X86_64: 'x86-64'
              },
              PlatformOs: {
                ANDROID: 'android',
                CROS: 'cros',
                LINUX: 'linux',
                MAC: 'mac',
                OPENBSD: 'openbsd',
                WIN: 'win'
              },
              RequestUpdateCheckStatus: {
                NO_UPDATE: 'no_update',
                THROTTLED: 'throttled',
                UPDATE_AVAILABLE: 'update_available'
              }
            },
            loadTimes: function() {
              return {
                commitLoadTime: Date.now() / 1000 - Math.random() * 2,
                connectionInfo: 'http/1.1',
                finishDocumentLoadTime: Date.now() / 1000 - Math.random(),
                finishLoadTime: Date.now() / 1000 - Math.random(),
                firstPaintAfterLoadTime: 0,
                firstPaintTime: Date.now() / 1000 - Math.random() * 3,
                navigationType: 'Other',
                npnNegotiatedProtocol: 'unknown',
                requestTime: Date.now() / 1000 - Math.random() * 3,
                startLoadTime: Date.now() / 1000 - Math.random() * 3,
                wasAlternateProtocolAvailable: false,
                wasFetchedViaSpdy: false,
                wasNpnNegotiated: false
              };
            },
            csi: function() {
              return {
                startE: Date.now() - Math.random() * 5000,
                onloadT: Date.now() - Math.random() * 3000,
                pageT: Date.now() - Math.random() * 2000,
                tran: Math.floor(Math.random() * 20)
              };
            }
          };
        } else {
          delete window.chrome;
          window.chrome = undefined;
        }

        // 🔥 PERMISSIONS
        const originalQuery = navigator.permissions.query;
        navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
        );

        // 🔥 PLUGINS (crucial pour Cardmarket)
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            return [
              {
                0: {
                  type: "application/x-google-chrome-pdf",
                  suffixes: "pdf",
                  description: "Portable Document Format",
                  enabledPlugin: Plugin
                },
                description: "Portable Document Format",
                filename: "internal-pdf-viewer",
                length: 1,
                name: "Chrome PDF Plugin"
              },
              {
                0: {
                  type: "application/pdf",
                  suffixes: "pdf",
                  description: "Portable Document Format",
                  enabledPlugin: Plugin
                },
                description: "Portable Document Format",
                filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
                length: 1,
                name: "Chrome PDF Viewer"
              },
              {
                0: {
                  type: "application/x-nacl",
                  suffixes: "",
                  description: "Native Client Executable",
                  enabledPlugin: Plugin
                },
                1: {
                  type: "application/x-pnacl",
                  suffixes: "",
                  description: "Portable Native Client Executable",
                  enabledPlugin: Plugin
                },
                description: "",
                filename: "internal-nacl-plugin",
                length: 2,
                name: "Native Client"
              }
            ];
          },
          configurable: true
        });

        // 🔥 LANGUAGES
        Object.defineProperty(navigator, 'languages', {
          get: () => ['fr-FR', 'fr', 'en-US', 'en'],
          configurable: true
        });

        // 🔥 PLATFORM
        Object.defineProperty(navigator, 'platform', {
          get: () => sig.platform,
          configurable: true
        });

        // 🔥 VENDOR
        Object.defineProperty(navigator, 'vendor', {
          get: () => sig.vendor,
          configurable: true
        });

        // 🔥 HARDWARE CONCURRENCY
        const hwConcurrency = [4, 8, 12, 16][Math.floor(Math.random() * 4)];
        Object.defineProperty(navigator, 'hardwareConcurrency', {
          get: () => hwConcurrency,
          configurable: true
        });

        // 🔥 DEVICE MEMORY
        const deviceMem = [4, 8, 16][Math.floor(Math.random() * 3)];
        Object.defineProperty(navigator, 'deviceMemory', {
          get: () => deviceMem,
          configurable: true
        });

        // 🔥 SCREEN DIMENSIONS
        Object.defineProperty(screen, 'width', {
          get: () => sig.screen.width,
          configurable: true
        });
        
        Object.defineProperty(screen, 'height', {
          get: () => sig.screen.height,
          configurable: true
        });

        Object.defineProperty(screen, 'availWidth', {
          get: () => sig.screen.width,
          configurable: true
        });
        
        Object.defineProperty(screen, 'availHeight', {
          get: () => sig.screen.height - 40,
          configurable: true
        });

        Object.defineProperty(screen, 'colorDepth', {
          get: () => 24,
          configurable: true
        });

        Object.defineProperty(screen, 'pixelDepth', {
          get: () => 24,
          configurable: true
        });

        // 🔥 BATTERY API
        if (navigator.getBattery) {
          navigator.getBattery = async () => ({
            charging: Math.random() > 0.5,
            chargingTime: 0,
            dischargingTime: Infinity,
            level: 0.5 + Math.random() * 0.5,
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => true
          });
        }

        // 🔥 MEDIA DEVICES (microphone/camera)
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          navigator.mediaDevices.enumerateDevices = async () => [
            {
              deviceId: "default",
              kind: "audioinput",
              label: "",
              groupId: "default"
            },
            {
              deviceId: "default",
              kind: "audiooutput",
              label: "",
              groupId: "default"
            },
            {
              deviceId: "default",
              kind: "videoinput",
              label: "",
              groupId: "default"
            }
          ];
        }

        // 🔥 CANVAS FINGERPRINT RANDOMIZATION
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(type) {
          if (type === 'image/png' && this.width === 0 && this.height === 0) {
            return 'data:image/png;base64,iVBORw0KGg==';
          }
          return originalToDataURL.apply(this, arguments);
        };

        const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
        CanvasRenderingContext2D.prototype.getImageData = function() {
          const imageData = originalGetImageData.apply(this, arguments);
          // Ajouter un léger bruit aléatoire
          for (let i = 0; i < imageData.data.length; i += 4) {
            if (Math.random() < 0.001) {
              imageData.data[i] = imageData.data[i] ^ 1;
            }
          }
          return imageData;
        };

        // 🔥 WEBGL FINGERPRINT RANDOMIZATION
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) {
            return 'Intel Inc.';
          }
          if (parameter === 37446) {
            return 'Intel Iris OpenGL Engine';
          }
          return getParameter.apply(this, arguments);
        };

        // 🔥 AUDIO CONTEXT FINGERPRINT
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          const originalCreateOscillator = AudioContext.prototype.createOscillator;
          AudioContext.prototype.createOscillator = function() {
            const oscillator = originalCreateOscillator.apply(this, arguments);
            const originalStart = oscillator.start;
            oscillator.start = function() {
              // Ajouter un léger délai aléatoire
              return originalStart.apply(this, arguments);
            };
            return oscillator;
          };
        }

        // 🔥 CONNECTION INFO
        Object.defineProperty(navigator, 'connection', {
          get: () => ({
            downlink: 10,
            effectiveType: '4g',
            rtt: 50,
            saveData: false,
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => true
          }),
          configurable: true
        });

        // 🔥 OVERRIDE TOSTRING POUR CACHER LES MODIFICATIONS
        const originalToString = Function.prototype.toString;
        Function.prototype.toString = function() {
          if (this === navigator.permissions.query) {
            return 'function query() { [native code] }';
          }
          if (this === HTMLCanvasElement.prototype.toDataURL) {
            return 'function toDataURL() { [native code] }';
          }
          if (this === CanvasRenderingContext2D.prototype.getImageData) {
            return 'function getImageData() { [native code] }';
          }
          return originalToString.call(this);
        };

        // 🔥 MASQUER window.cdc_ (Chrome DevTools Protocol)
        Object.keys(window).forEach(key => {
          if (key.includes('cdc_') || key.includes('__webdriver')) {
            delete window[key];
          }
        });

        // 🔥 MASQUER LES TRACES DE HEADLESS
        Object.defineProperty(navigator, 'maxTouchPoints', {
          get: () => 0,
          configurable: true
        });

        // 🔥 DOCUMENT HASFOCUS
        const originalHasFocus = document.hasFocus;
        document.hasFocus = function() {
          return true;
        };

        console.log('🔒 Anti-detection script injected successfully');
      })();
    `;

    // 🔥 Injection AVANT le chargement de la page
    await page.evaluateOnNewDocument(antiDetectionScript);
    
    // 🔥 Injection SUPPLÉMENTAIRE après création de page (double sécurité)
    await page.evaluate(antiDetectionScript);

    // 🔥 GESTION DES COOKIES (important pour Cardmarket)
    try {
      const domain = 'cardmarket.com';
      if (this.sessionCookies.has(domain)) {
        const cookies = this.sessionCookies.get(domain);
        await page.setCookie(...cookies);
        console.log(`🍪 Cookies restaurés pour ${domain}`);
      }
    } catch (error) {
      // Ignore
    }
  }

  /**
   * 🔥 SAUVEGARDE DES COOKIES APRÈS NAVIGATION
   */
  async saveCookies(page, domain = 'cardmarket.com') {
    try {
      const cookies = await page.cookies();
      this.sessionCookies.set(domain, cookies);
      console.log(`🍪 ${cookies.length} cookies sauvegardés pour ${domain}`);
    } catch (error) {
      // Ignore
    }
  }

  async createPage() {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    await this.configurePage(page);
    
    // 🔥 COMPORTEMENT HUMAIN : Attendre un peu avant d'utiliser la page
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
    
    return page;
  }

  async getPageFromPool(forceNewSignature = false) {
    let page;
    
    if (this.pagePool.length > 0 && !forceNewSignature) {
      page = this.pagePool.pop();
      try {
        await page.evaluate(() => true);
        return page;
      } catch (error) {
        // Page invalide
      }
    }
    
    page = await this.createPage();
    return page;
  }

  async reconfigurePageSignature(page) {
    const newSignature = this.getNextSignature();
    console.log(`🔄 Changement de signature → ${newSignature.name}`);
    
    try {
      await page.close();
    } catch (e) {
      // Page déjà fermée
    }
    
    const newPage = await this.createPage();
    return newPage;
  }

  async returnPageToPool(page) {
    try {
      await page.evaluate(() => true);

      if (this.pagePool.length < this.maxPoolSize) {
        await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
        page.removeAllListeners('request');
        
        try {
          await page.setRequestInterception(false);
        } catch (e) {
          // Ignore
        }
        
        this.pagePool.push(page);
      } else {
        await page.close();
      }
    } catch (error) {
      console.log('⚠️  Page invalide lors du retour au pool');
    }
  }

  async closeBrowser() {
    const closePromises = this.pagePool.map(async (page) => {
      try {
        await page.close();
      } catch (error) {
        // Ignore
      }
    });
    await Promise.all(closePromises);
    this.pagePool = [];

    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        console.log('⚠️  Erreur fermeture navigateur:', error.message);
      }
      this.browser = null;
    }
  }

  async cleanPool() {
    const validPages = [];
    
    for (const page of this.pagePool) {
      try {
        await page.evaluate(() => true);
        validPages.push(page);
      } catch (error) {
        // Page invalide
      }
    }
    
    this.pagePool = validPages;
  }

  getPoolStats() {
    return {
      poolSize: this.pagePool.length,
      maxPoolSize: this.maxPoolSize,
      browserActive: this.browser !== null,
      currentSignature: BROWSER_SIGNATURES[this.currentSignatureIndex].name,
    };
  }
}

module.exports = new BrowserFactory();