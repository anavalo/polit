export const config = {
  base: {
    url: "https://www.politeianet.gr",
    bookListPath: "/index.php?orderby=bestsellers&Itemid=585&option=com_virtuemart&page=shop.browse&category_id=470&manufacturer_id=0&keyword=&keyword1=&keyword2=&kidage=0&limitstart=0"
  },
  scraping: {
    headless: true,
    minDelay: 800,
    maxDelay: 1200,
    timeout: 3000
  },
  selectors: {
    bookLinks: ".home-featured-blockImageContainer > a",
    nextPage: ".pagination li:nth-child(8) > a",
    bookTitle: ".details-right-column > h1",
    bookAuthor: ".details-right-column > b > a",
    recommendations: ".product-reviews-inner"
  },
  files: {
    links: "links.txt",
    output: "religion.csv"
  }
} as const;
