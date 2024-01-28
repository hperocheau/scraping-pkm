const puppeteer = require('puppeteer');
const ExcelJS = require('exceljs');
const fs = require('fs');

(async () => {
  console.time('script-execution'); // Démarrer le chronomètre

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

  const workbook = new ExcelJS.Workbook();
  const xlsxFilePath = './cartes_url.xlsx';

  // Vérifier si le fichier Excel existe
  if (fs.existsSync(xlsxFilePath)) {
    await workbook.xlsx.readFile(xlsxFilePath);

    // Générer un nom de feuille valide avec la date d'aujourd'hui
    const today = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
    const existingSheet = workbook.getWorksheet(today);

    let worksheet2;
    if (existingSheet) {
      // Si la feuille existe, utilisez-la
      worksheet2 = existingSheet;
    } else {
      // Sinon, créez une nouvelle feuille avec la date d'aujourd'hui comme nom
      worksheet2 = workbook.addWorksheet(today);

      // Copier la Feuil1 dans la nouvelle feuille
      workbook.getWorksheet('Feuil1').eachRow((row, rowNumber) => {
        const newRow = worksheet2.getRow(rowNumber);
        row.eachCell((cell, colNumber) => {
          newRow.getCell(colNumber).value = cell.value;
        });
      });
    }

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

      // Vérifier si la cellule F contient "no data test"
      const priceCell = worksheet2.getCell(`F${i}`);
      if (priceCell.value === 'no data test') {
        if (url) {
          console.log(`Traitement de l'URL: ${url}`);
          let finalURL = url;

          await page.goto(finalURL);
          await page.waitForTimeout(1500);

          // Vérifier la présence de la balise indiquant l'absence de résultats
          const noResultsElement = await page.$('.noResults.text-center.h3.text-muted.py-5');

          if (noResultsElement) {
            // Balise présente, aucune donnée n'est disponible
            console.log(`Aucune donnée disponible pour la cellule E${i}`);
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

            let priceValue = averagePrice !== null ? averagePrice.toFixed(2) : 'no data found';
            priceValue = isNaN(priceValue) ? 'no data test' : priceValue;
            priceCell.value = priceValue;
            console.log(`Prix moyen ajouté à la cellule F${i} de la feuille Feuil2: ${priceValue}`);
          }
        }
      }
    }

    // Mise à jour du fichier Excel
    await workbook.xlsx.writeFile(xlsxFilePath);
    console.log('Fichier Excel mis à jour avec succès.');
  } else {
    console.error('Le fichier Excel n\'existe pas.');
  }

  await browser.close();
  console.timeEnd('script-execution'); // Arrêter le chronomètre et afficher le temps d'exécution
})();
