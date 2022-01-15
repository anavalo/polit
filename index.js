const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
fs = require("fs");
util = require("util");
appendFile = util.promisify(fs.appendFile);

const BASE = "https://www.politeianet.gr";
const URL =
  "https://www.politeianet.gr/index.php?orderby=bestsellers&Itemid=506&option=com_virtuemart&page=shop.browse&category_id=492&manufacturer_id=0&keyword=&keyword1=&keyword2=&kidage=0&limitstart=0";

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
      const content = await page.content();
      const $ = cheerio.load(content);

      $(".home-featured-blockImageContainer > a").each((index, elem) => {
        const title = $(elem).attr("href");
        fn(title);
      });

      // next page URL
      const nextURL = $(".pagination li:nth-child(8) > a").attr("href");
      url = BASE + nextURL;
      await page.waitForTimeout(1500);
    }
  } catch (e) {
    console.error(e);
    browser.close();
  }
}

main();
