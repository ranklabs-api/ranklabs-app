#!/usr/bin/env node
// email-agent — Branded HTML email delivery for Rank Labs SEO reports
// Usage: node email-agent.js <report.json> [--customer-id=<id> | --email=<addr> | --preview]
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// ── Branding ──────────────────────────────────────────────────────────────
const BRAND = {
  primary:    '#7c3aed',
  secondary:  '#3b82f6',
  accent:     '#06b6d4',
  bg:         '#f8f7ff',
  surface:    '#ffffff',
  text:       '#1e1b4b',
  muted:      '#6b7280',
  success:    '#10b981',
  warning:    '#f59e0b',
  danger:     '#ef4444',
  logo:       'https://getranklabs.com/logo.svg',
  site:       'https://getranklabs.com',
  from:       'hello@getranklabs.com',
  fromName:   'Rank Labs',
};

function gradeColor(grade) {
  const map = { A: BRAND.success, B: BRAND.warning, C: '#f97316', D: BRAND.danger, F: BRAND.danger };
  return map[grade] || BRAND.muted;
}

function generateEmailHtml(report, customer) {
  const biz = customer?.business_name || report.site;
  const { summary, technical_seo, performance, content, optimizations, blog, recommendations } = report;

  const findings = (technical_seo.top_findings || []).map(f =>
    `<tr><td style="padding:6px 0;border-bottom:1px solid #e5e7eb">
      <span style="color:${f.severity==='error'?BRAND.danger:f.severity==='warning'?BRAND.warning:BRAND.accent};font-weight:600">
        ${f.severity.toUpperCase()}
      </span> — ${f.detail}
    </td></tr>`
  ).join('') || '<tr><td style="padding:6px 0;color:#9ca3af">No issues found</td></tr>';

  const recs = recommendations.length > 0
    ? recommendations.map(r => `<li style="margin:6px 0">${r.title || r.action || r}</li>`).join('')
    : '<li style="color:#9ca3af">No new recommendations</li>';

  const gapList = (blog?.content_gaps || []).slice(0, 5).map(g => g.topic).join(', ') || 'none';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; background:#f3f4f6 }
  .container { max-width:600px; margin:0 auto; background:#fff }
  .header { background:linear-gradient(135deg,${BRAND.primary},${BRAND.secondary}); padding:32px 24px; text-align:center }
  .header h1 { color:#fff; font-size:22px; margin:0 0 4px; font-weight:700 }
  .header .sub { color:rgba(255,255,255,0.8); font-size:14px; margin:0 }
  .score-ring { display:inline-block; background:rgba(255,255,255,0.15); border-radius:50%; width:80px; height:80px; line-height:80px; font-size:36px; font-weight:800; color:#fff; margin:16px 0 8px }
  .grade-badge { display:inline-block; padding:3px 14px; border-radius:12px; font-size:13px; font-weight:700; color:#fff; background:${gradeColor(summary.grade)}; margin-left:6px; vertical-align:middle }
  .body { padding:24px }
  .section { margin-bottom:20px }
  .section-title { font-size:14px; font-weight:700; color:${BRAND.primary}; text-transform:uppercase; letter-spacing:0.5px; margin:0 0 12px; padding-bottom:8px; border-bottom:2px solid ${BRAND.primary}20 }
  .stat-grid { display:flex; flex-wrap:wrap; gap:12px }
  .stat { flex:1; min-width:120px; background:${BRAND.bg}; border-radius:8px; padding:14px; text-align:center }
  .stat-value { font-size:22px; font-weight:700; color:${BRAND.text} }
  .stat-label { font-size:11px; color:${BRAND.muted}; margin-top:2px; text-transform:uppercase; letter-spacing:0.3px }
  .opt-item { padding:8px 12px; margin:4px 0; border-radius:6px; font-size:13px }
  .opt-auto { background:#ecfdf5; border-left:3px solid ${BRAND.success} }
  .opt-review { background:#fffbeb; border-left:3px solid ${BRAND.warning} }
  table { width:100%; border-collapse:collapse; font-size:13px }
  .footer { background:${BRAND.bg}; padding:20px 24px; text-align:center; font-size:12px; color:${BRAND.muted}; border-top:1px solid #e5e7eb }
  .footer a { color:${BRAND.primary}; text-decoration:none }
  .btn { display:inline-block; background:linear-gradient(135deg,${BRAND.primary},${BRAND.secondary}); color:#fff; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:600; font-size:14px; margin-top:12px }
</style></head><body>
<div class="container">

  <!-- Header -->
  <div class="header">
    <h1>${biz}</h1>
    <p class="sub">Weekly SEO Report &bull; ${report.period}</p>
    <div class="score-ring">${summary.seo_score}</div><br>
    <span class="grade-badge">Grade ${summary.grade}</span>
  </div>

  <div class="body">
    <!-- Stats -->
    <div class="section">
      <p class="section-title">At a Glance</p>
      <div class="stat-grid">
        <div class="stat"><div class="stat-value">${performance?.load_time_ms||'--'}ms</div><div class="stat-label">Load Time</div></div>
        <div class="stat"><div class="stat-value">${content?.word_count||'--'}</div><div class="stat-label">Words</div></div>
        <div class="stat"><div class="stat-value">${technical_seo.errors||0}</div><div class="stat-label">Errors</div></div>
        <div class="stat"><div class="stat-value">${technical_seo.warnings||0}</div><div class="stat-label">Warnings</div></div>
        <div class="stat"><div class="stat-value">${summary.optimizations_applied||0}</div><div class="stat-label">Fixes Applied</div></div>
        <div class="stat"><div class="stat-value">${summary.existing_blog_posts||0}</div><div class="stat-label">Blog Posts</div></div>
      </div>
    </div>

    <!-- Findings -->
    <div class="section">
      <p class="section-title">Technical SEO Findings</p>
      <table>${findings}</table>
    </div>

    <!-- Optimizations -->
    ${optimizations?.length ? `
    <div class="section">
      <p class="section-title">Optimizations</p>
      ${optimizations.map(o => `<div class="opt-item ${o.auto_apply ? 'opt-auto' : 'opt-review'}">
        <strong>${o.type}</strong> — ${o.description}
        ${o.auto_apply ? ' <span style="font-size:11px;color:${BRAND.success}">(auto-applied)</span>' : ''}
      </div>`).join('')}
    </div>` : ''}

    <!-- Blog -->
    ${blog ? `
    <div class="section">
      <p class="section-title">Blog Pipeline</p>
      <p style="font-size:13px;color:${BRAND.muted};margin:0">
        ${summary.existing_blog_posts} existing post(s) &bull; ${summary.blog_gaps_identified} content gaps identified<br>
        <span style="font-size:11px">New gaps: ${gapList}</span>
      </p>
    </div>` : ''}

    <!-- Recommendations -->
    ${recommendations.length > 0 ? `
    <div class="section">
      <p class="section-title">Next Steps</p>
      <ul style="margin:0;padding-left:18px;font-size:13px">${recs}</ul>
    </div>` : ''}

    <div style="text-align:center;margin-top:16px">
      <a href="${BRAND.site}" class="btn">View in Dashboard</a>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <p style="margin:0 0 4px">Generated by <a href="${BRAND.site}">Rank Labs</a> &mdash; We Have the Secret Formula for SEO</p>
    <p style="margin:0">${report.generated}</p>
    ${customer ? `<p style="margin:4px 0 0">Questions? Reply to this email or reach us at <a href="mailto:${BRAND.from}">${BRAND.from}</a></p>` : ''}
  </div>

</div>
</body></html>`;
}

// ── Customer lookup ───────────────────────────────────────────────────────
function loadCustomers() {
  const configPath = path.join(__dirname, '..', '..', 'customers.yaml');
  if (!fs.existsSync(configPath)) return [];
  const raw = fs.readFileSync(configPath, 'utf8');
  const doc = yaml.load(raw);
  return (doc?.customers || []).filter(c => c.active);
}

function findCustomer(customers, id) {
  return customers.find(c => c.id === id || c.site_url === id);
}

// ── CLI ───────────────────────────────────────────────────────────────────
function usage() {
  console.error(`Usage: node email-agent.js <report.json> [options]

Options:
  --customer-id=<id>   Look up customer by ID and email them
  --email=<addr>       Send to a specific email address
  --preview            Output HTML to stdout (no send)

Examples:
  node email-agent.js report.json --customer-id=bg_113610_002aea
  node email-agent.js report.json --email=hello@example.com
  node email-agent.js report.json --preview`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();

  const reportFile = args[0];
  if (!fs.existsSync(reportFile)) {
    console.error(`Report file not found: ${reportFile}`);
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const customers = loadCustomers();

  let customer = null;
  let emailTo = null;
  let preview = false;

  for (const arg of args.slice(1)) {
    if (arg.startsWith('--customer-id=')) {
      const id = arg.split('=')[1];
      customer = findCustomer(customers, id);
      if (!customer) { console.error(`Customer not found: ${id}`); process.exit(1); }
      emailTo = customer.contact_email;
    } else if (arg.startsWith('--email=')) {
      emailTo = arg.split('=')[1];
    } else if (arg === '--preview') {
      preview = true;
    }
  }

  const html = generateEmailHtml(report, customer);

  if (preview) {
    console.log(html);
    return;
  }

  if (!emailTo) {
    console.error('No recipient. Use --customer-id=<id> or --email=<addr>');
    process.exit(1);
  }

  // Write HTML file (for himalaya pipe or direct send)
  const htmlDir = path.dirname(reportFile);
  const baseName = path.basename(reportFile, '.json');
  const htmlFile = path.join(htmlDir, `${baseName}.email.html`);
  fs.writeFileSync(htmlFile, html);

  // Build plain text version for multipart
  const { summary, technical_seo, performance, content, optimizations, blog, recommendations } = report;
  const bizName = customer?.business_name || report.site;
  const plainText = `${bizName} - Weekly SEO Report
${report.period}
Score: ${summary.seo_score}/100 (Grade ${summary.grade})
Load time: ${performance?.load_time_ms||'--'}ms | Words: ${content?.word_count||'--'}
Errors: ${technical_seo.errors||0} | Warnings: ${technical_seo.warnings||0} | Fixes: ${summary.optimizations_applied||0}
${(technical_seo.top_findings||[]).map(f => `  [${f.severity.toUpperCase()}] ${f.detail}`).join('\n')}
${recommendations.length > 0 ? '\nNext Steps:\n' + recommendations.map(r => `  - ${r.title || r.action || r}`).join('\n') : ''}
Generated by Rank Labs - ${BRAND.site}`;

  // Build subject line (ASCII only for himalaya template parser)
  const subject = `${report.site} Weekly SEO Report - Score ${report.summary.seo_score}/100 (${report.summary.grade})`;

  // MML multipart template for himalaya
  const emailTemplate = `From: ${BRAND.fromName} <${BRAND.from}>
To: ${emailTo}
Subject: ${subject}

<#multipart type=alternative>
<#part type=text/plain>
${plainText}
<#part type=text/html>
${html}
<#/multipart>`;

  const emailFile = path.join(htmlDir, `${baseName}.email.txt`);
  fs.writeFileSync(emailFile, emailTemplate);

  console.error(`[EMAIL] To: ${emailTo} (${customer?.business_name || 'direct'})`);
  console.error(`[EMAIL] Subject: ${subject}`);
  console.error(`[EMAIL] HTML: ${htmlFile}`);

  // Output the email template path for piping
  console.log(emailFile);
}

main().catch(e => { console.error(e.message); process.exit(1); });
