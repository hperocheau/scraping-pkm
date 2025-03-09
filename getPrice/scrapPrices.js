const puppeteer = require('puppeteer');
const xlsx = require('xlsx');
const moment = require('moment');
const browser = require('../src/BrowserFactory');
const path = require('path');
const config = require(path.resolve(__dirname, '../src/config.js'));
const xlsxPath = config.xlsxFile;

const CONFIG = {
  //xlsxFilePath: xlsxPath,
  selectors: {
    articleRow: '[id^="articleRow"]',
    priceContainer: '.color-primary.small;text-end.text-nowrap.fw-bold',
    productComments: '.d-block.text-truncate.text-muted.fst-italic.small',
    noResults: '.noResults.text-center.h3.text-muted.py-5'
},
maxPricesToAverage: 3
};

function formatPrice(priceText) {
    if (!priceText) return NaN;
    
    // Nettoyer la chaîne de prix
    let cleanPrice = priceText.replace(/[^\d,\.]/g, '');
    // Gérer le format européen (virgule comme séparateur décimal)
    cleanPrice = cleanPrice.replace(/\./g, '').replace(',', '.');
    
    const price = parseFloat(cleanPrice);
    return isNaN(price) ? NaN : price;
}


class PriceProcessor {
  constructor(filePath) {
    this.filePath = filePath;
    this.workbook = xlsx.readFile(xlsxPath);
    this.currentDate = moment().format("DD_MM_YYYY");
  }

  getCellValue(sheet, cell) {
    if (!sheet[cell]) return '';
    const value = sheet[cell].v;
    return value === null || value === undefined ? '' : value;
  }

  async processRow(page, sheet, rowIndex) {
    // Vérifier si la cellule G est déjà remplie
    const existingValue = this.getCellValue(sheet, `G${rowIndex}`);
    if (existingValue) {
        console.log(`Skipping row ${rowIndex} - Cell G already contains: ${existingValue}`);
        return;
    }

    const url = this.getCellValue(sheet, `F${rowIndex}`);
    const condition = this.getCellValue(sheet, `E${rowIndex}`);

    if (!url) return;

    try {
        await page.goto(url, {
            waitUntil: ['networkidle0', 'domcontentloaded'],
            timeout: 60000
        });

        // Attendre que la page soit complètement chargée
        await page.waitForTimeout(2000);

        // Vérification détaillée des éléments
        const debugInfo = await page.evaluate(() => {
            const articles = document.querySelectorAll('[id^="articleRow"]');
            const prices = document.querySelectorAll('.price-container');
            return {
                articlesCount: articles.length,
                pricesCount: prices.length,
                html: document.body.innerHTML
            };
        });

        console.log(`Debug info for row ${rowIndex}:`, {
            articlesFound: debugInfo.articlesCount,
            pricesFound: debugInfo.pricesCount
        });

        // Si des articles sont trouvés, on ne devrait pas avoir "no data found"
        if (debugInfo.articlesCount > 0) {
            const averagePrice = await this.calculateAveragePrice(page, condition, rowIndex);
            if (averagePrice !== null) {
                sheet[`G${rowIndex}`] = { v: averagePrice, t: 'n' };
                console.log(`Updated cell G${rowIndex} with average price: ${averagePrice}`);
            } else {
                sheet[`G${rowIndex}`] = { v: 'price calculation failed' };
                console.log(`Price calculation failed for row ${rowIndex}`);
            }
        } else {
            sheet[`G${rowIndex}`] = { v: 'no data found' };
            console.log(`No articles found for row ${rowIndex}`);
        }

    } catch (error) {
        console.error(`Error processing row ${rowIndex}:`, error);
        sheet[`G${rowIndex}`] = { v: 'error' };
    }
}


async calculateAveragePrice(page, cardCondition, rowIndex) {
    try {
        // Attendre explicitement les éléments de prix
        await page.waitForSelector('[id^="articleRow"]', { timeout: 10000 });
        
        // Récupérer directement les prix et conditions
        const pricesData = await page.evaluate((cardCondition) => {
            const articles = Array.from(document.querySelectorAll('[id^="articleRow"]'));
            return articles.map(article => {
                const priceElement = article.querySelector('.price-container');
                const conditionElement = article.querySelector('.article-condition .badge');
                const commentsElement = article.querySelector('.d-block.text-truncate.text-muted.fst-italic.small');
                
                return {
                    price: priceElement ? priceElement.textContent.trim() : null,
                    condition: conditionElement ? conditionElement.textContent.trim() : null,
                    comments: commentsElement ? commentsElement.textContent.toLowerCase() : ''
                };
            });
        }, cardCondition);

        console.log(`Raw prices data for row ${rowIndex}:`, pricesData);

        if (!pricesData.length) {
            console.log(`No price data found for row ${rowIndex}`);
            return null;
        }

        // Filtrer et traiter les prix comme avant
        const validPrices = pricesData
            .filter(data => {
                if (!data.price || !data.condition) return false;
                
                const excludedTerms = ['PSA', 'PCA', 'CGC', 'SFG', 'CCC', 'BGS', 'AOG', ' 10 ', ' 9.5 ', ' 9 '];
                const hasExcludedTerm = excludedTerms.some(term => 
                    data.comments.toUpperCase().includes(term)
                );
                
                return !hasExcludedTerm && data.condition === cardCondition;
            })
            .map(data => formatPrice(data.price))
            .filter(price => !isNaN(price))
            .slice(0, CONFIG.maxPricesToAverage);

        if (validPrices.length === 0) {
            console.log(`No valid prices after filtering for row ${rowIndex}`);
            return null;
        }

        const averagePrice = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
        return parseFloat(averagePrice.toFixed(2));

    } catch (error) {
        console.error(`Error in calculateAveragePrice for row ${rowIndex}:`, error);
        return null;
    }
}



  async process() {
    console.time('script-execution');
    const page = await browser.createPage();

    try {
      const sheet = this.workbook.Sheets[this.currentDate];
      if (!sheet) {
        throw new Error(`Sheet "${this.currentDate}" does not exist.`);
      }

      const range = xlsx.utils.decode_range(sheet['!ref']);
      for (let rowIndex = 2; rowIndex <= range.e.r + 1; rowIndex++) {
        await this.processRow(page, sheet, rowIndex);
      }

      xlsx.writeFile(this.workbook, this.filePath);
      console.log(`Excel file successfully updated. Sheet used: ${this.currentDate}`);
    } catch (error) {
      console.error('Script execution failed:', error.message);
    } finally {
      await browser.closeBrowser();
      console.timeEnd('script-execution');
    }
  }
}

// Exécution
const processor = new PriceProcessor(xlsxPath);
processor.process().catch(console.error);