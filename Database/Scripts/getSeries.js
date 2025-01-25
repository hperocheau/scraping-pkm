//
//Récupère le nom, l'url et la date de toutes les séries à partir de l'url https://www.cardmarket.com/fr/Pokemon/Expansions
//
const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    page.on('console', message => console.log(`${message.type().substr(0, 3).toUpperCase()} ${message.text()}`));

    const url = `https://www.cardmarket.com/fr/Pokemon/Expansions`;

    await page.goto(url, { timeout:12000000});

    // Attendre un certain temps pour que le contenu soit chargé (vous pouvez ajuster ce délai si nécessaire)
    await page.waitForTimeout(50000);

    // Récupérer les données des divs "collapseX" en utilisant l'évaluation dans la page
    const dataInfo = await page.evaluate(() => {
      const dataInfo = [];
      const collapseDivs = document.querySelectorAll('[id^="collapse"]');

      collapseDivs.forEach(collapseDiv => {
        const subDivs = collapseDiv.querySelectorAll('div[data-url]');
        subDivs.forEach(subDiv => {
          const urlParts = subDiv.getAttribute('data-url');
          const localName = subDiv.getAttribute('data-local-name');
          const url = `https://www.cardmarket.com${urlParts}`;
          const urlCards = url.replace('Expansions', 'Products/Singles');
          const dateElement = subDiv.querySelector('.col-3.text-center.d-none.d-md-block');
          const date = dateElement ? dateElement.textContent.trim() : 'Date non trouvée';

          dataInfo.push({ localName, url, urlCards, date });
        });
      });

      return dataInfo;
    });

    if (fs.existsSync('../Test1.json')) {
      const existingData = JSON.parse(fs.readFileSync('../Test1.json'));

      // Ajouter les nouvelles données au début du tableau
      dataInfo.forEach(newItem => {
        // Vérifier si l'URL existe déjà
        const urlExists = existingData.some(existingItem => existingItem.url === newItem.url);

        if (!urlExists) {
          existingData.unshift(newItem);
        }
      });

      fs.writeFileSync('../Test1.json', JSON.stringify(existingData, null, 2));
      console.log('Fichier JSON mis à jour avec succès.');
    } else {
      fs.writeFileSync('../Test1.json', JSON.stringify(dataInfo, null, 2));
      console.log('Fichier JSON créé avec succès.');
    }

    await browser.close();
  } catch (error) {
    console.error('Une erreur s\'est produite : ' + error);
  }
})();
