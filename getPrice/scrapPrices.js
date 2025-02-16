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

  let cleanPrice = priceText.replace(/\s|€/g, '');
  cleanPrice = cleanPrice.replace(/\./g, '').replace(',', '.');
  const match = cleanPrice.match(/([0-9]+[.]?[0-9]*)/);
  
  if (!match) return NaN;
  return parseFloat(match[1]);
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
    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 1000));

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
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 500000  });
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
      const sheet = this.workbook.Sheets[this.currentDate];
      
      // Extraction du searchTerm (partie inchangée)
      const cellAddress = `A${rowIndex}`;
      const cellA = sheet[cellAddress] ? sheet[cellAddress].v : '';
      let searchTerm = null;
      if (cellA && typeof cellA === 'string') {
          const startIndex = cellA.indexOf('(');
          const endIndex = cellA.indexOf(')');
          if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
              searchTerm = cellA.substring(startIndex + 1, endIndex).toLowerCase().trim();
          }
      }

      if (!elements.length) {
          console.log(`No elements found for row ${rowIndex}`);
          return null;
      }

      // D'abord, vérifier s'il existe un prix avec l'état désiré
      let hasDesiredCondition = false;
      for (let i = 0; i < elements.length; i++) {
          const condition = await elements[i].$eval('.article-condition .badge', el => el.innerText.trim()).catch(() => null);
          const comments = await elements[i].$eval('.d-block.text-truncate.text-muted.fst-italic.small', el => el.innerText.toLowerCase())
              .catch(() => '');

          const excludedTerms = ['PSA', 'PCA', 'CGC', 'SFG', 'CCC', 'BGS', 'AOG', ' 10 ', ' 9.5 ', ' 9 '];
          const hasExcludedTerm = excludedTerms.some(term => comments.toUpperCase().includes(term));
          const hasSearchTerm = searchTerm ? comments.includes(searchTerm) : true;

          if (!hasExcludedTerm && condition === cardCondition && hasSearchTerm) {
              hasDesiredCondition = true;
              break;
          }
      }

      let validPrices = [];
      // Collecter les prix
      for (let i = 0; i < elements.length && validPrices.length < CONFIG.maxPricesToAverage; i++) {
          const element = elements[i];
          const condition = await element.$eval('.article-condition .badge', el => el.innerText.trim()).catch(() => null);
          const comments = await element.$eval('.d-block.text-truncate.text-muted.fst-italic.small', el => el.innerText.toLowerCase())
              .catch(() => '');
          const priceText = await element.$eval('.price-container', el => el.innerText).catch(() => null);

          console.log(`\nAnalyzing item ${i + 1}:`);
          console.log(`- Price: ${priceText}`);
          console.log(`- Condition: ${condition}`);
          console.log(`- Comments: "${comments}"`);

          const excludedTerms = ['PSA', 'PCA', 'CGC', 'SFG', 'CCC', 'BGS', 'AOG', ' 10 ', ' 9.5 ', ' 9 '];
          const hasExcludedTerm = excludedTerms.some(term => comments.toUpperCase().includes(term));
          const hasSearchTerm = searchTerm ? comments.includes(searchTerm) : true;

          if (hasExcludedTerm || !hasSearchTerm) {
              console.log(`=> Item ${i + 1} is not valid (excluded term or search term)`);
              continue;
          }

          const formattedPrice = formatPrice(priceText);
          if (isNaN(formattedPrice)) {
              console.log(`=> Item ${i + 1} has invalid price format`);
              continue;
          }

          if (condition === cardCondition || (hasDesiredCondition && condition !== cardCondition)) {
              validPrices.push(formattedPrice);
              console.log(`=> Added price ${formattedPrice} to valid prices list`);
          } else if (!hasDesiredCondition) {
              console.log(`=> No desired condition found later, stopping price collection`);
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
const processor = new PriceProcessor(xlsxPath);
processor.process().catch(console.error);