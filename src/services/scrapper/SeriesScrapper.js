import BrowserFactory from "../BrowserFactory.js";
import SeriesParser from "../parser/SeriesParser.js";
const cardMarketExtensionListURL = "https://www.cardmarket.com/fr/Pokemon/Expansions?order=era";

/**
 * 
 * Récupère toutes les séries et leurs informations (nom, nombre de cartes ...)
 * URL: https://www.cardmarket.com/fr/Pokemon/Expansions?order=era
 * 
 * @returns List des extensions parsées
*/
function findExtensionList(browser) {
    return BrowserFactory.goToPage(browser, cardMarketExtensionListURL)
    .then((page) => {
        return SeriesParser.parseExtensionPageList(page);
    });
}

async function findExtensionData(browser, extension) {
    return BrowserFactory.goToPage(browser, extension.url)
    .then(async (page) => {
        const languages = await page.evaluate( () => {
            let languages = [];
            for(let item of document.querySelector(".languages").children) {
                languages.push(item.getAttribute("data-original-title"))
            }
            console.log(`langauges found ${languages}`);
            return languages;
        })
        extension.languages = languages
        return extension;
    })
}

export default {
    findExtensionList,
    findExtensionData
}
