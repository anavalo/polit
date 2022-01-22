const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
fs = require("fs");
util = require("util");
appendFile = util.promisify(fs.appendFile);

const BASE = "https://www.politeianet.gr";
const URL =
  "https://www.politeianet.gr/books/index.php?option=com_virtuemart&Itemid=467";

const fn = async (link) => {
  await appendFile("foo.txt", `${link}\n`);
};

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
  });

  let url = URL;

  const page = await browser.newPage();

  try {
    while (true) {
      await page.goto(url).catch((e) => console.error(e));
      await page.waitForTimeout(3000);
      const content = await page.content();


      const $ = cheerio.load(content);

      $(".home-featured-blockImageContainer > a").each((index, elem) => {
        const title = $(elem).attr("href");
        fn(title);
      });

      // next page URL
      const nextURL = $(".pagination li:nth-child(8) > a").attr("href");
      url = BASE + nextURL;
    }
  } catch (e) {
    console.error(e);
  }
  await browser.close();
}

main();
