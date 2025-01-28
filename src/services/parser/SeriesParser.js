/**
 * 
 * Parse la page des extensions et retourne un objet formaté
 * 
 * @param page Pupeeter instance de la page avec la liste des extensions
 * @returns Liste d'extensions
 */
async function parseExtensionPageList(page) {
    return await page.evaluate( () => {
        let extensionList = [];
        document.querySelectorAll(".expansion-group").forEach(extensionGroupRow => {
            let currentExtensionName = extensionGroupRow.querySelector("h2").textContent?.replace("Voir plusVoir moins", "");
            extensionGroupRow.querySelectorAll(".expansion-row").forEach(extensionRow => {
                let extensionLink = `https://www.cardmarket.com${extensionRow.getAttribute("data-url")}`
                extensionList.push({
                    "name": extensionRow.getAttribute("data-local-name"),
                    "extension_group_name": currentExtensionName,
                    "url": extensionLink,
                    "cards_url": extensionLink.replace('Expansions', 'Products/Singles'),
                    "number_of_cards": extensionRow.querySelector(".col-2.text-center.d-none.d-md-block").textContent?.replace(" cartes", ""),
                    "published_date": (new Date(extensionRow.querySelector(".col-3.text-center.d-none.d-md-block").textContent)).toLocaleDateString("fr")
                });
            });
        });
        return extensionList;
    });
}

export default {
    parseExtensionPageList
}
