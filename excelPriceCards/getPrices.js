const puppeteer = require('puppeteer');
const ExcelJS = require('exceljs');


(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('./cartes_url.xlsx'); // Assure-toi de spécifier le chemin correct ici

    const worksheet = workbook.getWorksheet('Feuil1'); // Remplace "Nom_de_ta_feuille" par le nom correct de ta feuille

    let cardType; // Déplacer la déclaration de la variable cardType à l'extérieur de la boucle
    let rowIndex;
    for (let i = 2; i <= worksheet.lastRow.number; i++) {
      rowIndex = i; // <= Ce mec est un génie
      
      const urlCell = worksheet.getCell(`E${i}`);
      const langCell = worksheet.getCell(`D${i}`);
      const cardTypeCell = worksheet.getCell(`A${i}`);
      const url = urlCell.value;
      const language = langCell.value && langCell.value.toString().toLowerCase();
      cardType = cardTypeCell.value && cardTypeCell.value.toString().toLowerCase();

      console.log(`Lecture de l'URL depuis la cellule E${i}: ${url} avec la langue: ${language}`);
      if (url) {
        console.log(`Traitement de l'URL: ${url}`);
        let finalURL = url;

        // Personnaliser l'URL en fonction de la langue
        if (language === 'jp' || language === 'japonais' || language === 'jap') {
          finalURL += '?language=7&';
        } else if (language === 'fr' || language === 'français' || language === 'francais') {
          finalURL += '?language=2&';
        }

        // Mise à jour de l'URL dans le fichier Excel
        urlCell.value = finalURL;

        await page.goto(finalURL);

        // Attendre un certain temps pour que le contenu soit chargé (ajuste cela si nécessaire)
        await page.waitForTimeout(2000);
        
        // Récupérer les valeurs des trois premières balises span
        const averagePrice = await page.evaluate((cardType, rowIndex) => {
          
          const articles = document.querySelectorAll('[id^="articleRow"]');
          const prices = [];

          articles.forEach((elem) => {
            const formatPriceToFloat = (text) => { return parseFloat(text.trim().replace(".", "").replace(',', '.').trim().match(/\d+(?:\.\d+)?/g)) }
            let comment = elem.querySelector('.product-comments')?.textContent;
            const price = elem.querySelector(".price-container").textContent;

            comment = comment === undefined ? "" : comment;

            let formattedPrice = formatPriceToFloat(price);
            
            // si c'est un nombre
            // (ET si cardType Holo + commentaire Holo
            // OU cardType pas holo)
            if (!isNaN(formattedPrice) && ((cardType.includes('holo') && comment.toLowerCase().includes('holo')) || (!cardType.includes('holo') && !comment.toLowerCase().includes('holo'))) ) {
              prices.push(formattedPrice);
            }
                      
            if (prices.length === 0) {
              return; // Aucun prix trouvé
            }
          });

          const numberOfCards = prices.length > 2 ? 3 : prices.length;
          const totalPrice = prices.slice(0, numberOfCards).reduce((acc, price) => acc + price, 0);

          return totalPrice / numberOfCards;
        }, cardType, rowIndex);

        const priceCell = worksheet.getCell(`F${i}`);
        let priceValue = averagePrice !== null ? averagePrice.toFixed(2) : 'no data found'
        priceValue = isNaN(priceValue) ? 'no data found' : priceValue;
        priceCell.value = priceValue;
        console.log(`Prix moyen ajouté à la cellule F${i}: ${priceValue}`);
      }
    }
    await workbook.xlsx.writeFile('./testcartes_url.xlsx').then(() => console.log('Fichier Excel mis à jour avec succès.'));

    await browser.close();
})();