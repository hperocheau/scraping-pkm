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

async function scrapePages(url, totalPages, lastCardProductRowId) {
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  );

  let productInfoList = [];
  let lastCardFound = false;

  for (let currentPage = 1; currentPage <= totalPages && !lastCardFound; currentPage++) {
    console.log(`Traitement de la page ${currentPage}`);

    await page.goto(`${url}${currentPage}`, { waitUntil: 'networkidle2' });

    // Introduce a delay of 2 seconds between page changes (adjust as needed)
    await page.waitForTimeout(2500);

    // Récupérer les données des divs "productRow" en utilisant l'évaluation dans la page
    const currentPageProductInfoList = await page.evaluate(() => {
      const productInfoList = [];
      const productRows = document.querySelectorAll('[id^="productRow"]');

      productRows.forEach(productRow => {
        const cardUrl = productRow.querySelector('.col-10.col-md-8.px-2.flex-column.align-items-start.justify-content-center a').getAttribute('href');
        const cardNameElement = productRow.querySelector('.col-10.col-md-8.px-2.flex-column.align-items-start.justify-content-center a');
        const cardNameText = cardNameElement.textContent.trim();
        const cardNameMatches = cardNameText.match(/^(.*?)\s*\(([^)]+)\)/);
        const cardName = cardNameMatches ? cardNameMatches[1].trim() : cardNameText;
        const cardEngnameElement = productRow.querySelector('.d-block.small.text-muted.fst-italic');
        const cardEngname = cardEngnameElement.textContent.trim();
        const cardNumberElement = productRow.querySelector('.col-md-2.d-none.d-lg-flex.has-content-centered');
        const cardNumber = cardNumberElement.textContent.trim();
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
          productRowId: productRow.id, // Include productRow ID in the result
        };
        productInfoList.push(productInfo);
      });

      return productInfoList;
    });

    console.log(`Nombre de div "productRow" traitées : ${currentPageProductInfoList.length}`);

    if (currentPageProductInfoList.length > 0) {
      productInfoList.push(...currentPageProductInfoList);
    } else {
      console.log('Aucune information de carte récupérée.');
    }

    // Check if the last card's productRow ID is found on the current page
    lastCardFound = currentPageProductInfoList.some(productInfo => productInfo.productRowId === lastCardProductRowId);

    // Print the last productRow ID after processing each page
    const lastProductRowId = currentPageProductInfoList[currentPageProductInfoList.length - 1]?.productRowId;
    console.log(`Last productRow ID on page ${currentPage}: ${lastProductRowId}`);
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

    const baseUrlDesc = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/Pokemon-Trading-Card-Game-Classic-Venusaur-Lugia-ex-Deck?sortBy=collectorsnumber_desc&site=';
    const baseUrlAsc = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/Pokemon-Trading-Card-Game-Classic-Venusaur-Lugia-ex-Deck?sortBy=collectorsnumber_asc&site=';

    // Récupérer les informations pour la première URL
    const { totalPages, hasPlusSymbol } = await getTotalPages(baseUrlDesc);

    if (totalPages !== null) {
      // Si le symbole "+" est présent, récupérer les informations pour les deux URLs
      if (hasPlusSymbol) {
        // Get the last productRow ID from the first URL (baseUrlDesc)
        const descProductInfoList = await scrapePages(baseUrlDesc, totalPages);
        const lastCardProductRowId = descProductInfoList[descProductInfoList.length - 1]?.productRowId;

        const ascProductInfoList = await scrapePages(baseUrlAsc, totalPages, lastCardProductRowId);

        // Fusionner les listes de produits des deux URLs
        const productInfoList = descProductInfoList.concat(ascProductInfoList);

        // Remove duplicates based on cardUrl
        const uniqueProductInfoList = Array.from(new Set(productInfoList.map(card => card.cardUrl)))
          .map(cardUrl => productInfoList.find(card => card.cardUrl === cardUrl));

        // Sort cards by cardNumber in descending order
        const sortedProductInfoList = uniqueProductInfoList.sort((a, b) => parseInt(b.cardNumber) - parseInt(a.cardNumber));

        // Écrire les informations dans le fichier JSON
        const fileName = 'test.json';
        await fs.writeFile(fileName, JSON.stringify(sortedProductInfoList, null, 2), 'utf-8');
        console.log(`Les informations ont été enregistrées dans le fichier ${fileName}`);
      } else {
        // Si le symbole "+" n'est pas présent, récupérer les informations pour la première URL seulement
        const productInfoList = await scrapePages(baseUrlDesc, totalPages);

        // Remove duplicates based on cardUrl
        const uniqueProductInfoList = Array.from(new Set(productInfoList.map(card => card.cardUrl)))
          .map(cardUrl => productInfoList.find(card => card.cardUrl === cardUrl));

        // Sort cards by cardNumber in descending order
        const sortedProductInfoList = uniqueProductInfoList.sort((a, b) => parseInt(b.cardNumber) - parseInt(a.cardNumber));

        // Écrire les informations dans le fichier JSON
        const fileName = 'test.json';
        await fs.writeFile(fileName, JSON.stringify(sortedProductInfoList, null, 2), 'utf-8');
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