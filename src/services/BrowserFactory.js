const puppeteer = require("puppeteer");
const BrowserConfiguration = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

async function createBrowser() {
    return await puppeteer.launch({
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

async function goToPage(browser, url) {
    let page = await browser.newPage();
    page.on("console", (msg) => {
        console.log(`>> ${msg.text()}`);
    })
    await page.setUserAgent(BrowserConfiguration);
    await page.goto(url, {
        // waitUntil: "networkidle2",
        timeout: 12000000
    });
    return page;
}

module.exports = {
    goToPage,
    createBrowser
}