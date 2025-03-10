/**
 * Configuration pour le traitement des cartes
 */
module.exports = {
    LANGUAGES: {
      JAPANESE: { patterns: /jp|japonais|jap/i, code: '7' },
      FRENCH: { patterns: /fr|français|francais/i, code: '2' },
      ENGLISH: { patterns: /eng|anglais|english/i, code: '1' }
    },
    CONDITIONS: {
      'MT': '1', 'NM': '2', 'EX': '3', 'GD': '4', 
      'LP': '5', 'PL': '6', 'PO': '7'
    },
    MATCH_THRESHOLDS: {
      SERIE: 100,
      NUMBER: 100,
      NAME: 60
    },
    ERROR_MESSAGES: {
      NO_SERIE_MATCH: "Aucune correspondance trouvée pour la série",
      NO_NUMBER_MATCH: "Numéro de carte non trouvé",
      NO_NAME_MATCH: "Nom de carte non trouvé avec une similarité suffisante",
      MISSING_REQUIRED: "Données requises manquantes",
      INVALID_CONDITION: "État de carte non valide"
    },
    COLUMN_MAPPING: {
      'A': 'A', 
      'B': 'B', 
      'C': 'C', 
      'D': 'D', 
      'E': 'E'
    },
    START_ROW: 4,
    INCLUDE_HEADER: true,
    ADDITIONAL_HEADERS: {
      'F': "Url",
      'G': "Prix moyen"
    },
    REVERSE_PATTERNS: /(reverse|pokeball|masterball)/i,
    DEFAULT_LANGUAGE_CODE: '1' // Anglais par défaut
  };