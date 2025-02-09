const fs = require('fs').promises;
const path = require('path');
const browser = require('../../src/BrowserFactory');
const { sortSeriesByDate } = require('../../src/parseDate');
const { checkJsonSeries } = require('../dbCheck/testCheck');

(async () => {
  try {
    const filePath = path.join(__dirname, '../Test1.json');
   
    // Vérification du fichier JSON et récupération des URLs à mettre à jour
    const { urlsToUpdate } = await checkJsonSeries(filePath);
   
    if (urlsToUpdate.length === 0) {
      console.log("Toutes les données sont déjà mises à jour.");
      return;
    }
    // Lecture du fichier JSON
    const jsonContent = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(jsonContent);
   
    // Filtrer les items qui correspondent aux URLs à mettre à jour
    const itemsToUpdate = data.filter(item => urlsToUpdate.includes(item.url));
   
    const page = await browser.createPage();
    const totalUrls = itemsToUpdate.length;
    let urlsProcessed = 0;
    
    for (const item of itemsToUpdate) {
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded' });
         
        // Extraction des données en parallèle
        const [languages, bloc, numCards] = await Promise.all([
          page.$$eval('.languages span[data-original-title]', elements =>
            elements.map(el => el.getAttribute('data-original-title').trim())),
          page.$eval('.col-auto.col-md-12.pe-0', el =>
            el.textContent.trim()).catch(() => ''),
          page.$eval('.col-auto.col-md-12:not(.pe-0):not(.span)', el =>
            el.textContent.replace(/●\s*/, '').trim()).catch(() => 'Nombre de cartes non trouvé')
        ]);
        
        // Mettre à jour uniquement si les valeurs sont vides ou invalides
        if (!item.langues) item.langues = languages.join(', ');
        if (!item.bloc) item.bloc = bloc;
        if (!item.numCards || !/^[0-9]{1,3}\scartes$/.test(item.numCards)) {
          item.numCards = numCards;
        }
        
        // Écriture immédiate dans le fichier JSON après chaque traitement
        const updatedData = data.map(d => 
          d.url === item.url ? { ...d, ...item } : d
        );
        const sortedData = sortSeriesByDate(updatedData);
        await fs.writeFile(filePath, JSON.stringify(sortedData, null, 2));
        
        urlsProcessed++;
        console.log(`Progression : ${(urlsProcessed / totalUrls * 100).toFixed(2)}% - URL: ${item.url}`);
        await page.waitForTimeout(1000);
      } catch (error) {
        console.error(`Erreur lors de la récupération des données pour l'URL ${item.url}: ${error}`);
        continue;
      }
    }
   
    await browser.closeBrowser();
    console.log("Mise à jour terminée.");
  } catch (error) {
    console.error("Une erreur s'est produite : ", error);
    await browser.closeBrowser();
  }
})();