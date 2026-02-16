/**
 * configPrices.js
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
    waitTimeout: 60000,
    loadMoreTimeout: 2000, // 2 secondes après clic Load More
    maxLoadAttempts: 3,
    saveInterval: 1,
    loadMoreTimeout: 1500,
    waitForLoadedContent: 7000,
    maxRetryAttempts: 2        // Nombre maximum de tentatives pour chaque action
  },
  // 🔥 NOUVEAUX PARAMÈTRES ANTI-DÉTECTION
  urlDelay: 10000,
  minDelayBetweenRequests: 30000,
  maxDelayBetweenRequests: 40000,
  
  // Délais humains
  humanBehavior: {
    enableMouseMovements: true,      // Mouvements de souris aléatoires
    enableScrolling: true,            // Scroll humain
    enableCookiePersistence: true,    // Sauvegarder cookies entre sessions
    randomDelayVariation: 0.2,        // Variation sur tous les délais
  },
  
  // Changer de signature navigateur fréquemment
  changeSignatureEvery: 2,  // Tous les 2 requêtes (très prudent)
  
  // Gestion agressive des erreurs
  maxConsecutiveErrors: 1,        // Pause dès la PREMIÈRE erreur
  errorCooldownTime: 180000,      // 3 minutes de pause après erreur

    // Activer la gestion manuelle du captcha
  enableCaptchaHandling: true,
  captchaWaitTimeout: 300000,     // 5 minutes max pour résoudre le captcha
    
};