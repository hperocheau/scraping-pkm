const puppeteer = require('puppeteer');
const ExcelJS = require('exceljs');
const moment = require('moment');
const fs = require('fs');

(async () => {
  console.time('script-execution'); // Démarrer le chronomètre

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

  const workbook = new ExcelJS.Workbook();
  const xlsxFilePath = './Commandes_poke.xlsx';

  // Vérifier si le fichier Excel existe
  if (fs.existsSync(xlsxFilePath)) {
    await workbook.xlsx.readFile(xlsxFilePath);

    // Générer un nom de feuille valide avec la date d'aujourd'hui
    const today = moment().format("DD_MM_YYYY");
    const worksheet = workbook.getWorksheet(today);

    if (worksheet) {
      // Set the header for column F
      worksheet.getCell('F1').value = 'Prix moyen';

      let cardType;
      let rowIndex;

      for (let i = 2; i <= worksheet.lastRow.number; i++) {
        try {
          rowIndex = i;
          const urlCell = worksheet.getCell(`E${i}`);
          const cardTypeCell = worksheet.getCell(`A${i}`);
          const url = urlCell.value;
          cardType = cardTypeCell.value && cardTypeCell.value.toString().toLowerCase();
      
          console.log(`Lecture de l'URL depuis la cellule E${i}: ${url}`);
          await page.waitForTimeout(1500);
      
          // Vérifier si la cellule F contient "no data test"
          const priceCell = worksheet.getCell(`F${i}`);
          const priceCellValue = priceCell.value !== null ? priceCell.value.toString().trim().toLowerCase() : '';
      
          if (priceCellValue === 'no data test' || priceCellValue === '') {
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
                console.log(`Début de l'évaluation pour la cellule E${rowIndex}`);
              
                try {
                  const articles = document.querySelectorAll('[id^="articleRow"]');
                  const prices = [];
              
                  articles.forEach((elem, index) => {
                    console.log(`Traitement de l'article ${index + 1}`);
                  
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
      
                if (prices.length === 0) {
                  console.log(`Aucun prix trouvé pour la cellule E${rowIndex}`);
                  return null; // Aucun prix trouvé
                }
            
                const numberOfCards = prices.length > 2 ? 3 : prices.length;
                const totalPrice = prices.slice(0, numberOfCards).reduce((acc, price) => acc + price, 0);
            
                console.log(`Fin de l'évaluation pour la cellule E${rowIndex}`);
                return totalPrice / numberOfCards;
              } catch (error) {
                console.error(`Erreur pendant l'évaluation de la page pour la cellule E${rowIndex}: ${error.message}`);
                return null;
              }
            }, cardType, rowIndex);
      
              if (averagePrice !== null) {
                await page.waitForTimeout(1500);
      
                let priceValue = averagePrice.toFixed(2);
                priceCell.value = priceValue;
                console.log(`Prix moyen ajouté à la cellule F${i} de la feuille ${today}: ${priceCell}`);
              } else {
                console.log(`Aucun prix moyen trouvé pour la cellule E${i}`);
              }
            }
          } else {
            console.log(`La cellule F${i} n'a pas besoin d'être mise à jour.`);
          }
        } catch (error) {
          console.error(`Erreur lors du traitement de la cellule E${i}: ${error.message}`);
        }
      }

      // Mise à jour du fichier Excel
      await workbook.xlsx.writeFile(xlsxFilePath);
      console.log(`Fichier Excel mis à jour avec succès. Feuille utilisée : ${today}`);
    } else {
      console.error(`La feuille avec le nom ${today} n'existe pas.`);
    }
  } else {
    console.error('Le fichier Excel n\'existe pas.');
  }

  await browser.close();
  console.timeEnd('script-execution'); // Arrêter le chronomètre et afficher le temps d'exécution
})();
