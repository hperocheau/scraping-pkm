import BrowserFactory from "./src/services/BrowserFactory.js";
import SeriesCardScrapper from "./src/services/scrapper/SeriesCardScrapper.js";
import SeriesScrapper from "./src/services/scrapper/SeriesScrapper.js";

console.log("s> Start scrapping CardMarket");

const browser = await BrowserFactory.createBrowser();
console.log("s> Create Browser instance");
const extensionList = await SeriesScrapper.findExtensionList(browser);

for(let extension of extensionList) {
    console.log(`Parsing extesion ${extension.name} - [${extension.number_of_cards} cards]`)
    await SeriesScrapper.findExtensionData(browser, extension);
    if(extension.number_of_cards <= 0) continue;
    await SeriesCardScrapper.findExensionCardList(browser, extension);
}

console.log("======= DONE =======");
console.log(extensionList);
console.log("====================")

browser.close();
