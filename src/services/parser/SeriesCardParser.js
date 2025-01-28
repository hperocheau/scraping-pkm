/**
 * Parse une page avec une liste de cartes
 * 
 * @param page instance de la page avec la liste des cartes à parser
 * @returns Liste des cartes
 */
async function parseCardPageList(page) {
    return await page.evaluate( () => {
        let productList = document.querySelectorAll('[id^="productRow"]');
        let cardList = [];
        if(productList.length <= 0) {
            return cardList;
        }
        productList.forEach(productRow => {
            let cardLinkTag = productRow.querySelector('.col-10.col-md-8.px-2.flex-column.align-items-start.justify-content-center a');
            let cardItalicNameTag = productRow.querySelector('.d-block.small.text-muted.fst-italic');
            let cardNumberTag = productRow.querySelector('.col-md-2.d-none.d-lg-flex.has-content-centered');
            let cardRarityTag = productRow.querySelector('.d-none.d-md-flex span[data-original-title]');
            cardList.push({
                "product_row_id": productRow.id,
                "url": cardLinkTag?.getAttribute('href'),
                "name": cardLinkTag?.textContent.trim(),
                "name_english": cardItalicNameTag?.textContent.trim(),
                "number": cardNumberTag?.textContent.trim(),
                "card_rarity": cardRarityTag?.getAttribute('data-original-title')
            })
        });
        return cardList
    });
}

export default {
    parseCardPageList
}
