//
//Pour chaque série du fichier json, récupère les langues, le bloc et le nombre de cartes
//
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    // Charger le fichier JSON
    const filePath = path.join(__dirname, '../Test1.json');
    const data = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath)) : [];

    // Filtrer uniquement les entrées nécessitant une mise à jour
    const itemsToUpdate = data.filter(item => !(item.langues && item.bloc && item.numCards));

    if (itemsToUpdate.length === 0) {
      console.log("Toutes les données sont déjà mises à jour.");
      return;
    }

    // Lancer Puppeteer
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
    await page.setViewport({ width: 1920, height: 1080 });

    const totalUrls = itemsToUpdate.length;
    let urlsProcessed = 0;

    for (const item of itemsToUpdate) {
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded' });

        // Extraction des données en parallèle
        const [languages, bloc, numCards] = await Promise.all([
          page.$$eval('.languages span[data-original-title]', elements => elements.map(el => el.getAttribute('data-original-title').trim())),
          page.$eval('.col-auto.col-md-12.pe-0', el => el.textContent.trim()).catch(() => ''),
          page.$eval('.col-auto.col-md-12:not(.pe-0):not(.span)', el => el.textContent.replace(/●\s*/, '').trim()).catch(() => 'Nombre de cartes non trouvé')
        ]);

        // Mettre à jour uniquement si les valeurs sont vides
        if (!item.langues && languages.length > 0) item.langues = languages.join(', ');
        if (!item.bloc && bloc) item.bloc = bloc;
        if (!item.numCards && numCards) item.numCards = numCards;

      } catch (error) {
        console.error(`Erreur lors de la récupération des données pour l'URL ${item.url}: ${error}`);
        continue;
      }

      urlsProcessed++;
      console.log(`Progression : ${(urlsProcessed / totalUrls * 100).toFixed(2)}%`);
      await page.waitForTimeout(1000);
    }

    // Écriture optimisée : une seule sauvegarde à la fin
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    await browser.close();
    console.log("Mise à jour terminée.");
  } catch (error) {
    console.error("Une erreur s'est produite : ", error);
  }
})();
