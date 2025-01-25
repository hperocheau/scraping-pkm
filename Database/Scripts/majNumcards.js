const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  while (true) {
    try {
      // Load JSON file
      let rawData;
      let data;
      if (fs.existsSync('../data.json')) {
        rawData = fs.readFileSync('../data.json');
        data = JSON.parse(rawData);
      } else {
        data = [];
      }
  /*
          // Étape 1 : Supprimer les valeurs de toutes les clés numCards
    data.forEach(item => {
      item.numCards = ""; // Supprimer toutes les valeurs "numCards"
    });*/

      // Check if all numCards are filled
      const remainingEmptyEntries = data.filter(item => !item.numCards);
      
      if (remainingEmptyEntries.length === 0) {
        console.log('Toutes les entrées ont été traitées.');
        break;
      }

      console.log(`Il reste ${remainingEmptyEntries.length} entrées à traiter.`);

      const browser = await puppeteer.launch({
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
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

      const totalUrls = data.length;
      let urlsProcessed = 0;

      // Iterate through JSON data
      for (const item of data) {
        // Skip if numCards is already populated
        if (item.numCards) {
          continue;
        }

        const url = item.url;
        let numCards;

        try {
          await page.goto(url);
          await page.waitForTimeout(1500);

          // Get number of cards
          const numCardsElement = await page.$('.col-auto.col-md-12:not(.pe-0)');
          numCards = numCardsElement
            ? await numCardsElement.evaluate(el => el.textContent.replace(/●\s*/, '').trim())
            : '';

          // Update numCards
          item.numCards = numCards;

          urlsProcessed++;

          // Show progress percentage
          const progress = (urlsProcessed / totalUrls) * 100;
          console.log(`Progression : ${progress.toFixed(2)}%`);

          await page.waitForTimeout(1500);

          // Write updated data to JSON file
          fs.writeFileSync('../data.json', JSON.stringify(data, null, 2));
        } catch (error) {
          console.error(`Erreur lors de la récupération des données pour l'URL ${url}: ${error}`);
          continue;
        }
      }

      await browser.close();

    } catch (error) {
      console.error('Une erreur s\'est produite : ' + error);
      break;
    }
  }
})();