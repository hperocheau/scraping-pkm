const puppeteer = require('puppeteer');
const ExcelJS = require('exceljs');
const moment = require('moment');
const fs = require('fs');

(async () => {
  console.time('script-execution'); // Start timer

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  const workbook = new ExcelJS.Workbook();
  const xlsxFilePath = './Commandes_poke.xlsx';
  await workbook.xlsx.readFile(xlsxFilePath); // Ajoutez cette ligne
  const today = moment().format("DD_MM_YYYY");
  const worksheet = workbook.getWorksheet(today);

  

  if (worksheet) {
    let cardType;
    let rowIndex;

    for (let i = 2; i <= worksheet.lastRow.number; i++) {
      try {
        rowIndex = i;
        const urlCell = worksheet.getCell(`E${i}`);
        const cardTypeCell = worksheet.getCell(`A${i}`);
        const url = urlCell.value;
        cardType = cardTypeCell.value && cardTypeCell.value.toString().toLowerCase();
        
        console.log(`Reading URL from cell E${i}: ${url}`);

        // Check if the cell F is empty
        const priceCell = worksheet.getCell(`F${i}`);
        const priceCellValue = priceCell.value !== null ? priceCell.value.toString().trim().toLowerCase() : '';

        if (priceCellValue === '') {
          // Process URL
          let finalURL = url;
          
          // Wait for the page to load without introducing extra delay
          await page.goto(finalURL, { waitUntil: 'networkidle0' });

          // Use async/await with selectors instead of explicit timeouts
          //const noResultsElement = await page.waitForSelector('.noResults.text-center.h3.text-muted.py-5', { visible: true, timeout: 1500 });
          const noResultsElement = await page.$('.noResults.text-center.h3.text-muted.py-5');

          if (noResultsElement) {
            console.log(`No data available for cell E${i}`);
            priceCell.value = 'no data found';
          } else {
            // Calculate average price
            const averagePriceResult = await calculateAveragePrice(page, cardType, rowIndex);

            if (averagePriceResult !== null) {
              priceCell.value = averagePriceResult.toFixed(2);
              console.log(`Updated cell F${i} with average price: ${priceCell.value}`);
            } else {
              console.log(`Couldn't find any valid price for cell E${i}`);
            }
          }
        } else {
          console.log(`Skipping updated cell F${i}`);
        }
      } catch (error) {
        console.error(`Error processing cell E${i}: ${error.message}`);
      }
    }

    // Write back to file after all updates have been processed
    await workbook.xlsx.writeFile(xlsxFilePath);
    console.log(`Excel file successfully updated. Sheet used: ${today}`);
  } else {
    console.error(`Sheet "${today}" does not exist.`);
  }

  await browser.close();
  console.timeEnd('script-execution'); // Stop timer and display elapsed time
})();

/**
 * Function to encapsulate calculating the average price
 * @param {import('puppeteer').Page} page - Puppeteer Page instance
 * @param {string|null} cardType - Card type string or null
 * @param {number} rowIndex - Row index number
 */
async function calculateAveragePrice(page, cardType, rowIndex) {
  try {
    const articles = await page.$$eval('[id^="articleRow"]', (elements, cardType) => {
      const formatPriceToFloat = text => parseFloat(text.trim().replace(".", "").replace(",", ".").trim().match(/[\d,.]+/)?.[0]);

      return Array.from(elements).filter(element => {
        const price = formatPriceToFloat(element.querySelector(".price-container")?.innerText);

        if (!isNaN(price)) {
          const comments = element.querySelector('.product-comments')?.innerText?.toLowerCase();
          return (cardType?.includes('holo') && comments?.includes('holo')) || (!cardType?.includes('holo') && !comments?.includes('holo'));
        }
      }).map(element => formatPriceToFloat(element.querySelector(".price-container")?.innerText));
    }, cardType);

    if (articles.length > 0) {
      const filteredArticles = articles.filter(Boolean).slice(0, 3); // Take only the first 3 prices
      const sum = filteredArticles.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
      return sum / filteredArticles.length; // Divide by the actual number of prices
    }

    console.log(`No valid prices found for cell E${rowIndex}`);
    return null;
  } catch (error) {
    console.error(`Error during evaluation for cell E${rowIndex}: ${error.message}`);
    return null;
  }
}