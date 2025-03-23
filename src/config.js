const path = require('path');

// Remonter d'un niveau depuis src pour atteindre la racine du projet
const rootDir = path.resolve(__dirname, '..');

module.exports = {
    databasePath: path.resolve(rootDir, 'database/database.js'),
    scriptsPath: path.resolve(rootDir, 'database/scripts'),
    jsonControl: path.resolve(rootDir, 'database/databaseControl/controlFunctions/jsonEntryControl.js'),
    cardsCount: path.resolve(rootDir, 'database/databaseControl/allCardsCount.js'),
    checkDupe: path.resolve(rootDir, 'database/databaseControl/checkDupeCards.js'),
    //xlsxFile: path.resolve(rootDir, 'cartes.xlsx')
    xlsxFile: 'Z:\\cartes.xlsx'
};
