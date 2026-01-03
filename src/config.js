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
    
    // Ou si tu veux être plus spécifique :
    // analyzers: path.resolve(rootDir, 'database/databaseControl/analyzers'),
};