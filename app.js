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
        "name": "Pokémon Products",
        "extension_group_name": "Écarlate et Violet",
        "url": "https://www.cardmarket.com/fr/Pokemon/Expansions/Pokemon-Products",
        "cards_url": "https://www.cardmarket.com/fr/Pokemon/Products/Singles/Pokemon-Products",
        "number_of_cards": "446",
        "published_date": "01/01/1999"
    }
];

for(let extension of extensionList) {
    await SeriesScrapper.findExtensionData(browser, extension);
    await SeriesCardScrapper.findExensionCardList(browser, extension);
    for(let card of extension.card_list) {
        console.log(card);
    }
}

console.log("======= DONE =======");
console.log(extensionList);
console.log("====================")

browser.close();
