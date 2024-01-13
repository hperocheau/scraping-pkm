const fs = require('fs').promises;
const puppeteer = require('puppeteer');

let browser;

async function initializeJsonFile(url) {
  const fileName = 'data.json';

  // Read the existing data from the file
  let existingData = [];
  try {
    const rawData = await fs.readFile(fileName, 'utf-8');
    existingData = JSON.parse(rawData);
  } catch (error) {
    // File doesn't exist or is empty
  }

  // Find the entry in existingData that matches the current URL
  const existingEntry = existingData.find((entry) => entry.urlCards === url);

  if (existingEntry) {
    // Check if the "cards" key exists and is an array
    if (!existingEntry.cards || !Array.isArray(existingEntry.cards)) {
      existingEntry.cards = []; // Create the "cards" key as an empty array if it doesn't exist or is not an array
    }
  } else {
    console.error(`Entry not found for URL: ${url}`);
  }

  // Write the updated data back to the file
  await fs.writeFile(fileName, JSON.stringify(existingData, null, 2), 'utf-8');
}

async function getTotalPages(url) {
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  );
  await initializeJsonFile(url); // Initialize the "cards" key at the beginning
  try {
    await page.goto(url, { waitUntil: 'networkidle2' });
    const pageCountElement = await page.$('.mx-1');
    const pageCountText = pageCountElement ? await pageCountElement.evaluate(span => span.textContent.trim()) : 'Nombre de pages non trouvé';
    const pageCountMatches = pageCountText.match(/(\d+\s*\+*)$/);
    const totalPages = pageCountMatches ? parseInt(pageCountMatches[1].replace('+', '')) : 1;
    const hasPlusSymbol = pageCountText.includes('+');

    console.log('Nombre de pages :', totalPages);

    return { totalPages, hasPlusSymbol };
  } catch (error) {
    console.error(`Failed to fetch data from ${url}. Error: ${error.message}`);
    return { totalPages: null, hasPlusSymbol: null };
  } finally {
    await page.close();
  }
}

async function updateJsonFile(url, productInfoList) {
  const fileName = 'data.json';

  // Read the existing data from the file
  let existingData = [];
  try {
    const rawData = await fs.readFile(fileName, 'utf-8');
    existingData = JSON.parse(rawData);
  } catch (error) {
    // File doesn't exist or is empty
  }

  // Find the entry in existingData that matches the current URL
  const existingEntry = existingData.find((entry) => entry.urlCards === url);

  if (existingEntry) {
    // Check if the "cards" key exists and is an array
    if (!existingEntry.cards || !Array.isArray(existingEntry.cards)) {
      existingEntry.cards = []; // Create the "cards" key as an empty array if it doesn't exist or is not an array
    }

    // Merge the new productInfoList with existing data, removing duplicates based on cardUrl
    const uniqueProductInfoList = Array.from(new Set(existingEntry.cards.concat(productInfoList).map(card => card.cardUrl)))
      .map(cardUrl => existingEntry.cards.concat(productInfoList).find(card => card.cardUrl === cardUrl));

    // Sort cards by cardNumber in ascending order
    const sortedProductInfoList = uniqueProductInfoList.sort((a, b) => parseInt(a.cardNumber) - parseInt(b.cardNumber));

    // Update the "cards" key with the sorted productInfoList
    existingEntry.cards = sortedProductInfoList;
  } else {
    console.error(`Entry not found for URL: ${url}`);
  }

  // Write the updated data back to the file
  await fs.writeFile(fileName, JSON.stringify(existingData, null, 2), 'utf-8');
  console.log(`Les informations ont été enregistrées dans le fichier ${fileName}`);
}

async function scrapePages(baseUrl, totalPages, lastCardProductRowId) {
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  );

  let productInfoList = [];
  let lastCardFound = false;

  for (let currentPage = 1; currentPage <= totalPages && !lastCardFound; currentPage++) {
    console.log(`Traitement de la page ${currentPage}`);

    await page.goto(`${baseUrl}${currentPage}`, { waitUntil: 'networkidle2' });

    // Introduce a delay of 2 seconds between page changes (adjust as needed)
    await page.waitForTimeout(3000);

    // Récupérer les données des divs "productRow" en utilisant l'évaluation dans la page
    const currentPageProductInfoList = await page.evaluate(() => {
      const productInfoList = [];
      const productRows = document.querySelectorAll('[id^="productRow"]');

      productRows.forEach(productRow => {
        const cardUrl = productRow.querySelector('.col-10.col-md-8.px-2.flex-column.align-items-start.justify-content-center a')?.getAttribute('href');
        const cardNameElement = productRow.querySelector('.col-10.col-md-8.px-2.flex-column.align-items-start.justify-content-center a');
        const cardNameText = cardNameElement?.textContent.trim();
        const cardNameMatches = cardNameText?.match(/^(.*?)\s*\(([^)]+)\)/);
        const cardName = cardNameMatches ? cardNameMatches[1].trim() : cardNameText;
        const cardEngnameElement = productRow.querySelector('.d-block.small.text-muted.fst-italic');
        const cardEngname = cardEngnameElement?.textContent.trim();
        const cardNumberElement = productRow.querySelector('.col-md-2.d-none.d-lg-flex.has-content-centered');
        const cardNumber = cardNumberElement?.textContent.trim();
        const cardSerieElement = productRow.querySelector('.col-10.col-md-8.px-2.flex-column.align-items-start.justify-content-center a');
        const cardSerieText = cardSerieElement?.textContent.trim();
        const cardSerieMatches = cardSerieText?.match(/\(([^)]+)\)/);
        const cardSerie = cardSerieMatches ? cardSerieMatches[1].split(' ')[0].trim() : '';
        const cardRarityElement = productRow.querySelector('.d-none.d-md-flex span[data-original-title]');
        let cardRarity;
        try {
          cardRarity = cardRarityElement?.getAttribute('data-original-title');
        } catch (error) {
          console.log('Élément ".d-none.d-md-flex.span[data-original-title]" non trouvé');
          return;
        }
        const productInfo = {
          cardUrl,
          cardName,
          cardEngname,
          cardNumber,
          cardSerie,
          cardRarity,
          productRowId: productRow.id, // Include productRow ID in the result
        };
        productInfoList.push(productInfo);
      });

      return productInfoList;
    });

    // Check if the last card's productRow ID is found on the current page
    lastCardFound = currentPageProductInfoList.some(productInfo => productInfo.productRowId === lastCardProductRowId);

    // Print the last productRow ID after processing each page
    const lastProductRowId = currentPageProductInfoList[currentPageProductInfoList.length - 1]?.productRowId;
    console.log(`Last productRow ID on page ${currentPage}: ${lastProductRowId}`);

    // Inside the scrapePages function, after the lastCardFound check
    if (currentPageProductInfoList.length > 0) {
      productInfoList.push(...currentPageProductInfoList);

      // Update the "cards" key in the JSON file
      await updateJsonFile(baseUrl, currentPageProductInfoList);
    } else {
      console.log('Aucune information de carte récupérée.');
    }
  }

  await page.close();

  return productInfoList;
}

async function main() {
  const start_time = Date.now();

  try {
    browser = await puppeteer.launch({
      headless: true,
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

    // Load data.json
    const jsonData = await fs.readFile('data.json', 'utf-8');
    const dataArray = JSON.parse(jsonData);

    // Iterate over each entry in data.json
    for (const entry of dataArray) {
      const { urlCards, numCards, cards } = entry;

      // Check if the number of "cards" elements matches the specified number
      if (cards?.length === parseInt(numCards)) {
        console.log(`Skipping ${urlCards} as the number of cards matches: ${numCards}`);
        continue; // Move on to the next URL
      }

      // Fetch data for the current URL
      const baseUrlDesc = `${urlCards}?sortBy=collectorsnumber_desc&site=`;
      const baseUrlAsc = `${urlCards}?sortBy=collectorsnumber_asc&site=`;

      const { totalPages, hasPlusSymbol } = await getTotalPages(baseUrlDesc);

      if (totalPages !== null) {
        if (hasPlusSymbol) {
          const descProductInfoList = await scrapePages(baseUrlDesc, totalPages);
          const lastCardProductRowId = descProductInfoList[descProductInfoList.length - 1]?.productRowId;
          const ascProductInfoList = await scrapePages(baseUrlAsc, totalPages, lastCardProductRowId);
          const productInfoList = descProductInfoList.concat(ascProductInfoList);

          await updateJsonFile(urlCards, productInfoList);
        } else {
          const productInfoList = await scrapePages(baseUrlDesc, totalPages);
          await updateJsonFile(urlCards, productInfoList);
        }
      }
    }
  } catch (error) {
    console.error('Une erreur s\'est produite : ' + error);
  } finally {
    const end_time = Date.now();
    const execution_time = (end_time - start_time) / 1000;
    console.log(`Durée totale d'exécution : ${execution_time.toFixed(2)} secondes`);
    if (browser) {
      await browser.close();
    }
  }
}

main();
