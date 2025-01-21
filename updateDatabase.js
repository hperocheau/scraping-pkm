const { exec } = require('child_process');
const { getUrlsWithInsufficientCards } = require('./test.js');

async function executeGetCardsInfoScript() {
  return new Promise((resolve, reject) => {
    const child = exec('node getCardsinfo.js', (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });

    child.stdout.on('data', (data) => {
      console.log(data);
    });

    child.stderr.on('data', (data) => {
      console.error(data);
    });
  });
}

async function main() {
  let shouldContinue = true;

  while (shouldContinue) {
    const { totalDifference } = await getUrlsWithInsufficientCards();

    if (totalDifference > 0) {
      console.log(`Difference found. Executing getCardsinfo.js script...`);
      await executeGetCardsInfoScript();
    } else {
      console.log('No difference found. Exiting...');
      shouldContinue = false;
    }
  }
}

main();
