const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto('https://online-magazin-api.vercel.app', { waitUntil: 'networkidle' });
    const content = await page.content();
    fs.writeFileSync('vercel_source.html', content);
    
    // Check if 'Muddatli' exists in the text
    const hasMuddatli = content.includes('Muddatli');
    console.log('Has Muddatli text on home page?', hasMuddatli);
    
    await browser.close();
  } catch (err) {
    console.error(err);
    await browser.close();
  }
})();
