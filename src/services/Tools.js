function sleep(ms) {
    return new Promise((resolve) => {
        console.log(`!!sleep for ${ms}`);
        setTimeout(resolve, ms);
    });
}

function sleepRandom(maxMS) {
    return sleep(random(maxMS));
}

function random(max) {
    return Math.floor(Math.random() * max);
}

export default {
    sleep,
    sleepRandom,
    random
}
