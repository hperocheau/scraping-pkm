const fs = require('fs').promises;
const puppeteer = require('puppeteer');

let browser;

(async () => {
  const start_time = Date.now();

  let productInfoList = []; // Déplace la déclaration ici

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

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );

    const baseUrlDesc = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/Shiny-Treasure-ex?sortBy=collectorsnumber_desc&site=';
    const baseUrlAsc = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/Shiny-Treasure-ex?sortBy=collectorsnumber_asc&site=';

    // Récupérer le nombre de pages pour la première URL
    const { productInfoList: descProductInfoList, pageCount: descPageCount } = await processUrl(baseUrlDesc, 1);
    productInfoList = descProductInfoList; // Initialiser la liste ici
    console.log('Desc Page Count:', descPageCount);
    // Récupérer le nombre de pages pour la deuxième URL si le symbole "+" est présent
    const useBothURLs = descPageCount.includes('+');
    const { productInfoList: ascProductInfoList, pageCount: ascPageCount } = useBothURLs ? await processUrl(baseUrlAsc, 1) : { productInfoList: [], pageCount: '0' };
    console.log('Use Both URLs:', useBothURLs);
    // Fusionner les listes de produits des deux URLs si nécessaire
    productInfoList = useBothURLs ? productInfoList.concat(ascProductInfoList) : productInfoList;

    // Utiliser le nombre de pages de la première URL pour la deuxième URL si nécessaire
    const pageCount = useBothURLs ? descPageCount : ascPageCount;
    console.log('Final Page Count:', pageCount);
    // Écrire les informations dans le fichier JSON
    const fileName = 'test.json';
    await fs.writeFile(fileName, JSON.stringify(productInfoList, null, 2), 'utf-8');
    console.log(`Les informations ont été enregistrées dans le fichier ${fileName}`);

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

  async function processUrl(url, startPage) {
    const pageDesc = await browser.newPage();
    await pageDesc.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );

    let productInfoList = [];

    let pageCount;  // Déplace la déclaration ici
    let rawPageCount;
    for (let currentPage = startPage; currentPage <= (pageCount || 15); currentPage++) {
      console.log(`Traitement de la page ${currentPage}`);

      await pageDesc.goto(url + currentPage, { waitUntil: 'networkidle2' });

      // Récupérer le nombre de pages (pour la première itération seulement)
      if (currentPage === startPage) {
        const pageCountElement = await pageDesc.$('.mx-1');
        const pageCountText = pageCountElement ? await pageCountElement.evaluate(span => span.textContent.trim()) : 'Nombre de pages non trouvé';
        const pageCountMatches = pageCountText.match(/(\d+\s*\+*)$/);
        pageCount = pageCountMatches ? pageCountMatches[1].replace('+', '') : 'Nombre de pages non trouvé';
        rawPageCount = pageCountMatches ? pageCountMatches[1] : 'Nombre de pages non trouvé';
        
        // Si le symbole "+" est présent, utilise les informations de la première URL seulement
        if (rawPageCount.includes('+')) {
          console.log('Utilisation de la première URL uniquement (symbole "+" trouvé).');
          break;
        }

        console.log('Nombre de pages :', pageCount);
      }
    }

      // Récupérer les données des divs "productRow" en utilisant l'évaluation dans la page
      const currentPageProductInfoList = await pageDesc.evaluate(() => {
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
          };
          productInfoList.push(productInfo);
        });

        return productInfoList;
      });

      console.log(`Nombre de div "productRow" traitées : ${currentPageProductInfoList.length}`);

      if (currentPageProductInfoList.length > 0) {
        console.log('Informations des cartes :', currentPageProductInfoList);
        productInfoList.push(...currentPageProductInfoList);
      } else {
        console.log('Aucune information de carte récupérée.');
      }
    }


    return {
      productInfoList,
      pageCount,
    };

})();
