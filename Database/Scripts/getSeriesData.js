const puppeteer = require('puppeteer');
const fs = require('fs');
const { isBefore, parse } = require('date-fns');
const { fr } = require('date-fns/locale');

(async () => {
  try {
    // Charger le fichier JSON
    let rawData;
    let data;

    if (fs.existsSync('../data.json')) {
      rawData = fs.readFileSync('../data.json');
      data = JSON.parse(rawData);
    } else {
      data = [];
    }

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
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    const totalUrls = data.length;
    let urlsProcessed = 0;

    // Date actuelle
    const currentDate = new Date();

    // Parcourir les données du JSON
    for (const item of data) {
      const url = item.url; // Utiliser la clé "url" directement

      // Skip if "numCards" is "0 cartes"
      if (item.numCards === "0 cartes") {
        // Set "none" for "langues" and "bloc" if not already set
        item.langues = item.langues || "none";
        item.bloc = item.bloc || "none";

        urlsProcessed++;
        continue;
      }

      // Skip if both "langues" and "bloc" keys already exist
      if (item.langues && item.bloc) {
        urlsProcessed++;
        continue;
      }

      let languages;
      let bloc;

      try {
        await page.goto(url);

        // Attendre un certain temps pour que le contenu soit chargé (vous pouvez ajuster ce délai si nécessaire)
        await page.waitForTimeout(1500);

        // Récupérer les langues dans la balise <div class="languages">
        const languageElements = await page.$$('.languages span[data-original-title]');
        languages = languageElements ? await Promise.all(languageElements.map(span => span.evaluate(el => el.getAttribute('data-original-title').trim()))) : [];

        // Récupérer la valeur du premier bloc
        const blocElement = await page.$('.col-auto.col-md-12.pe-0');
        bloc = blocElement ? await blocElement.evaluate(el => el.textContent.trim()) : '';

      } catch (error) {
        console.error(`Erreur lors de la récupération des données pour l'URL ${url}: ${error}`);
        continue; // Continue to the next iteration if there's an error
      }

      // Mettre à jour les données seulement si "langues" et/ou "bloc" sont vides ou n'existent pas
      if (!item.langues && languages.length > 0) {
        item.langues = languages.join(', ');
      }

      if (!item.bloc && bloc) {
        item.bloc = bloc;
      }

      // Mettre à jour le compteur d'URLs traitées
      urlsProcessed++;

      // Afficher l'avancement en pourcentage
      const progress = (urlsProcessed / totalUrls) * 100;
      console.log(`Progression : ${progress.toFixed(2)}%`);

      // Attendre un court instant avant de passer à la prochaine URL
      await page.waitForTimeout(1500);

      // Écrire les données mises à jour dans le fichier JSON
      fs.writeFileSync('../data.json', JSON.stringify(data, null, 2));
    }

    await browser.close();
  } catch (error) {
    console.error('Une erreur s\'est produite : ' + error);
  }
})();
