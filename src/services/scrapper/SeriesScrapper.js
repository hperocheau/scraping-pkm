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

}

export default {
    findExtensionList
}
