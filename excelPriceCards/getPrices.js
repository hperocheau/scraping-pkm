const puppeteer = require('puppeteer');
const ExcelJS = require('exceljs');

(async () => {
  console.time('script-execution'); // Démarrer le chronomètre

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('./cartes_url.xlsx'); 

  const worksheet1 = workbook.getWorksheet('Feuil1'); 
  const worksheet2 = workbook.addWorksheet('Feuil2'); 

  // Copier la Feuil1 dans la Feuil2
  worksheet1.eachRow((row, rowNumber) => {
    const newRow = worksheet2.getRow(rowNumber);
    row.eachCell((cell, colNumber) => {
      newRow.getCell(colNumber).value = cell.value;
    });
  });

  let cardType; 
  let rowIndex;

  for (let i = 2; i <= worksheet2.lastRow.number; i++) {
    rowIndex = i;
    const urlCell = worksheet2.getCell(`E${i}`);
    const langCell = worksheet2.getCell(`D${i}`);
    const cardTypeCell = worksheet2.getCell(`A${i}`);
    const url = urlCell.value;
    const language = langCell.value && langCell.value.toString().toLowerCase();
    cardType = cardTypeCell.value && cardTypeCell.value.toString().toLowerCase();

    console.log(`Lecture de l'URL depuis la cellule E${i}: ${url} avec la langue: ${language}`);
    await page.waitForTimeout(1500);

    if (url) {
      console.log(`Traitement de l'URL: ${url}`);
      let finalURL = url;

      // Personnaliser l'URL en fonction de la langue
      if (language === 'jp' || language === 'japonais' || language === 'jap') {
        finalURL += '?language=7&minCondition=2&isSigned=N&isPlayset=N&isAltered=N';
      } else if (language === 'fr' || language === 'français' || language === 'francais') {
        finalURL += '?language=2&minCondition=2&isSigned=N&isPlayset=N&isAltered=N';
      }

      // Mise à jour de l'URL dans le fichier Excel
      urlCell.value = finalURL;

      await page.goto(finalURL);
      await page.waitForTimeout(1500);

      // Vérifier la présence de la balise indiquant l'absence de résultats
      const noResultsElement = await page.$('.noResults.text-center.h3.text-muted.py-5');

      if (noResultsElement) {
        // Balise présente, aucune donnée n'est disponible
        console.log(`Aucune donnée disponible pour la cellule E${i}`);
        const priceCell = worksheet2.getCell(`F${i}`);
        priceCell.value = 'no data found';
      } else {
        // Balise non trouvée, il y a des données ou la page est HS
        // Récupérer les valeurs des trois premières balises span
        const averagePrice = await page.evaluate((cardType, rowIndex) => {
          const articles = document.querySelectorAll('[id^="articleRow"]');
          const prices = [];

          articles.forEach((elem) => {
            const formatPriceToFloat = (text) => parseFloat(text.trim().replace(".", "").replace(',', '.').trim().match(/\d+(?:\.\d+)?/g))
            let comment = elem.querySelector('.product-comments')?.textContent;
            const price = elem.querySelector(".price-container").textContent;

            comment = comment === undefined ? "" : comment;

            let formattedPrice = formatPriceToFloat(price);

            // si c'est un nombre
            // (ET si cardType Holo + commentaire Holo
            // OU cardType pas holo)
            if (!isNaN(formattedPrice) && ((cardType.includes('holo') && comment.toLowerCase().includes('holo')) || (!cardType.includes('holo') && !comment.toLowerCase().includes('holo')))) {
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

        await page.waitForTimeout(1500);

        const priceCell = worksheet2.getCell(`F${i}`);
        let priceValue = averagePrice !== null ? averagePrice.toFixed(2) : 'no data found';
        priceValue = isNaN(priceValue) ? 'no data test' : priceValue;
        priceCell.value = priceValue;
        console.log(`Prix moyen ajouté à la cellule F${i} de la feuille Feuil2: ${priceValue}`);
      }
    }
  }

  await workbook.xlsx.writeFile('./cartes_url.xlsx').then(() => console.log('Fichier Excel mis à jour avec succès.'));
  await browser.close();

  console.timeEnd('script-execution'); // Arrêter le chronomètre et afficher le temps d'exécution
})();
