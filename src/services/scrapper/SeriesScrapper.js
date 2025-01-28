const { createBrowser, goToPage } = require("../BrowserFactory");
const { parseExtensionPageList } = require("../parser/SeriesParser");
const cardMarketExtensionListURL = "https://www.cardmarket.com/fr/Pokemon/Expansions?order=era";

/**
 * 
 * Récupère toutes les séries et leurs informations (nom, nombre de cartes ...)
 * URL: https://www.cardmarket.com/fr/Pokemon/Expansions?order=era
 * 
 * @returns List des extensions parsées
*/
async function findExtensionList() {
    const browser = await createBrowser();

    const extensions = await goToPage(browser, cardMarketExtensionListURL)
    .then((page) => {
        return parseExtensionPageList(page);
    })
    browser.close();
    console.log(extensions.length);
}

module.exports = {
    findExtensionList
}
