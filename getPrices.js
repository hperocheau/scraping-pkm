const { execSync } = require('child_process');
const ExcelJS = require('exceljs');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const config = require(path.resolve(__dirname, './src/config.js'));
const xlsxPath = config.xlsxFile;

const updateXlsxScriptPath = './getPrice/formatingXlsx.js';
const getPricesScriptPath = './getPrice/scrapPrices.js';

console.time('script-execution'); // Start timer

function executeCommand(command) {
  try {
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Erreur pendant l'exécution de la commande: ${error.message}`);
  }
}

function checkEmptyCells(worksheet) {
  // Vérifier la présence de cellules vides dans la colonne F
  for (let i = 2; i <= worksheet.lastRow.number; i++) {
    const priceCell = worksheet.getCell(`G${i}`);
    if (priceCell.value === null || priceCell.value === '') {
      return true; // Il y a au moins une cellule vide
    }
  }
  return false; // Aucune cellule vide
}

(async () => {

  executeCommand(`node ${updateXlsxScriptPath}`);

  // Recharger le workbook après l'exécution du script updateXlsxScriptPath
  workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);
  
  const today = moment().format("DD_MM_YYYY");
  let worksheet = workbook.getWorksheet(today);
  console.log(workbook.worksheets.map(ws => ws.name));

  if (!worksheet) {
    console.error(`La feuille avec le nom ${today} n'existe pas.`);
    return;
  }

  while (checkEmptyCells(worksheet)) {
    // Tant qu'il y a des cellules vides dans la colonne F, relancer le script getPrices.js
    executeCommand(`node ${getPricesScriptPath}`);
    
    // Recharger la feuille après l'exécution du script getPrices.js
    workbook = new ExcelJS.Workbook();  // Fermer et réinitialiser le workbook
    await workbook.xlsx.readFile('./test.xlsx');
    
    // Mettre à jour la référence à la feuille après le rechargement
    worksheet = workbook.getWorksheet(today);
  }

  console.log('Toutes les cellules de la colonne F sont remplies.');

  console.timeEnd('script-execution'); // Arrêter le chronomètre et afficher le temps d'exécution
  
})();