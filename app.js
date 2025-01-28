import BrowserFactory from "./src/services/BrowserFactory.js";
import SeriesScrapper from "./src/services/scrapper/SeriesScrapper.js";

console.log("Start scrapping CardMarket");

const browser = await BrowserFactory.createBrowser();
console.log("Create Browser instance");
const extensionList = await SeriesScrapper.findExtensionList(browser);
// const extensionList = [
//     {
//         "name": "Évolutions Prismatiques",
//         "extension_group_name": "Écarlate et Violet",
//         "url": "https://www.cardmarket.com/fr/Pokemon/Expansions/Prismatic-Evolutions",
//         "cards_url": "https://www.cardmarket.com/fr/Pokemon/Products/Singles/Prismatic-Evolutions",
//         "number_of_cards": "180",
//         "published_date": "17/01/2025"
//     }
// ];

for(let extension of extensionList) {
    console.log(extension);
}

browser.close();

// Parse every pages of the serie
