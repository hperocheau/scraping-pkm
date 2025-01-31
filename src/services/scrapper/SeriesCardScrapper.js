import BrowserFactory from "../BrowserFactory.js";
import SeriesCardParser from "../parser/SeriesCardParser.js";
const numberOfCardPerPage = 20;

async function findExensionCardList(browser, extension) {
    if(extension.number_of_cards <= 0) return;
    let cardList = new Map();
    let numberOfPage = Math.ceil(extension.number_of_cards / numberOfCardPerPage);

    try {
        for(let currentPage = 1; currentPage <= numberOfPage; currentPage++) {
            let request = currentPage <= 15 ?
                scrappAscendingCardList(browser, extension.cards_url, currentPage)
                :
                scrappDescendingCardList(browser, extension.cards_url, currentPage - 15)
            ;
            
            let currentPageCardList = await request
            .then((page) => {
                return SeriesCardParser.parseCardPageList(page);
            });
            if(Array.isArray(currentPageCardList)) {
                for(let cardItem of currentPageCardList) {
                    cardList.set(cardItem.url, cardItem);
                }
            } else {
                console.warn("ERROR => currentPageCardList is not an array");
            }
            console.log(`i> Still searching card... (${cardList.size}/${extension.number_of_cards} found)`)
        }
    } catch (error) {
        console.log(`Error: '${error.message}'`);
    }
    console.log(`e> ${cardList.size}/${extension.number_of_cards} found`);
    extension.card_list = cardList.values().toArray();
}

async function scrappAscendingCardList(browser, card_url, index) {
    return BrowserFactory.goToPage(browser, `${card_url}?site=${index}&sortBy=collectorsnumber_asc`);
}

async function scrappDescendingCardList(browser, card_url, index) {
    return BrowserFactory.goToPage(browser, `${card_url}?site=${index}&sortBy=collectorsnumber_desc`);
}

export default {
    findExensionCardList
}
