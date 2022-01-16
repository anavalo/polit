const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
fs = require("fs");
util = require("util");
appendFile = util.promisify(fs.appendFile);
const readline = require("readline");
const FILE_TO_PARSE = "foo.txt";

const fn = async (data) => {
  await appendFile("final.csv", data);
};

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);

  const fileStream = fs.createReadStream(FILE_TO_PARSE);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    try {
      await page
        .goto(line)
        .catch((e) => console.log(e, `PAGE PROBLEM at ${line}`));

      const content = await page.content();
      const $ = cheerio.load(content);

      const bookUrl = line;
      const title = $(".details-right-column > h1").text();
      const author = $(".details-right-column > b > a").text();
      let recommendationsNum;
      const recommendations = $(".product-reviews-inner").first();

      if ($("h4", recommendations).text().startsWith("To βιβλίο")) {
        recommendationsNum =
          $(".product-reviews-inner").first().children().length - 1;
      } else {
        recommendationsNum = 0;
      }

      const data = `${title}\t${author}\t${recommendationsNum}\t${bookUrl}\n`;
      console.log(data);
      fn(data);
      await page.waitForTimeout(randomInteger(600, 2000));
    } catch (e) {
      console.log("ERROR EXCEPTION");
    }
  }

  await browser.close();
}

main();
