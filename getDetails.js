const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
fs = require("fs");
util = require("util");
appendFile = util.promisify(fs.appendFile);
const readline = require("readline");

const fn = async (data) => {
  await appendFile("final.csv", data);
};

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
  });
  
  const page = await browser.newPage();
  const fileStream = fs.createReadStream("foo.txt");

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    await page.goto(line).catch((e) => console.log(e, "PAGE PROBLEM"));

    const content = await page.content();
    const $ = cheerio.load(content);

    const bookUrl = line;
    const title = $(".details-right-column > h1").text();
    const author = $(".details-right-column > b > a").text();
    const recommendations = $(".product-reviews-inner").first().children().length - 1;
    const data = `${title}\t${author}\t${recommendations}\t${bookUrl}\n`;
    fn(data);
    await page.waitForTimeout(1200);
  }
  browser.close();
}

main();
