const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  // Intercept network requests to find image URLs
  page.on('response', response => {
    const url = response.url();
    if (url.includes('.jpg') || url.includes('.png')) {
      console.log('Image loaded:', url);
    }
  });

  await page.goto('http://epaper.pudhari.news/edition/Pune/PUDHARI_PUN/PUDHARI_PUN_20240501/page/6', { waitUntil: 'networkidle2' });
  await browser.close();
})();
