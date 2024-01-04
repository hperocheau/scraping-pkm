const axios = require('axios');
const cheerio = require('cheerio');

async function getTotalPages(url) {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        const totalPagesElement = $('.total-pages');
        const totalPages = totalPagesElement.length ? parseInt(totalPagesElement.text()) : 1;

        const hasPlusSymbol = $('.plus-symbol').length > 0;

        return { totalPages, hasPlusSymbol };
    } catch (error) {
        console.error(`Failed to fetch data from ${url}. Error: ${error.message}`);
        return { totalPages: null, hasPlusSymbol: null };
    }
}

async function scrapePages(url, totalPages) {
    for (let page = 1; page <= totalPages; page++) {
        const pageUrl = `${url}?page=${page}`;

        try {
            const response = await axios.get(pageUrl);
            const $ = cheerio.load(response.data);

            // Extract and save data from the page
            // ... Your code to save data ...

            console.log(`Scraped data from ${pageUrl}`);
        } catch (error) {
            console.error(`Failed to fetch data from ${pageUrl}. Error: ${error.message}`);
        }
    }
}

async function main() {
    // Replace these URLs with the actual URLs you're working with
    const baseUrlDesc = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/Shiny-Treasure-ex?sortBy=collectorsnumber_desc&site=';
    const baseUrlAsc = 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/Shiny-Treasure-ex?sortBy=collectorsnumber_asc&site=';

    const { totalPages, hasPlusSymbol } = await getTotalPages(baseUrlDesc);

    if (totalPages !== null) {
        if (hasPlusSymbol) {
            // If there's a "+", scrape data from both URLs
            await scrapePages(baseUrlDesc, totalPages);
            //const { totalPages: totalPagesUrl2 } = await getTotalPages(baseUrlAsc);
            await scrapePages(baseUrlAsc, totalPages);
        } else {
            // If no "+", scrape data from the first URL only
            await scrapePages(baseUrlDesc, totalPages);
        }
    }
}

main();
