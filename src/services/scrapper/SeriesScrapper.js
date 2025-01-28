import BrowserFactory from "../BrowserFactory.js";
import SeriesParser from "../parser/SeriesParser.js";
const cardMarketExtensionListURL = "https://www.cardmarket.com/fr/Pokemon/Expansions?order=era";

/**
 * Récupère toutes les séries et leurs informations (nom, nombre de cartes ...)
 * URL: https://www.cardmarket.com/fr/Pokemon/Expansions?order=era
 * 
 * @returns Promise de la liste des extensions parsées
*/
function findExtensionList(browser) {
    return BrowserFactory.goToPage(browser, cardMarketExtensionListURL)
    .then((page) => {
        return SeriesParser.parseExtensionPageList(page);
    });
}

/**
 * Récupère des informations supplémentaires sur l'extension (langues)
 * 
 * @param browser
 * @param extension
 * @returns Promise de la liste des langues du set
 */
function findExtensionData(browser, extension) {
    return BrowserFactory.goToPage(browser, extension.url)
    .then(async (page) => {
        const languages = await page.evaluate( () => {
            let languages = [];
            for(let item of document.querySelector(".languages").children) {
                languages.push(item.getAttribute("data-original-title"))
            }
            return languages;
        })
        extension.languages = languages;
    })
}

export default {
    findExtensionList,
    findExtensionData
}
