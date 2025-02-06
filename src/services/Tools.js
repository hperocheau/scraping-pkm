/**
 * Sleep pour un temps donné
 * Ajouter await devant l'appel de la fonction !
 * 
 * @param ms temps d'attente en ms
 * @returns un timeout dans une Promise
 */
function sleep(ms) {
    return new Promise((resolve) => {
        console.log(`!!sleep for ${ms}`);
        setTimeout(resolve, ms);
    });
}

/**
 * Sleep pour un temps random en ms
 * Ajouter await devant l'appel de la fonction !
 * 
 * @param maxMS temps maximum d'attente en ms
 * @returns un timeout dans une Promise
 */
function sleepRandom(maxMS) {
    return sleep(random(maxMS));
}

/**
 * Retourne un nombre aléatoire entre 0 et max
 * (ex: si max=3 les valeurs de retour seront 1, 2 ou 3)
 * 
 * @param max Nombre max généré
 * @returns un nombre aléatoire
 */
function random(max) {
    return Math.floor(Math.random() * max);
}

export default {
    sleep,
    sleepRandom,
    random
}
