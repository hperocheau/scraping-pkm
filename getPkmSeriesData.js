const puppeteer = require('puppeteer');
const fs = require('fs');
const { isBefore, parse } = require('date-fns');
const { fr } = require('date-fns/locale');

(async () => {
  try {
    // Charger le fichier JSON
    const rawData = fs.readFileSync('data.json');
    const data = JSON.parse(rawData);

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    const totalUrls = data.length;
    let urlsProcessed = 0;

    // Date actuelle
    const currentDate = new Date();

    // Parcourir les données du JSON
    for (const item of data) {
      const url = item.url; // Utiliser la clé "url" directement

      await page.goto(url);

      // Attendre un certain temps pour que le contenu soit chargé (vous pouvez ajuster ce délai si nécessaire)
      await page.waitForTimeout(1000);

      // Récupérer les valeurs
      const subtitleData = await page.evaluate(() => {
        const subtitles = document.querySelectorAll('.subtitles .col-auto.col-md-12');
        let title = '';
        let date = '';

        if (subtitles.length >= 2) {
          title = subtitles[0].textContent.trim();
          date = subtitles[1].textContent.trim();
        }

        return { title, date };
      });

      // Récupérer les langues dans la balise <div class="languages">
      const languages = await page.evaluate(() => {
        const languageElements = document.querySelectorAll('.languages span[data-original-title]');
        const languageTitles = Array.from(languageElements).map(span => span.getAttribute('data-original-title').trim());
        return languageTitles;
      });

      // Mettre à jour les données
      const itemDate = parse(item.date, 'd MMMM yyyy', new Date(), { locale: fr });

      if (!item.date || item.date === '' || isBefore(itemDate, currentDate) && isBefore(itemDate, currentDate, { addSuffix: true, locale: fr, includeSeconds: true })) {
        item.date = subtitleData.date;
        item.bloc = subtitleData.title;
        item.langues = languages.join(', ');
      }

      // Mettre à jour le compteur d'URLs traitées
      urlsProcessed++;

      // Afficher l'avancement en pourcentage
      const progress = (urlsProcessed / totalUrls) * 100;
      console.log(`Progression : ${progress.toFixed(2)}%`);

      // Attendre un court instant avant de passer à la prochaine URL
      await page.waitForTimeout(1000);
    }

    // Écrire les données mises à jour dans le fichier JSON
    fs.writeFileSync('data.json', JSON.stringify(data, null, 2));

    await browser.close();
  } catch (error) {
    console.error('Une erreur s\'est produite : ' + error);
  }
})();
