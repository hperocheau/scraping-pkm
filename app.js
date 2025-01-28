const { findExtensionList } = require("./src/services/scrapper/SeriesScrapper");

// Retrieve series and number of cards by series
console.log("Start scrapping CardMarket");
findExtensionList();

// Parse every pages of the serie
// 