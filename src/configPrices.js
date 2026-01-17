/**
 * Configuration pour le traitement des cartes
 */
module.exports = {
  LANGUAGES: {
    JAPANESE: { patterns: /jp|japonais|jap/i, code: '7' },
    FRENCH: { patterns: /fr|français|francais/i, code: '2' },
    ENGLISH: { patterns: /eng|anglais|english/i, code: '1' }
  },
  DEFAULT_LANGUAGE_CODE: '1', // Anglais par défaut
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
  START_ROW: 2,
  INCLUDE_HEADER: true,
  ADDITIONAL_HEADERS: {
    'F': "Url",
    'G': "Prix moyen"
  },
  REVERSE_PATTERNS: /(reverse|pokeball|masterball)/i,
  
  PRICE_CONFIG: {
    selectors: {
      articleRow: '[id^="articleRow"]',
      priceContainer: '.price-container',
      conditionBadge: '.article-condition .badge',
      productComments: '.d-block.text-truncate.text-muted.fst-italic.small',
      loadMoreButton: '#loadMoreButton'
    },
    maxPricesToAverage: 2, // Nombre max de prix dans la moyenne
    excludedTerms: ['PSA', 'PCA', 'CGC', 'SFG', 'CCC', 'BGS', 'AOG', ' 10 ', ' 9.5 ', ' 9 '],
    pageNavigationTimeout: 20000,
    waitTimeout: 10000,
    loadMoreTimeout: 750,
    maxLoadAttempts: 1,
    saveInterval: 3,
    loadMoreTimeout: 1500,
    waitForLoadedContent: 7000,
    maxRetryAttempts: 2        // Nombre maximum de tentatives pour chaque action
  }
    
};