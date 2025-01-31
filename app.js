import BrowserFactory from "./src/services/BrowserFactory.js";
import SeriesCardScrapper from "./src/services/scrapper/SeriesCardScrapper.js";
import SeriesScrapper from "./src/services/scrapper/SeriesScrapper.js";

console.log("Start scrapping CardMarket");

const browser = await BrowserFactory.createBrowser();
console.log("Create Browser instance");
// const extensionList = await SeriesScrapper.findExtensionList(browser);
const extensionList = [
    // {
    //     "name": "Évolutions Prismatiques",
    //     "extension_group_name": "Écarlate et Violet",
    //     "url": "https://www.cardmarket.com/fr/Pokemon/Expansions/Prismatic-Evolutions",
    //     "cards_url": "https://www.cardmarket.com/fr/Pokemon/Products/Singles/Prismatic-Evolutions",
    //     "number_of_cards": "180",
    //     "published_date": "17/01/2025"
    // },
    {
        "name": "Shiny Treasure ex",
        "extension_group_name": "Écarlate et Violet JP",
        "url": "https://www.cardmarket.com/fr/Pokemon/Expansions/Shiny-Treasure-ex",
        "cards_url": "https://www.cardmarket.com/fr/Pokemon/Products/Singles/Shiny-Treasure-ex",
        "number_of_cards": "360",
        "published_date": "01/12/2023"
    }
];

for(let extension of extensionList) {
    await SeriesScrapper.findExtensionData(browser, extension);
    await SeriesCardScrapper.findExensionCardList(browser, extension);
    // for(let card of extension.card_list) {
    //     console.log(card);
    // }
}

console.log("======= DONE =======");
console.log(extensionList);
console.log("====================")

browser.close();
