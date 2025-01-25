//
//Pour chaque série du fichier json, récupère les langues, le bloc et le nombre de cartes
//
const puppeteer = require('puppeteer');
const fs = require('fs');
const { isBefore, parse } = require('date-fns');
const { fr } = require('date-fns/locale');

(async () => {
  try {
    // Charger le fichier JSON
    let rawData;
    let data;
    if (fs.existsSync('../Test.json')) {
      rawData = fs.readFileSync('../Test.json');
      data = JSON.parse(rawData);
    } else {
      data = [];
    }
    
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
    
    // Parcourir les données du JSON
    for (const item of data) {
      const url = item.url;
      
      // Skip if all required information is already present
      if (item.langues && item.bloc && item.numCards) {
        urlsProcessed++;
        continue;
      }
      
      let languages;
      let bloc;
      let numCards;
      
      try {
        await page.goto(url);
        await page.waitForTimeout(1500);
        
        // Récupérer les langues
        const languageElements = await page.$$('.languages span[data-original-title]');
        languages = languageElements ? await Promise.all(languageElements.map(span => span.evaluate(el => el.getAttribute('data-original-title').trim()))) : [];
        
        // Récupérer le bloc
        const blocElement = await page.$('.col-auto.col-md-12.pe-0');
        bloc = blocElement ? await blocElement.evaluate(el => el.textContent.trim()) : '';
        
        // Récupérer le nombre de cartes
        const numCardsElement = await page.$('.col-auto.col-md-12:not(.pe-0):not(.span)');
        numCards = numCardsElement 
          ? await numCardsElement.evaluate(el => el.textContent.replace(/●\s*/, '').trim()) 
          : 'Nombre de cartes non trouvé';
        
      } catch (error) {
        console.error(`Erreur lors de la récupération des données pour l'URL ${url}: ${error}`);
        continue;
      }
      
      // Mettre à jour les données
      if (!item.langues && languages.length > 0) {
        item.langues = languages.join(', ');
      }
      
      if (!item.bloc && bloc) {
        item.bloc = bloc;
      }
      
      if (!item.numCards && numCards) {
        item.numCards = numCards;
      }
      
      urlsProcessed++;
      
      // Afficher l'avancement en pourcentage
      const progress = (urlsProcessed / totalUrls) * 100;
      console.log(`Progression : ${progress.toFixed(2)}%`);
      
      await page.waitForTimeout(1500);
      
      // Écrire les données mises à jour dans le fichier JSON
      fs.writeFileSync('../Test.json', JSON.stringify(data, null, 2));
    }
    
    await browser.close();
  } catch (error) {
    console.error('Une erreur s\'est produite : ' + error);
  }
})();