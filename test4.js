const fs = require('fs').promises;
const puppeteer = require('puppeteer');

let browser;

async function getTotalPages(url) {
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  );

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

async function scrapePages(url, totalPages, lastProductRowSelector) {
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  );
  let lastProductRowFound = false;
  let productInfoList = [];

  for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
   console.log(`Traitement de la page ${currentPage}`);

   await page.goto(`${url}${currentPage}`, { waitUntil: 'networkidle2' });

   // Introduce a delay of 2 seconds between page changes (adjust as needed)
   await page.waitForTimeout(2500);

   // Récupérer les données des divs "productRow" en utilisant l'évaluation dans la page
   const currentPageProductInfoList = await page.evaluate((lastProductRowSelector) => {
     const productInfoList = [];
     const productRows = document.querySelectorAll('[id^="productRow"]');

      productRows.forEach(productRow => {
        // Extract and save data from the page
        // ... Your code to save data ...

        const cardNumberElement = productRow.querySelector('.col-md-2.d-none.d-lg-flex.has-content-centered');
        const cardNumber = cardNumberElement ? cardNumberElement.textContent.trim() : '';

        const cardUrl = productRow.querySelector('.col-10.col-md-8.px-2.flex-column.align-items-start.justify-content-center a').getAttribute('href');
        const cardNameElement = productRow.querySelector('.col-10.col-md-8.px-2.flex-column.align-items-start.justify-content-center a');
        const cardNameText = cardNameElement.textContent.trim();
        const cardNameMatches = cardNameText.match(/^(.*?)\s*\(([^)]+)\)/);
        const cardName = cardNameMatches ? cardNameMatches[1].trim() : cardNameText;
        const cardEngnameElement = productRow.querySelector('.d-block.small.text-muted.fst-italic');
        const cardEngname = cardEngnameElement.textContent.trim();
        const cardSerieElement = productRow.querySelector('.col-10.col-md-8.px-2.flex-column.align-items-start.justify-content-center a');
        const cardSerieText = cardSerieElement.textContent.trim();
        const cardSerieMatches = cardSerieText.match(/\(([^)]+)\)/);
        const cardSerie = cardSerieMatches ? cardSerieMatches[1].split(' ')[0].trim() : '';
        const cardRarityElement = productRow.querySelector('.d-none.d-md-flex span[data-original-title]');
        let cardRarity;
        try {
          cardRarity = cardRarityElement.getAttribute('data-original-title');
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
        };
        productInfoList.push(productInfo);
      });

      return productInfoList;
    }, lastProductRowSelector);

    console.log(`Nombre de div "productRow" traitées : ${currentPageProductInfoList.length}`);

    if (currentPageProductInfoList.length > 0) {
      productInfoList.push(...currentPageProductInfoList);
    } else {
      console.log('Aucune information de carte récupérée.');
    }

    // Check if the last productRow from the first URL exists on the current page
    const lastProductRowExists = await page.evaluate((lastProductRowSelector) => {
      const lastProductRow = document.querySelector(lastProductRowSelector);
      return lastProductRow !== null;
    }, lastProductRowSelector);

    if (lastProductRowExists) {
      console.log(`La dernière carte de la première URL a été trouvée sur la page ${currentPage}. Arrêt de la récupération.`);
      lastProductRowFound = true;
      break;
    }
  }

  if (!lastProductRowFound) {
    console.log(`La dernière carte de la première URL n'a pas été trouvée sur les pages de la deuxième URL.`);
  }

  console.log(`Pages traitées jusqu'à présent : ${Array.from({ length: totalPages }, (_, i) => i + 1).join(', ')}`);
  console.log('Nombre total de div "productRow" traitées :', productInfoList.length);

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

    const baseUrlDesc = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/Shiny-Treasure-ex?sortBy=collectorsnumber_desc&site=';
    const baseUrlAsc = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/Shiny-Treasure-ex?sortBy=collectorsnumber_asc&site=';

    // Récupérer les informations pour la première URL
    const { totalPages, hasPlusSymbol } = await getTotalPages(baseUrlDesc);

    if (totalPages !== null) {
      // Si le symbole "+" est présent, récupérer les informations pour les deux URLs
      if (hasPlusSymbol) {
        const lastProductRowSelector = '.last-product-row-selector-from-first-url';
        const descProductInfoList = await scrapePages(baseUrlDesc, totalPages, lastProductRowSelector);
        const ascProductInfoList = await scrapePages(baseUrlAsc, totalPages, lastProductRowSelector);

        // Fusionner les listes de produits des deux URLs
        const productInfoList = descProductInfoList.concat(ascProductInfoList);

        // Écrire les informations dans le fichier JSON
        const fileName = 'test.json';
        await fs.writeFile(fileName, JSON.stringify(productInfoList, null, 2), 'utf-8');
        console.log(`Les informations ont été enregistrées dans le fichier ${fileName}`);
      } else {
        // Si le symbole "+" n'est pas présent, récupérer les informations pour la première URL seulement
        const productInfoList = await scrapePages(baseUrlDesc, totalPages);

        // Écrire les informations dans le fichier JSON
        const fileName = 'test.json';
        await fs.writeFile(fileName, JSON.stringify(productInfoList, null, 2), 'utf-8');
        console.log(`Les informations ont été enregistrées dans le fichier ${fileName}`);
      }
    }
  } catch (error) {
    console.error('Une erreur s\'est produite : ' + error);
  } finally {
    const end_time = Date.now();
    const execution_time = (end_time - start_time) / 1000; // Durée en secondes
    console.log(`Durée totale d'exécution : ${execution_time.toFixed(2)} secondes`);
    if (browser) {
      await browser.close();
    }
  }
}

main();
