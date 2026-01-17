const path = require('path');

// Remonter d'un niveau depuis src pour atteindre la racine du projet
const rootDir = path.resolve(__dirname, '..');

module.exports = {
    // Chemins des ressources principales
    databasePath: path.resolve(rootDir, 'database/database.js'),
    scriptsPath: path.resolve(rootDir, 'database/scripts'),
    xlsxFile: 'Z:\\cartes.xlsx',
    
    // Modules du databaseControl (exportés via index.js)
    databaseControl: path.resolve(rootDir, 'database/databaseControl'),
    
    // Utilitaires
    parseDate: path.resolve(rootDir, 'src/parseDate.js'),

    BrowserFactory: path.resolve(rootDir, 'src/BrowserFactory.js'),
    BrowserUtils: path.resolve(rootDir, 'src/BrowserUtils.js'),
    
    configPrices: path.resolve(rootDir, 'src/configPrices.js'),

};