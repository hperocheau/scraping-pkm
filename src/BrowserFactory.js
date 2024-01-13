const puppeteer = require("puppeteer");
const BrowserConfiguration = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

async function createBrowser() {
    return puppeteer.launch({
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

async function createPage(browser, url) {
    let page = await browser.newPage();
    await page.setUserAgent(BrowserConfiguration);
    await page.goto(url, { waitUntil: "networkidle2" });
    return page;
}

module.exports = {
    createPage,
    createBrowser
}