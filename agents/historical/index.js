#!/usr/bin/env node
// historical-tracking — Store and query historical report data
const fs = require('fs');
const path = require('path');
const DATA_DIR = process.env.REPORT_DATA_DIR || path.join(__dirname, '..', '..', 'data', 'reports');

function saveReport(report) {
  const siteDir = path.join(DATA_DIR, report.site.toLowerCase().replace(/[^a-z0-9]/g, '-'));
  fs.mkdirSync(siteDir, { recursive: true });
  const filename = `${report.generated.replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(path.join(siteDir, filename), JSON.stringify(report, null, 2));
  return path.join(siteDir, filename);
}

function getHistory(site, limit = 10) {
  const siteDir = path.join(DATA_DIR, site.toLowerCase().replace(/[^a-z0-9]/g, '-'));
  if (!fs.existsSync(siteDir)) return [];
  return fs.readdirSync(siteDir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, limit).map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(siteDir, f), 'utf8'));
    return { date: data.generated, score: data.summary.seo_score, grade: data.summary.grade, errors: data.technical_seo.errors, warnings: data.technical_seo.warnings };
  });
}

function getTrend(site) {
  const history = getHistory(site, 8);
  if (history.length < 2) return { trend: 'insufficient_data' };
  const scores = history.map(h => h.score);
  const change = scores[0] - scores[scores.length - 1];
  return { trend: change > 5 ? 'improving' : change < -5 ? 'declining' : 'stable', change, history: scores };
}

const [,, command, ...args] = process.argv;
switch (command) {
  case 'save': const report = JSON.parse(fs.readFileSync(args[0], 'utf8')); console.log(JSON.stringify({ saved: saveReport(report) })); break;
  case 'history': console.log(JSON.stringify(getHistory(args[0], parseInt(args[1]) || 10), null, 2)); break;
  case 'trend': console.log(JSON.stringify(getTrend(args[0]), null, 2)); break;
  default: console.log('Usage: node historical-tracking.js <save|history|trend> [args]');
}
