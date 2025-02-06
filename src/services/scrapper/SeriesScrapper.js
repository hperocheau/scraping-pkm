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
 * Retourne une liste d'extension fix pour les tests
 * 
 * @returns une list d'extension
 */
function getDummyExtensionList() {
    return [
        {
            "name": "Shiny Treasure ex",
            "extension_group_name": "Écarlate et Violet JP",
            "url": "https://www.cardmarket.com/fr/Pokemon/Expansions/Shiny-Treasure-ex",
            "cards_url": "https://www.cardmarket.com/fr/Pokemon/Products/Singles/Shiny-Treasure-ex",
            "number_of_cards": "360",
            "published_date": "01/12/2023"
        }
    ];
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
    getDummyExtensionList,
    findExtensionData
}
