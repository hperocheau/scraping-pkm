import BrowserFactory from "../BrowserFactory.js";
import SeriesCardParser from "../parser/SeriesCardParser.js";
const numberOfCardPerPage = 20;

async function findExensionCardList(browser, extension) {
    if(extension.number_of_cards <= 0) return;
    let cardList = [];
    let numberOfPage = Math.min(Math.ceil(extension.number_of_cards / numberOfCardPerPage), 15);
    for(let i = 1; i <= numberOfPage; i++) {
        let currentPageCardList = await BrowserFactory.goToPage(browser, `${extension.cards_url}?site=${i}`)
        .then((page) => {
            return SeriesCardParser.parseCardPageList(page);
        });
        if(Array.isArray(currentPageCardList)) {
            console.log(`Found '${currentPageCardList.length}' card on page ${i}/${numberOfPage}`);
            cardList = [...cardList, ...currentPageCardList];
        } else {
            console.warn("ERROR => currentPageCardList is not an array");
        }
    }
    console.log(`= ${cardList.length}/${extension.number_of_cards} found`);
    extension.card_list = cardList;
}

export default {
    findExensionCardList
}
