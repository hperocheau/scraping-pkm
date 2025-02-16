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
        const sheet = this.workbook.Sheets[this.currentDate];
        
        // Extraire le mot entre parenthèses de la cellule A
        const cellAddress = `A${rowIndex}`;
        const cellA = sheet[cellAddress] ? sheet[cellAddress].v : '';

        // Nouvelle approche pour l'extraction du mot entre parenthèses
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

        // D'abord, analyser toute la liste pour trouver les positions des prix valides
        const validIndices = [];
        for (let i = 0; i < elements.length; i++) {
            const condition = await elements[i].$eval('.article-condition .badge', el => el.innerText.trim()).catch(() => null);
            const comments = await elements[i].$eval('.d-block.text-truncate.text-muted.fst-italic.small', el => el.innerText.toLowerCase())
                .catch(() => '');
            const priceText = await elements[i].$eval('.price-container', el => el.innerText).catch(() => null);
/*
            console.log(`\nAnalyzing item ${i + 1}:`);
            console.log(`- Price: ${priceText}`);
            console.log(`- Condition: ${condition}`);
            console.log(`- Comments: "${comments}"`);
*/
            const excludedTerms = ['PSA', 'PCA', 'CGC', 'SFG', 'CCC', 'BGS', 'AOG', ' 10 ', ' 9.5 ', ' 9 '];
            const hasExcludedTerm = excludedTerms.some(term => comments.toUpperCase().includes(term));

            // Vérification explicite du terme recherché
            const hasSearchTerm = searchTerm ? comments.includes(searchTerm) : true;
/*
            console.log(`- Has excluded term: ${hasExcludedTerm}`);
            console.log(`- Has search term: ${hasSearchTerm}`);
            console.log(`- Matches condition: ${condition === cardCondition}`);
*/
            if (!hasExcludedTerm && condition === cardCondition && hasSearchTerm) {
                validIndices.push(i);
                //console.log(`=> Item ${i + 1} is valid and will be considered for average`);
            } else {
                //console.log(`=> Item ${i + 1} is not valid and will be ignored`);
            }
        }
        
        let validPrices = [];
        // Collecter les prix des indices valides
        for (let i = 0; i < validIndices.length && validPrices.length < CONFIG.maxPricesToAverage; i++) {
            const element = elements[validIndices[i]];
            const priceText = await element.$eval('.price-container', el => el.innerText).catch(() => null);

            if (!priceText) continue;

            const formattedPrice = formatPrice(priceText);
            if (!isNaN(formattedPrice)) {
                validPrices.push(formattedPrice);
                //console.log(`Added price ${formattedPrice} to valid prices list`);
            }
        }

        if (validPrices.length === 0) {
            console.log(`No valid prices found for row ${rowIndex}`);
            return null;
        }

        //console.log(`\nFinal valid prices: ${validPrices.join(', ')}`);
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
