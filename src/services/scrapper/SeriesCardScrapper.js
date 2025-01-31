import BrowserFactory from "../BrowserFactory.js";
import SeriesCardParser from "../parser/SeriesCardParser.js";
const numberOfCardPerPage = 20;

async function findExensionCardList(browser, extension) {
    if(extension.number_of_cards <= 0) return;
    let cardList = [];
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
                console.log(`Found '${currentPageCardList.length}' card on page ${currentPage}/${numberOfPage}`);
                if(cardList.length + currentPageCardList.length > extension.number_of_cards) {
                    cardListExistingUrl = cardList.map( item => item.url );
                    currentPageCardList.filter( (item) => {
                        !cardListExistingUrl.includes(item.url);
                    });
                }
                cardList = [...cardList, ...currentPageCardList];
                if(currentPage >= 15) {
                    if(cardList.length >= extension.number_of_cards) {
                        throw new Error("Done scrapping");
                    }
                }
            } else {
                console.warn("ERROR => currentPageCardList is not an array");
            }
        }
    } catch (error) {
        console.log(`Error: '${error.message}'`);
    }
    console.log(`= ${cardList.length}/${extension.number_of_cards} found`);
    extension.card_list = cardList;
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
