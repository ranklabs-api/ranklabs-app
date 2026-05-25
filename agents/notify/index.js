#!/usr/bin/env node
// notify-agent — Rank Labs branded notification emails
// Usage: node notify-agent.js <template> [--customer-id=<id> | --email=<addr>]
// Templates: site-live, welcome, blog-approval

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const BRAND = {
  primary:    '#7c3aed',
  secondary:  '#3b82f6',
  accent:     '#06b6d4',
  bg:         '#f8f7ff',
  surface:    '#ffffff',
  text:       '#1e1b4b',
  muted:      '#6b7280',
  success:    '#10b981',
  from:       'hello@getranklabs.com',
  fromName:   'Rank Labs',
  site:       'https://getranklabs.com',
  logo:       'https://getranklabs.com/logo.svg',
};

const TEMPLATES = {
  'site-live': (customer) => ({
    subject: `Your site is live, ${customer.contact_name}!`,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6}
  .container{max-width:560px;margin:0 auto;background:#fff}
  .header{background:linear-gradient(135deg,${BRAND.primary},${BRAND.secondary});padding:40px 24px;text-align:center}
  .header h1{color:#fff;font-size:24px;margin:0;font-weight:700}
  .header .sub{color:rgba(255,255,255,0.85);font-size:15px;margin:8px 0 0}
  .body{padding:32px 28px}
  .body p{font-size:15px;color:${BRAND.text};line-height:1.6;margin:0 0 16px}
  .url-box{background:${BRAND.bg};border:2px dashed #c4b5fd;border-radius:8px;padding:16px;text-align:center;margin:24px 0}
  .url-box a{color:${BRAND.primary};font-size:18px;font-weight:600;text-decoration:none}
  .checklist{margin:16px 0;padding:0;list-style:none}
  .checklist li{padding:6px 0;font-size:14px;color:${BRAND.text}}
  .checklist li::before{content:'✓ ';color:${BRAND.success};font-weight:700}
  .btn{display:inline-block;background:linear-gradient(135deg,${BRAND.primary},${BRAND.secondary});color:#fff!important;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px}
  .footer{background:${BRAND.bg};padding:20px 28px;text-align:center;font-size:12px;color:${BRAND.muted};border-top:1px solid #e5e7eb}
</style></head><body>
<div class="container">
  <div class="header">
    <h1>Your Site Is Live</h1>
    <p class="sub">The formula is now active for ${customer.business_name}</p>
  </div>
  <div class="body">
    <p>Hi ${customer.contact_name},</p>
    <p>Your site is now live and fully managed on the Rank Labs platform. Cloudflare's global edge network is serving your pages at lightning speed.</p>
    <div class="url-box">
      <a href="${customer.site_url}">${customer.site_url}</a>
    </div>
    <p><strong>Here's what's active right now:</strong></p>
    <ul class="checklist">
      <li>HTTPS enabled with automatic certificate renewal</li>
      <li>SEO-optimized pages with meta tags, schema, and OG data</li>
      <li>Weekly automated SEO audits (first one arrives within 24 hours)</li>
      <li>AI blog content pipeline (2 posts/week, one-click approval)</li>
      <li>Keyword &amp; competitor tracking</li>
    </ul>
    <p>You'll receive your first SEO audit report within the next 24 hours. Blog content drafts will follow weekly.</p>
    <p style="text-align:center;margin:24px 0">
      <a href="${BRAND.site}" class="btn">Visit Dashboard</a>
    </p>
    <p style="font-size:13px;color:${BRAND.muted}">Questions? Just reply to this email — we respond fast.</p>
  </div>
  <div class="footer">
    <p style="margin:0">Rank Labs &mdash; We Have the Secret Formula for SEO</p>
    <p style="margin:4px 0 0">${BRAND.site}</p>
  </div>
</div>
</body></html>`
  }),

  'welcome': (customer) => ({
    subject: `Welcome to Rank Labs, ${customer.contact_name}!`,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6}
  .container{max-width:560px;margin:0 auto;background:#fff}
  .header{background:linear-gradient(135deg,${BRAND.primary},${BRAND.secondary});padding:40px 24px;text-align:center}
  .header h1{color:#fff;font-size:24px;margin:0;font-weight:700}
  .header .sub{color:rgba(255,255,255,0.85);font-size:15px;margin:8px 0 0}
  .body{padding:32px 28px}
  .body p{font-size:15px;color:${BRAND.text};line-height:1.6;margin:0 0 16px}
  .steps{margin:24px 0}
  .step{display:flex;gap:16px;margin-bottom:20px}
  .step-num{background:linear-gradient(135deg,${BRAND.primary},${BRAND.secondary});color:#fff;width:36px;height:36px;border-radius:50%;text-align:center;line-height:36px;font-weight:700;font-size:16px;flex-shrink:0}
  .step-text{font-size:14px;color:${BRAND.text}}
  .step-text strong{display:block;margin-bottom:2px}
  .btn{display:inline-block;background:linear-gradient(135deg,${BRAND.primary},${BRAND.secondary});color:#fff!important;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px}
  .footer{background:${BRAND.bg};padding:20px 28px;text-align:center;font-size:12px;color:${BRAND.muted};border-top:1px solid #e5e7eb}
</style></head><body>
<div class="container">
  <div class="header">
    <h1>Welcome to Rank Labs</h1>
    <p class="sub">${customer.business_name} is now in the lab</p>
  </div>
  <div class="body">
    <p>Hi ${customer.contact_name},</p>
    <p>Thanks for choosing Rank Labs. Your site (${customer.site_url}) is being provisioned and will be live within hours. Here's what happens next:</p>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-text"><strong>Site Build &amp; Deploy</strong>We build your site using our SEO-optimized templates and deploy it to Cloudflare's global edge. You'll get a "Site Is Live" email when it's ready.</div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-text"><strong>First SEO Audit</strong>Within 24 hours of going live, our AI crawls your site and runs 100+ SEO checks. You'll receive a detailed report with scores and recommendations.</div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-text"><strong>Content Pipeline</strong>Our AI researches your niche and drafts blog posts weekly. You approve with one click, and they go live automatically.</div>
      </div>
    </div>
    <p style="text-align:center;margin:24px 0">
      <a href="${BRAND.site}" class="btn">Visit Our Site</a>
    </p>
    <p style="font-size:13px;color:${BRAND.muted}">Have questions? Reply to this email anytime.</p>
  </div>
  <div class="footer">
    <p style="margin:0">Rank Labs &mdash; We Have the Secret Formula for SEO</p>
    <p style="margin:4px 0 0">${BRAND.site}</p>
  </div>
</div>
</body></html>`
  }),

  'blog-approval': (customer, data) => ({
    subject: `Blog Approval — ${data?.post_title || 'New Post'} [${data?.post_id || 'DRAFT'}]`,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6}
  .container{max-width:560px;margin:0 auto;background:#fff}
  .header{background:linear-gradient(135deg,${BRAND.primary},${BRAND.secondary});padding:32px 24px;text-align:center}
  .header h1{color:#fff;font-size:20px;margin:0;font-weight:700}
  .header .sub{color:rgba(255,255,255,0.85);font-size:13px;margin:6px 0 0}
  .body{padding:28px}
  .body p{font-size:14px;color:${BRAND.text};line-height:1.6;margin:0 0 12px}
  .btn-approve{display:inline-block;background:${BRAND.success};color:#fff!important;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin-right:8px}
  .btn-reject{display:inline-block;background:#e5e7eb;color:${BRAND.text}!important;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px}
  .footer{background:${BRAND.bg};padding:20px 28px;text-align:center;font-size:12px;color:${BRAND.muted};border-top:1px solid #e5e7eb}
</style></head><body>
<div class="container">
  <div class="header">
    <h1>New Blog Post Ready for Review</h1>
    <p class="sub">${customer.business_name} &bull; ${data?.post_id || ''}</p>
  </div>
  <div class="body">
    <p>Hi ${customer.contact_name},</p>
    <p><strong>${data?.post_title || 'A new blog post'}</strong> has been drafted by our AI and is ready for your review.</p>
    <p><strong>Target keyword:</strong> ${data?.target_keyword || 'N/A'}<br>
    <strong>Word count:</strong> ${data?.word_count || '~800'}<br>
    <strong>Category:</strong> ${data?.category || 'General'}</p>
    <p style="text-align:center;margin:20px 0">
      <a href="${BRAND.site}" class="btn-approve">APPROVE</a>
      <a href="${BRAND.site}" class="btn-reject">REQUEST CHANGES</a>
    </p>
    <p style="font-size:12px;color:${BRAND.muted}">Reply to this email with APPROVE to publish, or describe any changes you'd like.</p>
  </div>
  <div class="footer">
    <p style="margin:0">Rank Labs &mdash; We Have the Secret Formula for SEO</p>
    <p style="margin:4px 0 0">${BRAND.site}</p>
  </div>
</div>
</body></html>`
  }),
};

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

function usage() {
  console.error(`Usage: node notify-agent.js <template> [options]

Templates:
  site-live       "Your site is live" notification
  welcome         Welcome/onboarding email
  blog-approval   Blog post approval request

Options:
  --customer-id=<id>  Look up customer (required)
  --email=<addr>      Override recipient email
  --payload='{...}'    Template data as JSON (for blog-approval)

Examples:
  node notify-agent.js site-live --customer-id=bg_113610_002aea
  node notify-agent.js blog-approval --customer-id=bg_113610_002aea --payload='{"post_title":"...","post_id":"POST-...","target_keyword":"..."}'`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();

  const template = args[0];
  if (!TEMPLATES[template]) { console.error(`Unknown template: ${template}`); usage(); }

  const customers = loadCustomers();
  let customer = null;
  let emailTo = null;
  let templateData = {};

  for (const arg of args.slice(1)) {
    if (arg.startsWith('--customer-id=')) {
      customer = findCustomer(customers, arg.split('=')[1]);
      if (!customer) { console.error(`Customer not found: ${arg.split('=')[1]}`); process.exit(1); }
      emailTo = customer.contact_email;
    } else if (arg.startsWith('--email=')) {
      emailTo = arg.split('=')[1];
    } else if (arg.startsWith('--payload=')) {
      try { templateData = JSON.parse(arg.slice(10)); } catch(e) { console.error('Invalid --payload JSON'); process.exit(1); }
    }
  }

  if (!customer) { console.error('--customer-id required'); process.exit(1); }
  if (!emailTo) { console.error('No email recipient'); process.exit(1); }

  const { subject, html } = TEMPLATES[template](customer, templateData);

  // Build plain text version
  let plainText = '';
  if (template === 'site-live') {
    plainText = `Your site is live, ${customer.contact_name}!\n\nHi ${customer.contact_name},\nYour site is now live and fully managed on Rank Labs:\n${customer.site_url}\n\nWhat's active:\n- HTTPS with automatic certificate renewal\n- SEO-optimized pages\n- Weekly automated SEO audits (first one within 24 hours)\n- AI blog content pipeline (2 posts/week)\n- Keyword & competitor tracking\n\nQuestions? Just reply to this email.\n\nRank Labs - ${BRAND.site}`;
  } else if (template === 'welcome') {
    plainText = `Welcome to Rank Labs, ${customer.contact_name}!\n\nHi ${customer.contact_name},\n${customer.business_name} is now in the lab. Your site (${customer.site_url}) is being provisioned.\n\nWhat happens next:\n1. Site built and deployed to Cloudflare\n2. First SEO audit within 24 hours (100+ checks)\n3. AI content pipeline starts drafting blog posts weekly\n\nQuestions? Reply anytime.\n\nRank Labs - ${BRAND.site}`;
  } else if (template === 'blog-approval') {
    plainText = `Blog Approval - ${templateData?.post_title || 'New Post'} [${templateData?.post_id || 'DRAFT'}]\n\nHi ${customer.contact_name},\n"${templateData?.post_title || 'A new blog post'}" is ready for review.\nTarget keyword: ${templateData?.target_keyword || 'N/A'}\nWord count: ~${templateData?.word_count || '800'}\n\nReply with APPROVE to publish, or describe changes you'd like.\n\nRank Labs - ${BRAND.site}`;
  }

  const emailTemplate = `From: ${BRAND.fromName} <${BRAND.from}>
To: ${emailTo}
Subject: ${subject}

<#multipart type=alternative>
<#part type=text/plain>
${plainText}
<#part type=text/html>
${html}
<#/multipart>`;

  // Write to stdout for piping to himalaya
  console.log(emailTemplate);
}

main().catch(e => { console.error(e.message); process.exit(1); });
