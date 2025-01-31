import { launch } from "puppeteer";
const BrowserConfiguration = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

/**
 * Créer une instance du navigateur
 * @returns Une instance navigateur
 */
async function createBrowser() {
    return await launch({
        headless: "new",
        args: [
            "--disable-gpu",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--ignore-certificate-errors",
            "--disable-extensions",
            "--disable-infobars",
            "--disable-notifications",
            "--disable-popup-blocking",
            "--disable-logging",
            "--window-size=1920x1080",
        ],
    });
}

/**
 * Utilise une instance de navigateur pour se rendre sur l'url d'une page donnée
 * 
 * @param browser Instance du navigateur à utiliser
 * @param url Url sur lequel se rendre
 * @returns Une nouvelle instance de page
 */
async function goToPage(browser, url) {
    console.log(`[goToPage]: ${url}`);
    let page = await browser.newPage();
    page.on("console", (msg) => {
        if(msg.text()?.includes("9p2vKq")) return;
        console.log(`>> ${msg.text()}`);
    })
    await page.setUserAgent(BrowserConfiguration);
    await page.goto(url, {
        // waitUntil: "networkidle2",
        timeout: 12000000
    });
    return page;
}

export default {
    goToPage,
    createBrowser
}
