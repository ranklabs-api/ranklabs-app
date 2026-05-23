#!/usr/bin/env node
// report-agent — Generate weekly SEO reports
const fs = require('fs');

function generateReport(siteName, auditResults, optimizationResults, competitorData) {
  const date = new Date().toISOString().split('T')[0];
  return {
    site: siteName, generated: new Date().toISOString(), period: `Week ending ${date}`,
    summary: {
      seo_score: auditResults.score, grade: auditResults.grade,
      optimizations_applied: optimizationResults?.auto_apply_count || 0,
      optimizations_pending: optimizationResults?.approval_required_count || 0,
      competitors_tracked: competitorData?.length || 0,
    },
    technical_seo: { score: auditResults.score, grade: auditResults.grade, errors: auditResults.errors, warnings: auditResults.warnings, infos: auditResults.infos, top_findings: auditResults.findings.slice(0, 5) },
    performance: { load_time_ms: auditResults.metrics_summary?.load_time, status: auditResults.metrics_summary?.load_time < 2000 ? 'Good' : auditResults.metrics_summary?.load_time < 4000 ? 'Needs Improvement' : 'Poor' },
    content: { word_count: auditResults.metrics_summary?.word_count, title: auditResults.metrics_summary?.title, status: auditResults.metrics_summary?.word_count >= 300 ? 'Adequate' : 'Thin' },
    optimizations: optimizationResults?.optimizations || [],
    competitors: competitorData || [],
    recommendations: [],
  };
}

const [,, siteName, auditFile, optFile, compFile] = process.argv;
if (!siteName) { console.log('Usage: node report-agent.js <site-name> [audit.json] [optimizations.json] [competitors.json]'); process.exit(1); }
const audit = auditFile ? JSON.parse(fs.readFileSync(auditFile, 'utf8')) : { score: 0, grade: 'N/A', errors: 0, warnings: 0, infos: 0, findings: [], metrics_summary: {} };
const opts = optFile ? JSON.parse(fs.readFileSync(optFile, 'utf8')) : null;
const comp = compFile ? JSON.parse(fs.readFileSync(compFile, 'utf8')) : null;
console.log(JSON.stringify(generateReport(siteName, audit, opts, comp), null, 2));
