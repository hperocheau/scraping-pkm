/**
 * Récupère la liste des extensions de cartes présentes sur CardMarket (https://cardmarket.com/fr/Pokemon)
 * puis la liste des cartes des extensions récupérées.
 * 
 * Une fois les données récupérées elles sont enregistrées dans un fichier JSON
 */

import BrowserFactory from "./src/services/BrowserFactory.js";
import SeriesCardScrapper from "./src/services/scrapper/SeriesCardScrapper.js";
import SeriesScrapper from "./src/services/scrapper/SeriesScrapper.js";
import fs from "fs"

const output = {
    folder: './output',
    filename: 'data.json',
    indent: 4
}

console.log("s> Start scrapping CardMarket");
const browser = await BrowserFactory.createBrowser();
console.log("s> Created Browser instance");

const extensionList = await SeriesScrapper.findExtensionList(browser);
// > Activer cette ligne pour tester la récupération de cartes une liste d'extension spécifique
// const extensionList = SeriesScrapper.getDummyExtensionList();

// Boucle à travers les extensions
for(let extension of extensionList) {
    console.log(`Parsing extension ${extension.name} - [${extension.number_of_cards} cards]`);
    // On récupère les données supplémentaire de l'extension
    await SeriesScrapper.findExtensionData(browser, extension);

    // Si l'extension ne contient pas de cartes on quitte direct
    if(extension.number_of_cards <= 0) continue;
    // On récupère la liste des cartes de l'extension
    await SeriesCardScrapper.findExensionCardList(browser, extension);
}

// On ferme le navigateur (attention il ne peut plus être utilisé une fois fermé)
browser.close();

try {
    // Si le répertooire d'output n'existe pas on le créé
    if(!fs.existsSync(output.folder)) {
        fs.mkdirSync(output.folder);
    }
    fs.writeFileSync(
        `${output.folder}/${output.filename}`,
        JSON.stringify(
            extensionList,
            null,
            output.indent
        )
    );
} catch (err) {
    console.log(`Error while saving output file: ${err.message}`);
}

console.log("======= DONE =======");
console.log(extensionList);
console.log("====================")
