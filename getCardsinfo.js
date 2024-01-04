const fs = require('fs').promises;
const puppeteer = require('puppeteer');

let browser; // Déclarer la variable en dehors du bloc try

(async () => {
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
        '--window-size=1920x1080'
      ]
    });

    const jsonFilePath = 'data.json';
    const data = await fs.readFile(jsonFilePath, 'utf-8');
    const urlsToSearch = JSON.parse(data);

    for (const entry of urlsToSearch) {
      const urlCards = entry.urlCards;
      let currentPage = 1;
      const productInfoList = [];

      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');


      while (true) {
        const fullUrl = `${urlCards}?site=${currentPage}`;
        await page.goto(fullUrl);

        await page.waitForNavigation({ waitUntil: 'networkidle2' }); // Attendre que la page soit complètement chargée
        await page.waitForSelector('.row.no-gutters', { timeout: 600000 }); // 10 minutes


        const pageText = await page.$eval('.mx-1', (span) => span.textContent.trim());

        if (pageText.includes(`Page ${currentPage} sur`)) {
          currentPage++;
        } else {
          break;
        }

        const productList = await page.$$('.row.no-gutters[id^="productRow"]');
        if (productList.length === 0) {
          console.log(`Page ${currentPage} : Liste vide, arrêt de la collecte`);
          break;
        }

        const extractProductInfo = async (productRow) => {
          const cardUrl = await productRow.$eval('.col-10.col-md-8.px-2.flex-column.align-items-start.justify-content-center a', (a) => a.getAttribute('href'));
          const cardNameElement = await productRow.$('.col-10.col-md-8.px-2.flex-column.align-items-start.justify-content-center a');
          const cardNameText = await cardNameElement.evaluate((a) => a.textContent.trim());
          const cardNameMatches = cardNameText.match(/^(.*?)\s*\(([^)]+)\)/);
          const cardName = cardNameMatches ? cardNameMatches[1].trim() : cardNameText;
          const cardEngnameElement = await productRow.$('.d-block.small.text-muted.fst-italic');
          const cardEngname = await cardEngnameElement.evaluate((div) => div.textContent.trim());
          const cardNumberElement = await productRow.$('.col-md-2.d-none.d-lg-flex.has-content-centered');
          const cardNumber = await cardNumberElement.evaluate((div) => div.textContent.trim());
          const cardSerieElement = await productRow.$('.col-10.col-md-8.px-2.flex-column.align-items-start.justify-content-center a');
          const cardSerieText = await cardSerieElement.evaluate((a) => a.textContent.trim());
          const cardSerieMatches = cardSerieText.match(/\(([^)]+)\)/);
          const cardSerie = cardSerieMatches ? cardSerieMatches[1].split(' ')[0].trim() : '';
          let cardRarity;
          try {
            const cardRarityElement = await productRow.$('.d-none.d-md-flex span[data-original-title]');
            cardRarity = await cardRarityElement.evaluate((span) => span.getAttribute('data-original-title'));
          } catch (error) {
            console.log(`Page ${currentPage} : Élément ".d-none.d-md-flex.span[data-original-title]" non trouvé, passage à l'URL suivante : ${urlCards}`);
            return;
          }
          return { cardUrl, cardName, cardEngname, cardNumber, cardSerie, cardRarity };
        };

        const productRows = await page.$$('.row.no-gutters[id^="productRow"]');
        for (const productRow of productRows) {
          const productInfo = await extractProductInfo(productRow);
          productInfoList.push(productInfo);
          await page.waitForTimeout(150); // Attendre 50 millisecondes entre chaque élément
        }
      }

      entry.cards = productInfoList;
      await fs.writeFile(jsonFilePath, JSON.stringify(urlsToSearch, null, 2));

      await page.close();
    }

    console.log('Informations mises à jour avec succès dans data.json');

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
})();
