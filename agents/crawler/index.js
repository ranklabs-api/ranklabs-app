#!/usr/bin/env node
// crawler-agent — Playwright-based SEO crawler
const { chromium } = require('playwright');

async function crawl(url) {
  console.log(`Crawling: ${url}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const results = { url, timestamp: new Date().toISOString(), metrics: {}, issues: [] };
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // SEO metrics
    results.metrics = await page.evaluate(() => ({
      title: document.title,
      meta_description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      h1_count: document.querySelectorAll('h1').length,
      h1_texts: Array.from(document.querySelectorAll('h1')).map(h => h.textContent.trim()),
      img_count: document.querySelectorAll('img').length,
      img_no_alt: Array.from(document.querySelectorAll('img')).filter(i => !i.alt).length,
      links_internal: document.querySelectorAll('a[href^="/"], a[href*="' + location.hostname + '"]').length,
      links_external: document.querySelectorAll('a[href^="http"]:not([href*="' + location.hostname + '"])').length,
      has_sitemap: !!document.querySelector('link[rel="sitemap"]'),
      has_canonical: !!document.querySelector('link[rel="canonical"]'),
      has_og: !!document.querySelector('meta[property^="og:"]'),
      has_schema: !!document.querySelector('script[type="application/ld+json"]'),
      word_count: document.body.innerText.split(/\s+/).length,
      text_html_ratio: (document.body.innerText.length / document.body.innerHTML.length * 100).toFixed(1),
    }));
    
    // Performance
    const perf = JSON.parse(await page.evaluate(() => JSON.stringify(performance.timing)));
    results.metrics.load_time_ms = perf.loadEventEnd - perf.navigationStart;
    
    // Technical issues
    const status = await page.evaluate(() => {
      const issues = [];
      if (document.querySelectorAll('h1').length !== 1) issues.push('h1_count');
      if (!document.querySelector('meta[name="description"]')) issues.push('missing_meta_description');
      if (!document.querySelector('link[rel="canonical"]')) issues.push('missing_canonical');
      if (!document.querySelector('script[type="application/ld+json"]')) issues.push('missing_schema');
      const imgs = document.querySelectorAll('img');
      if (Array.from(imgs).some(i => !i.alt)) issues.push('images_missing_alt');
      if (document.title.length < 10 || document.title.length > 70) issues.push('title_length');
      return issues;
    });
    results.issues = status;
    
    // Links
    results.links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href]')).slice(0, 50).map(a => ({
        href: a.href,
        text: a.textContent.trim().substring(0, 50),
        external: !a.href.includes(location.hostname),
      }));
    });
    
  } catch (e) {
    results.error = e.message;
  }
  
  await browser.close();
  return results;
}

// CLI
const url = process.argv[2];
if (!url) {
  console.log('Usage: node crawler-agent.js <url>');
  process.exit(1);
}

crawl(url).then(r => {
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.error ? 1 : 0);
});
