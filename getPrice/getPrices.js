const puppeteer = require('puppeteer');
const xlsx = require('xlsx');
const moment = require('moment');
const browser = require('../src/BrowserFactory');

const CONFIG = {
  xlsxFilePath: '../cartes.xlsx',
  selectors: {
    articleRow: '[id^="articleRow"]',
    priceContainer: '.price-container',
    productComments: '.d-block.text-truncate.text-muted.fst-italic.small',
    noResults: '.noResults.text-center.h3.text-muted.py-5'
  },
  maxPricesToAverage: 3
};

function formatPrice(priceText) {
  if (!priceText) return NaN;

  let cleanPrice = priceText.replace(/\s|€/g, '');
  cleanPrice = cleanPrice.replace(/\./g, '').replace(',', '.');
  const match = cleanPrice.match(/([0-9]+[.]?[0-9]*)/);
  
  if (!match) return NaN;
  return parseFloat(match[1]);
}

class PriceProcessor {
  constructor(filePath) {
    this.filePath = filePath;
    this.workbook = xlsx.readFile(filePath);
    this.currentDate = moment().format("DD_MM_YYYY");
  }

  getCellValue(sheet, cell) {
    if (!sheet[cell]) return '';
    const value = sheet[cell].v;
    return value === null || value === undefined ? '' : value;
  }

  async processRow(page, sheet, rowIndex) {
    const url = this.getCellValue(sheet, `F${rowIndex}`);
    const condition = this.getCellValue(sheet, `E${rowIndex}`);

    if (!url) return;

    console.log(`Processing row ${rowIndex}: ${url}`);
    console.log(`Expected condition: ${condition}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle0' });
      const noResultsElement = await page.$(CONFIG.selectors.noResults);

      if (noResultsElement) {
        sheet[`G${rowIndex}`] = { v: 'no data found' };
        console.log(`No data available for row ${rowIndex}`);
        return;
      }

      const averagePrice = await this.calculateAveragePrice(page, condition, rowIndex);
      if (averagePrice !== null) {
        sheet[`G${rowIndex}`] = { v: averagePrice, t: 'n' };
        console.log(`Updated cell G${rowIndex} with average price: ${averagePrice}`);
      }
    } catch (error) {
      console.error(`Error processing row ${rowIndex}:`, error.message);
      sheet[`G${rowIndex}`] = { v: 'error' };
    }
  }

  async calculateAveragePrice(page, cardCondition, rowIndex) {
    try {
        const elements = await page.$$(CONFIG.selectors.articleRow);

        if (!elements.length) {
            console.log(`No elements found for row ${rowIndex}`);
            return null;
        }

        // D'abord, analyser toute la liste pour trouver les positions des prix avec l'état désiré
        const desiredConditionIndices = [];
        for (let i = 0; i < elements.length; i++) {
            const condition = await elements[i].$eval('.article-condition .badge', el => el.innerText.trim()).catch(() => null);
            const comments = await elements[i].$eval('.d-block.text-truncate.text-muted.fst-italic.small', el => el.innerText)
                .catch(() => '');

            const excludedTerms = ['PSA', 'PCA', 'CGC', 'SFG', 'CCC', 'BGS', 'AOG', ' 10 ', ' 9.5 ', ' 9 '];
            const hasExcludedTerm = excludedTerms.some(term => comments.toUpperCase().includes(term));

            if (!hasExcludedTerm && condition === cardCondition) {
                desiredConditionIndices.push(i);
            }
        }

        let validPrices = [];
        // Parcourir à nouveau la liste pour collecter les prix
        for (let i = 0; i < elements.length && validPrices.length < CONFIG.maxPricesToAverage; i++) {
            const element = elements[i];
            const priceText = await element.$eval('.price-container', el => el.innerText).catch(() => null);
            const condition = await element.$eval('.article-condition .badge', el => el.innerText.trim()).catch(() => null);
            const comments = await element.$eval('.d-block.text-truncate.text-muted.fst-italic.small', el => el.innerText)
                .catch(() => '');

            const excludedTerms = ['PSA', 'PCA', 'CGC', 'SFG', 'CCC', 'BGS', 'AOG', ' 10 ', ' 9.5 ', ' 9 '];
            const hasExcludedTerm = excludedTerms.some(term => comments.toUpperCase().includes(term));

            if (hasExcludedTerm || !priceText || !condition) {
                continue;
            }

            const formattedPrice = formatPrice(priceText);
            if (isNaN(formattedPrice)) {
                continue;
            }

            // Vérifier s'il existe un prix avec l'état désiré plus loin dans la liste
            const hasDesiredConditionLater = desiredConditionIndices.some(index => index > i);

            if (condition === cardCondition) {
                // Si c'est l'état désiré, on le prend
                validPrices.push(formattedPrice);
                console.log(`Added price ${formattedPrice} with desired condition ${condition}`);
            } else if (hasDesiredConditionLater) {
                // Si ce n'est pas l'état désiré mais qu'il existe un prix avec l'état désiré plus loin
                validPrices.push(formattedPrice);
                console.log(`Added price ${formattedPrice} with condition ${condition} because desired condition exists later`);
            } else {
                // Si ce n'est pas l'état désiré et qu'il n'y a pas de prix avec l'état désiré plus loin
                console.log(`Skipped price ${formattedPrice} with condition ${condition} because no desired condition exists later`);
                continue;
            }
        }

        if (validPrices.length === 0) {
            console.log(`No valid prices found for row ${rowIndex}`);
            return null;
        }

        console.log(`Valid prices found: ${validPrices.join(', ')}`);
        const averagePrice = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
        console.log(`Calculated average: ${averagePrice}`);

        return parseFloat(averagePrice.toFixed(2));
    } catch (error) {
        console.error(`Error calculating average price for row ${rowIndex}:`, error);
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
const processor = new PriceProcessor('../cartes.xlsx');
processor.process().catch(console.error);
