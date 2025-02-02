// jsonValidators.js
const fs = require('fs').promises;
const path = require('path');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

/**
 * Vérifie si une chaîne de caractères est vide ou nullish
 * @param {string} value - La valeur à vérifier
 * @returns {boolean} true si la valeur est vide, false sinon
 */
const isEmpty = (value) => {
  return value === null || value === undefined || value.trim() === '';
};

/**
 * Récupère le dernier fichier HTML du dossier parent
 * @param {string} currentDir - Chemin du dossier actuel
 * @returns {Promise<string>} Chemin du dernier fichier HTML
 */
const getLatestHtmlFile = async (currentDir) => {
  const parentDir = path.join(currentDir, '..');
  const files = await fs.readdir(parentDir);
  const htmlFiles = files.filter(file => path.extname(file).toLowerCase() === '.html');
  
  if (htmlFiles.length === 0) {
    throw new Error('Aucun fichier HTML trouvé dans le dossier parent');
  }

  return path.join(parentDir, htmlFiles[0]);
};

/**
 * Récupère les données de séries depuis le fichier HTML
 * @param {string} htmlPath - Chemin du fichier HTML
 * @returns {Promise<Array>} Données des séries
 */
const getHtmlSeriesData = async (htmlPath) => {
  const htmlContent = await fs.readFile(htmlPath, 'utf-8');
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;
  
  const seriesData = [];
  document.querySelectorAll('[id^="collapse"]').forEach(collapseDiv => {
    collapseDiv.querySelectorAll('div[data-url]').forEach(subDiv => {
      const urlParts = subDiv.getAttribute('data-url');
      seriesData.push({
        localName: subDiv.getAttribute('data-local-name'),
        url: `https://www.cardmarket.com${urlParts}`
      });
    });
  });
  
  return seriesData;
};

/**
 * Vérifie si une date est au format "DD MM YYYY"
 * @param {string} dateStr - La date à vérifier
 * @returns {boolean} true si le format est valide, false sinon
 */
const isValidDateFormat = (dateStr) => {
  const validMonths = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ];

  if (dateStr === 'Date non trouvée') return true;

  const parts = dateStr.toLowerCase().split(' ');
  if (parts.length !== 3) return false;

  const [day, month, year] = parts;
  const dayNum = parseInt(day);
  if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) return false;
  if (!validMonths.includes(month)) return false;
  const yearNum = parseInt(year);
  if (isNaN(yearNum) || year.length !== 4) return false;

  return true;
};

/**
 * Vérifie la validité de la structure et du contenu du JSON des séries
 * @param {Object[]} jsonData - Les données JSON à valider
 * @returns {Promise<Object>} Résultat de la validation avec les erreurs éventuelles
 */
const isGetSeriesOk = async (jsonData) => {
  const errors = [];

  if (!Array.isArray(jsonData)) {
    return {
      isValid: false,
      errors: ['Le JSON doit être un tableau']
    };
  }

  try {
    // Récupération et validation des données HTML
    const htmlPath = await getLatestHtmlFile(__dirname);
    const htmlSeriesData = await getHtmlSeriesData(htmlPath);

    // Vérification de chaque élément du JSON
    for (const item of jsonData) {
      // Vérification des clés requises
      const requiredKeys = ['localName', 'url', 'urlCards', 'date'];
      
      for (const key of requiredKeys) {
        if (!item[key] || isEmpty(item[key])) {
          errors.push({
            localName: item.localName || 'Nom non défini',
            url: item.url || 'URL non définie',
            errorKey: key,
            error: `Clé "${key}" manquante ou vide`
          });
        }
      }

      // Vérification du format de la date
      if (item.date && !isValidDateFormat(item.date)) {
        errors.push({
          localName: item.localName || 'Nom non défini',
          url: item.url || 'URL non définie',
          errorKey: 'date',
          error: `Format de date invalide : ${item.date}`
        });
      }

      // Vérification de la correspondance avec les données HTML
      const htmlMatch = htmlSeriesData.find(
        htmlItem => htmlItem.localName === item.localName && htmlItem.url === item.url
      );

      if (!htmlMatch) {
        errors.push({
          localName: item.localName || 'Nom non défini',
          url: item.url || 'URL non définie',
          errorKey: 'html_match',
          error: 'Données non trouvées dans le fichier HTML source'
        });
      }
    }

  } catch (error) {
    errors.push({
      localName: 'N/A',
      url: 'N/A',
      errorKey: 'html_validation',
      error: `Erreur lors de la validation HTML: ${error.message}`
    });
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
};

module.exports = {
  isGetSeriesOk
};