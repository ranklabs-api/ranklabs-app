#!/usr/bin/env node
// seo-audit-agent — Technical SEO analysis from crawler data
const fs = require('fs');

function audit(crawlData) {
  const { url, metrics, issues } = crawlData;
  const findings = [];
  let score = 100;
  
  // Title analysis
  if (metrics.title.length < 30) { findings.push({severity: 'warning', check: 'title_length', detail: `Title too short (${metrics.title.length} chars)`}); score -= 5; }
  if (metrics.title.length > 60) { findings.push({severity: 'warning', check: 'title_length', detail: `Title too long (${metrics.title.length} chars)`}); score -= 5; }
  
  // Meta description
  if (!metrics.meta_description) { findings.push({severity: 'error', check: 'meta_description', detail: 'Missing meta description'}); score -= 15; }
  else if (metrics.meta_description.length < 50) { findings.push({severity: 'warning', check: 'meta_description', detail: 'Meta description too short'}); score -= 5; }
  else if (metrics.meta_description.length > 160) { findings.push({severity: 'warning', check: 'meta_description', detail: 'Meta description too long'}); score -= 5; }
  
  // Headings
  if (metrics.h1_count === 0) { findings.push({severity: 'error', check: 'h1', detail: 'Missing H1 tag'}); score -= 20; }
  if (metrics.h1_count > 1) { findings.push({severity: 'warning', check: 'h1', detail: `Multiple H1s (${metrics.h1_count})`}); score -= 10; }
  
  // Images
  if (metrics.img_no_alt > 0) { findings.push({severity: 'warning', check: 'img_alt', detail: `${metrics.img_no_alt} images missing alt text`}); score -= metrics.img_no_alt * 2; }
  
  // Schema
  if (!metrics.has_schema) { findings.push({severity: 'warning', check: 'schema', detail: 'No structured data found'}); score -= 10; }
  
  // Canonical
  if (!metrics.has_canonical) { findings.push({severity: 'warning', check: 'canonical', detail: 'Missing canonical URL'}); score -= 5; }
  
  // Open Graph
  if (!metrics.has_og) { findings.push({severity: 'info', check: 'og', detail: 'No Open Graph tags'}); score -= 3; }
  
  // Sitemap
  if (!metrics.has_sitemap) { findings.push({severity: 'info', check: 'sitemap', detail: 'No sitemap link found'}); score -= 3; }
  
  // Performance
  if (metrics.load_time_ms > 3000) { findings.push({severity: 'warning', check: 'performance', detail: `Slow load time: ${(metrics.load_time_ms/1000).toFixed(1)}s`}); score -= 10; }
  
  // Content
  if (metrics.word_count < 300) { findings.push({severity: 'info', check: 'content', detail: `Thin content (${metrics.word_count} words)`}); score -= 5; }
  
  score = Math.max(0, Math.min(100, score));
  
  const errors = findings.filter(f => f.severity === 'error').length;
  const warnings = findings.filter(f => f.severity === 'warning').length;
  const infos = findings.filter(f => f.severity === 'info').length;
  
  return {
    url, score,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    errors, warnings, infos,
    findings,
    metrics_summary: {
      title: metrics.title,
      description: metrics.meta_description?.substring(0, 100),
      word_count: metrics.word_count,
      load_time: metrics.load_time_ms,
      h1: metrics.h1_texts?.[0] || 'none',
    }
  };
}

// CLI
const input = process.argv[2];
if (!input) {
  console.log('Usage: node seo-audit-agent.js <crawl-output.json>');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(input, 'utf8'));
console.log(JSON.stringify(audit(data), null, 2));
