const puppeteer = require('puppeteer');
const ExcelJS = require('exceljs');

(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

// Intercepter les requêtes réseau pour essayer de récupérer les données des prix
page.on('response', async (response) => {
  const url = response.url();

  if (url.includes('https://www.cardmarket.com/fr/Pokemon/Products/Singles/Eevee-Heroes/Umbreon-V-V3-s6a085?language=7&minCondition=2')) {
    // Récupérer le texte de la réponse
    const responseBody = await response.text();

    // Extraire les prix du HTML
    const prices = extractPricesFromHTML(responseBody);

    // Afficher les prix dans les logs
    console.log(`Prix individuels : ${prices.join(', ')}`);

    // Calculer la somme des 3 premiers prix
    const totalSum = prices.slice(0, 3).reduce((acc, price) => acc + price, 0);

    // Écrire la somme dans la cellule F du fichier Excel
    const priceCell = worksheet.getCell(`F${rowIndex}`);
    priceCell.value = totalSum !== 0 ? totalSum.toFixed(2) : 'no data found';
    console.log(`Somme des 3 premiers prix ajoutée à la cellule F${rowIndex}: ${totalSum !== 0 ? totalSum.toFixed(2) : 'no data found'}`);
  }
});

// Fonction pour extraire les prix du HTML
function extractPricesFromHTML(html) {
  const prices = [];
  const regex = /color-primary small text-end text-nowrap fw-bold[^>]*>\s*([\d,.]+)\s*€/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const price = parseFloat(match[1].replace(',', '.'));
    if (!isNaN(price)) {
      prices.push(price);
    }
  }

  return prices;
}


    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('./cartes_url.xlsx'); // Assure-toi de spécifier le chemin correct ici

    const worksheet = workbook.getWorksheet('Feuil1'); // Remplace "Nom_de_ta_feuille" par le nom correct de ta feuille

    let cardType; // Déplacer la déclaration de la variable cardType à l'extérieur de la boucle
    let rowIndex;
    for (let i = 2; i <= worksheet.lastRow.number; i++) {
      rowIndex = i;
      
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
          finalURL += '?language=7&minCondition=2';
        } else if (language === 'fr' || language === 'français' || language === 'francais') {
          finalURL += '?language=2&minCondition=2';
        }

        // Mise à jour de l'URL dans le fichier Excel
        urlCell.value = finalURL;

        await page.goto(finalURL);

        // Attendre un certain temps pour que le contenu soit chargé (ajuste cela si nécessaire)
        await page.waitForTimeout(2000);

        // Récupérer les valeurs des trois premières balises span
        const averagePrice = await page.evaluate((cardType, rowIndex) => {
          const spanElements = document.querySelectorAll('.color-primary.small.text-end.text-nowrap.fw-bold');
          const holoSpans = document.querySelectorAll('.text-truncate.text-muted.fst-italic.small.d-block');
        
          const prices = [];
        
          spanElements.forEach((span, index) => {
            const holoSpan = holoSpans[index];
        
            if (!holoSpan) {
              return;
            }
        
            const holoTitle = holoSpan.getAttribute('data-bs-original-title').toLowerCase();
        
            if (cardType === 'holo' && holoTitle.includes('holo')) {
              const price = parseFloat(span.textContent.trim().replace('€', '').replace(',', '.'));
              if (!isNaN(price)) {
                prices.push(price);
              }
            } else if (cardType !== 'holo') {
              const price = parseFloat(span.textContent.trim().replace('€', '').replace(',', '.'));
              if (!isNaN(price)) {
                prices.push(price);
              }
            }
          });
        
          if (prices.length === 0) {
            return null; // Aucun prix trouvé
          }
        
          // Log des 3 prix individuels
          console.log(`Prix individuels : ${prices.join(', ')}`);
        
          const totalPrice = prices.reduce((acc, price) => acc + price, 0);
          return totalPrice / prices.length;
        }, cardType, rowIndex);
        
        

        // Écrire la moyenne des prix dans la colonne F du fichier Excel
        const priceCell = worksheet.getCell(`F${i}`);
        priceCell.value = averagePrice !== null ? averagePrice.toFixed(2) : 'no data found';
        console.log(`Prix moyen ajouté à la cellule F${i}: ${averagePrice !== null ? averagePrice.toFixed(2) : 'no data found'}`);
        
        
      }
    }

    // Sauvegarder les modifications dans le fichier Excel
    await workbook.xlsx.writeFile('./testcartes_url.xlsx').then(() => console.log('Fichier Excel mis à jour avec succès.'));

    await browser.close();
  } catch (error) {
    console.error('Une erreur s\'est produite : ' + error);
  }
})();