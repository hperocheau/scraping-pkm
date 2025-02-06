/**
 * Utilitaires pour le parsing de dates utilisés dans les scripts de scraping CardMarket
 */
const MONTHS_MAP = new Map([
    ['janvier', 0], ['février', 1], ['mars', 2], ['avril', 3], 
    ['mai', 4], ['juin', 5], ['juillet', 6], ['août', 7], 
    ['septembre', 8], ['octobre', 9], ['novembre', 10], ['décembre', 11]
]);

/**
 * Parse une date au format 'JJ mois AAAA' en objet Date
 * @param {string} dateStr - La chaîne de date à parser
 * @returns {Date} Un objet Date
 */
function parseCardMarketDate(dateStr) {
    // Si la date est non trouvée, retourne une date très ancienne
    if (dateStr === 'Date non trouvée') return new Date(0);

    // Séparer le jour, le mois et l'année
    const [day, month, year] = dateStr.split(' ');
    
    // Vérifier que tous les éléments sont présents
    if (!day || !month || !year) {
        console.warn(`Format de date invalide : ${dateStr}`);
        return new Date(0);
    }

    // Récupérer l'index du mois (en minuscules)
    const monthIndex = MONTHS_MAP.get(month.toLowerCase());
    
    // Gérer le cas où le mois n'est pas reconnu
    if (monthIndex === undefined) {
        console.warn(`Mois non reconnu : ${month}`);
        return new Date(0);
    }

    // Créer et retourner l'objet Date
    return new Date(year, monthIndex, parseInt(day));
}

/**
 * Trie un tableau de séries par date, en plaçant les séries sans date à la fin
 * @param {Array} data - Tableau de séries à trier
 * @returns {Array} Tableau trié
 */
function sortSeriesByDate(data) {
    return data.sort((a, b) => {
        if (a.date === 'Date non trouvée') return 1;
        if (b.date === 'Date non trouvée') return -1;
        return parseCardMarketDate(b.date) - parseCardMarketDate(a.date);
    });
}

module.exports = {
    parseCardMarketDate,
    sortSeriesByDate,
    MONTHS_MAP
};