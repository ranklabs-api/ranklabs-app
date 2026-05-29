#!/usr/bin/env node
// notify-agent — Rank Labs branded notification emails
// Usage: node notify-agent.js <template> [--customer-id=<id> | --email=<addr>]
// Templates: site-live, welcome, blog-approval, migration-started, migration-review, site-creation-started

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
  warning:    '#f59e0b',
  info:       '#3b82f6',
  from:       'hello@getranklabs.com',
  fromName:   'Rank Labs',
  site:       'https://getranklabs.com',
  logo:       'https://getranklabs.com/logo.svg',
};

function styledHeader(title, subtitle) {
  return `
  <div class="header">
    ${BRAND.logo ? `<img src="${BRAND.logo}" alt="Rank Labs" style="height:36px;margin-bottom:12px">` : ''}
    <h1>${title}</h1>
    ${subtitle ? `<p class="sub">${subtitle}</p>` : ''}
  </div>`;
}

function htmlShell(customerTitle, bodyHtml) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6}
  .container{max-width:560px;margin:0 auto;background:#fff}
  .header{background:linear-gradient(135deg,${BRAND.primary},${BRAND.secondary});padding:40px 24px;text-align:center}
  .header img{display:block;margin:0 auto 12px}
  .header h1{color:#fff;font-size:24px;margin:0;font-weight:700}
  .header .sub{color:rgba(255,255,255,0.85);font-size:15px;margin:8px 0 0}
  .body{padding:32px 28px}
  .body p{font-size:15px;color:${BRAND.text};line-height:1.6;margin:0 0 16px}
  .body h2{font-size:17px;color:${BRAND.primary};margin:24px 0 12px;font-weight:700}
  .url-box{background:${BRAND.bg};border:2px dashed #c4b5fd;border-radius:8px;padding:16px;text-align:center;margin:24px 0}
  .url-box a{color:${BRAND.primary};font-size:18px;font-weight:600;text-decoration:none}
  .checklist{margin:16px 0;padding:0;list-style:none}
  .checklist li{padding:6px 0 6px 24px;font-size:14px;color:${BRAND.text};position:relative}
  .checklist li::before{content:'✓';position:absolute;left:0;color:${BRAND.success};font-weight:700}
  .steps{margin:24px 0}
  .step{display:flex;gap:16px;margin-bottom:20px}
  .step-num{background:linear-gradient(135deg,${BRAND.primary},${BRAND.secondary});color:#fff;width:36px;height:36px;border-radius:50%;text-align:center;line-height:36px;font-weight:700;font-size:16px;flex-shrink:0}
  .step-text{font-size:14px;color:${BRAND.text}}
  .step-text strong{display:block;margin-bottom:2px}
  .status-bar{background:${BRAND.bg};border-left:4px solid ${BRAND.warning};border-radius:4px;padding:14px 18px;margin:20px 0}
  .status-bar.info{border-left-color:${BRAND.info}}
  .status-bar.success{border-left-color:${BRAND.success}}
  .status-bar .status-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${BRAND.muted};margin:0 0 4px}
  .status-bar .status-text{font-size:14px;color:${BRAND.text};margin:0}
  .dns-instructions{background:${BRAND.bg};border-radius:8px;padding:20px;margin:20px 0;font-size:13px}
  .dns-instructions code{background:#e5e7eb;padding:2px 6px;border-radius:3px;font-size:12px;color:${BRAND.primary}}
  .btn{display:inline-block;background:linear-gradient(135deg,${BRAND.primary},${BRAND.secondary});color:#fff!important;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px}
  .footer{background:${BRAND.bg};padding:20px 28px;text-align:center;font-size:12px;color:${BRAND.muted};border-top:1px solid #e5e7eb}
  .footer a{color:${BRAND.primary};text-decoration:none}
</style></head><body>
<div class="container">
${bodyHtml}
  <div class="footer">
    <p style="margin:0"><a href="${BRAND.site}">Rank Labs</a> &mdash; We Have the Secret Formula for SEO</p>
    <p style="margin:4px 0 0">${BRAND.site} &bull; <a href="mailto:${BRAND.from}">${BRAND.from}</a></p>
  </div>
</div>
</body></html>`;
}

const TEMPLATES = {
  // ── Existing ────────────────────────────────────────────────────────────

  'site-live': (customer) => ({
    subject: `Your site is live, ${customer.contact_name}!`,
    html: htmlShell(customer.business_name, `
  ${styledHeader('Your Site Is Live', `The formula is now active for ${customer.business_name}`)}
  <div class="body">
    <p>Hi ${customer.contact_name},</p>
    <p>Your site is now live and fully managed on the Rank Labs platform. Cloudflare's global edge network is serving your pages at lightning speed.</p>
    <div class="url-box">
      <a href="${customer.site_url}">${customer.site_url}</a>
    </div>
    <h2>Here's what's active right now</h2>
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
  </div>`),
  }),

  'welcome': (customer) => ({
    subject: `Welcome to Rank Labs, ${customer.contact_name}!`,
    html: htmlShell(customer.business_name, `
  ${styledHeader('Welcome to Rank Labs', `${customer.business_name} is now in the lab`)}
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
  </div>`),
  }),

  'blog-approval': (customer, data) => ({
    subject: `Blog Approval — ${data?.post_title || 'New Post'} [${data?.post_id || 'DRAFT'}]`,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6}
  .container{max-width:560px;margin:0 auto;background:#fff}
  .header{background:linear-gradient(135deg,${BRAND.primary},${BRAND.secondary});padding:32px 24px;text-align:center}
  .header img{display:block;margin:0 auto 8px;height:32px}
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
    ${BRAND.logo ? `<img src="${BRAND.logo}" alt="Rank Labs">` : ''}
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
</body></html>`,
  }),

  // ── Migration / Site Creation ───────────────────────────────────────────

  'migration-started': (customer, data) => ({
    subject: `Site migration in progress — ${customer.business_name}`,
    html: htmlShell(customer.business_name, `
  ${styledHeader('Site Migration In Progress', customer.business_name)}
  <div class="body">
    <p>Hi ${customer.contact_name},</p>
    <p>We've begun migrating <strong>${customer.site_url}</strong> to the Rank Labs platform. Our team is cloning your existing site, optimizing it for SEO, and preparing it for deployment on Cloudflare's global edge network.</p>

    <div class="status-bar">
      <p class="status-label">Migration Status</p>
      <p class="status-text"><strong>In Progress</strong> — We're cloning your site and applying SEO optimizations. Your existing site remains live and untouched during this process.</p>
    </div>

    <h2>What's happening right now</h2>
    <ul class="checklist">
      <li>Cloning your existing site from its current host</li>
      <li>Injecting GA4 analytics tracking</li>
      <li>Applying SEO optimizations (meta tags, schema, performance)</li>
      <li>Deploying to a preview URL for your review</li>
    </ul>

    <p><strong>Next step:</strong> Once the migration is complete, we'll send you a preview link to review your site before any DNS changes are made. You're in full control of when the cutover happens.</p>

    <p style="font-size:13px;color:${BRAND.muted}">No action needed from you right now. We'll follow up within 24 hours with a preview link.</p>
  </div>`),
  }),

  'migration-review': (customer, data) => ({
    subject: `Preview ready — ${customer.business_name} migration`,
    html: htmlShell(customer.business_name, `
  ${styledHeader('Your Migrated Site Is Ready for Review', customer.business_name)}
  <div class="body">
    <p>Hi ${customer.contact_name},</p>
    <p>Good news — the migration of <strong>${customer.site_url}</strong> is complete! Your site has been cloned to the Rank Labs platform with SEO optimizations applied. It's now live at a preview URL for your review.</p>

    <p><strong>Preview site:</strong> <a href="${data?.preview_url || '#'}" style="color:${BRAND.primary};font-weight:600">${data?.preview_url || 'Preview URL'}</a> ← click here</p>
    <p style="font-size:13px;color:${BRAND.muted}">Don't worry! Your original site is still live at <a href="${customer.site_url}" style="color:${BRAND.primary}">${customer.site_url}</a></p>

    <div class="status-bar info">
      <p class="status-label">DNS Cutover — Pending Your Review</p>
      <p class="status-text">Please review the preview site. When you're ready to go live, we'll coordinate the DNS cutover with your team.</p>
    </div>

    <h2>DNS Cutover Instructions</h2>
    <div class="dns-instructions">
      <p style="margin:0 0 12px"><strong>When you're ready, here's what needs to happen:</strong></p>
      <p style="margin:0 0 8px">1. Update your domain's <strong>CNAME record</strong> to point to Cloudflare Pages:</p>
      <p style="margin:4px 0 12px 16px"><code>${data?.cname_target || '<your-project>.pages.dev'}</code></p>
      <p style="margin:0 0 8px">2. If using a root domain (no www), add an <strong>ALIAS or ANAME record</strong> pointing to the same target.</p>
      <p style="margin:0 0 8px">3. DNS propagation typically takes <strong>a few minutes to 48 hours</strong>.</p>
      <p style="margin:0">4. Your original site stays live the entire time — zero downtime.</p>
    </div>

    <p><strong>Need help with DNS?</strong> We can work directly with your team or domain provider to handle the cutover. Just reply to this email.</p>

    <p style="text-align:center;margin:24px 0">
      <a href="${data?.preview_url || '#'}" class="btn">Review Your Site</a>
    </p>

    <p style="font-size:13px;color:${BRAND.muted}">The sooner DNS is updated, the sooner your SEO optimizations go live on your real domain.</p>
  </div>`),
  }),

  'site-creation-started': (customer, data) => ({
    subject: `Your site build is underway — ${customer.business_name}`,
    html: htmlShell(customer.business_name, `
  ${styledHeader('Site Creation In Progress', customer.business_name)}
  <div class="body">
    <p>Hi ${customer.contact_name},</p>
    <p>We're building your new site for <strong>${customer.site_url || data?.domain}</strong> on the Rank Labs platform. Our team is creating a high-performance, SEO-optimized site using our proven templates.</p>

    <div class="status-bar">
      <p class="status-label">Site Creation Status</p>
      <p class="status-text"><strong>In Progress</strong> — Building your site, configuring SEO, and preparing for deployment.</p>
    </div>

    <h2>What's happening right now</h2>
    <ul class="checklist">
      <li>Creating SEO-optimized pages using Rank Labs templates</li>
      <li>Configuring meta tags, schema markup, and Open Graph data</li>
      <li>Setting up GA4 analytics</li>
      <li>Deploying to a preview URL for your review</li>
    </ul>

    <p><strong>Next step:</strong> Once the build is complete, we'll send you a preview link. After your review, we coordinate DNS to go live on your domain.</p>

    <p style="font-size:13px;color:${BRAND.muted}">No action needed from you right now. We'll follow up soon with a preview link.</p>
  </div>`),
  }),

  'dns-complete': (customer) => ({
    subject: `DNS cutover complete — ${customer.business_name} is live!`,
    html: htmlShell(customer.business_name, `
  ${styledHeader('DNS Cutover Complete!', customer.business_name)}
  <div class="body">
    <p>Hi ${customer.contact_name},</p>
    <p>DNS has been updated and <strong>${customer.site_url}</strong> is now live on the Rank Labs platform. Your site is being served from Cloudflare's global edge network with all SEO optimizations active.</p>

    <div class="url-box">
      <a href="${customer.site_url}">${customer.site_url}</a>
    </div>

    <div class="status-bar success">
      <p class="status-label">All Systems Go</p>
      <p class="status-text">Site is live, HTTPS is active, and SEO optimizations are applied. Your first weekly audit report will arrive within 24 hours.</p>
    </div>

    <h2>What's now active</h2>
    <ul class="checklist">
      <li>HTTPS with automatic certificate renewal</li>
      <li>SEO-optimized pages with meta tags, schema, and OG data</li>
      <li>Weekly automated SEO audits</li>
      <li>AI blog content pipeline</li>
      <li>Keyword &amp; competitor tracking</li>
    </ul>

    <p style="text-align:center;margin:24px 0">
      <a href="${customer.site_url}" class="btn">Visit Your Site</a>
    </p>

    <p style="font-size:13px;color:${BRAND.muted}">Welcome to the lab! Questions? Just reply to this email.</p>
  </div>`),
  }),

  // ── Subscription / Billing ─────────────────────────────────────────────

  'payment-failed': (customer, data) => ({
    subject: `Payment failed — ${customer.business_name}`,
    html: htmlShell(customer.business_name, `
  ${styledHeader('Payment Unsuccessful', customer.business_name)}
  <div class="body">
    <p>Hi ${customer.contact_name},</p>
    <p>We weren't able to process your monthly payment for <strong>${customer.business_name}</strong>'s Rank Labs subscription.</p>

    <div class="status-bar">
      <p class="status-label">Payment Status</p>
      <p class="status-text"><strong>Failed</strong> — Your services are still active, but we need your attention to keep everything running.</p>
    </div>

    <p>This is usually caused by an expired card or insufficient funds. No worries — it happens.</p>

    <p style="text-align:center;margin:24px 0">
      <a href="${data?.update_payment_url || BRAND.site}" class="btn">Update Payment Method</a>
    </p>

    <p style="font-size:13px;color:${BRAND.muted}">
      <strong>What happens next:</strong> We'll retry the payment automatically. If it continues to fail, we'll send you a reminder in 7 days. Your services won't be interrupted before then.
    </p>

    <p style="font-size:13px;color:${BRAND.muted}">Questions? Reply to this email — we're here to help.</p>
  </div>`),
  }),

  'payment-7day-warning': (customer, data) => ({
    subject: `Action required — ${customer.business_name} payment is 7 days past due`,
    html: htmlShell(customer.business_name, `
  ${styledHeader('Payment Past Due', customer.business_name)}
  <div class="body">
    <p>Hi ${customer.contact_name},</p>
    <p>Your payment for <strong>${customer.business_name}</strong> is now <strong>7 days past due</strong>. Your services are still active, but will be paused in 7 days if payment isn't received.</p>

    <div class="status-bar">
      <p class="status-label">⚠️ Action Required</p>
      <p class="status-text"><strong>7 days remaining</strong> — Your site and SEO services will be temporarily paused on <strong>${data?.disable_date || 'Day 14'}</strong> if the balance remains unpaid.</p>
    </div>

    <p>What gets paused:</p>
    <ul class="checklist">
      <li>Weekly SEO audits & reports</li>
      <li>AI blog content pipeline</li>
      <li>Site edits & maintenance</li>
    </ul>
    <p>Your actual website <strong>stays online</strong> — we don't take that down.</p>

    <p style="text-align:center;margin:24px 0">
      <a href="${data?.update_payment_url || BRAND.site}" class="btn">Update Payment Method</a>
    </p>

    <p style="font-size:13px;color:${BRAND.muted}">Need help or want to discuss? Reply to this email anytime.</p>
  </div>`),
  }),

  'payment-services-disabled': (customer, data) => ({
    subject: `Services paused — ${customer.business_name} payment is 14 days past due`,
    html: htmlShell(customer.business_name, `
  ${styledHeader('Services Paused', customer.business_name)}
  <div class="body">
    <p>Hi ${customer.contact_name},</p>
    <p>We haven't received payment for <strong>${customer.business_name}</strong> in 14 days, so we've temporarily paused your SEO services.</p>

    <div class="status-bar">
      <p class="status-label">Services Paused</p>
      <p class="status-text">Your site <strong>${customer.site_url}</strong> is still live and accessible. Only SEO add-on services are paused.</p>
    </div>

    <p><strong>What's paused:</strong></p>
    <ul class="checklist">
      <li>Weekly SEO audits & reports</li>
      <li>AI blog content pipeline (2 posts/week)</li>
      <li>Site edits, updates & maintenance</li>
      <li>Keyword & competitor tracking</li>
    </ul>

    <p><strong>What's still running:</strong></p>
    <ul class="checklist">
      <li>Your website — fully live, HTTPS, global CDN</li>
      <li>All existing content & SEO optimizations</li>
    </ul>

    <p style="text-align:center;margin:24px 0">
      <a href="${data?.update_payment_url || BRAND.site}" class="btn">Reactivate Services</a>
    </p>

    <p style="font-size:13px;color:${BRAND.muted}">Once payment is received, all services resume automatically within 24 hours. Questions? Just reply.</p>
  </div>`),
  }),

  'payment-restored': (customer, data) => ({
    subject: `Services restored — ${customer.business_name}`,
    html: htmlShell(customer.business_name, `
  ${styledHeader('Services Restored!', customer.business_name)}
  <div class="body">
    <p>Hi ${customer.contact_name},</p>
    <p>Payment received — all services for <strong>${customer.business_name}</strong> have been restored.</p>

    <div class="status-bar success">
      <p class="status-label">All Systems Go</p>
      <p class="status-text">Your subscription is active. Weekly audits, content pipeline, and all SEO services are back online.</p>
    </div>

    <p>Your next weekly SEO audit will arrive within 24 hours. Blog content drafts resume on your regular schedule.</p>

    <p style="font-size:13px;color:${BRAND.muted}">Thanks for updating your payment method! Everything's back to normal.</p>
  </div>`),
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
  site-live              "Your site is live" notification
  welcome                Welcome/onboarding email
  blog-approval          Blog post approval request
  migration-started      "Site migration in progress"
  migration-review       "Preview ready — review your migrated site"
  site-creation-started  "Your site build is underway"
  dns-complete           "DNS cutover complete — site is live"

Options:
  --customer-id=<id>  Look up customer (required)
  --email=<addr>      Override recipient email
  --payload='{...}'    Template data as JSON (for blog-approval, migration-review)

Examples:
  node notify-agent.js site-live --customer-id=bg_113610_002aea
  node notify-agent.js migration-started --customer-id=sincerelycozy
  node notify-agent.js migration-review --customer-id=sincerelycozy --payload='{"preview_url":"https://sincerelycozy.pages.dev","cname_target":"sincerelycozy.pages.dev"}'`);
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

  // Build plain text fallback
  let plainText = '';
  const name = customer.contact_name;
  const biz = customer.business_name;
  const url = customer.site_url;

  if (template === 'migration-started') {
    plainText = `Site migration in progress — ${biz}\n\nHi ${name},\nWe've begun migrating ${url} to the Rank Labs platform. Our team is cloning your existing site, optimizing it for SEO, and preparing it for deployment on Cloudflare.\n\nStatus: IN PROGRESS — Your existing site stays live during migration.\n\nWhat's happening:\n- Cloning your existing site\n- Injecting GA4 analytics\n- Applying SEO optimizations (meta tags, schema, performance)\n- Deploying to a preview URL for your review\n\nNext step: We'll send a preview link within 24 hours.\n\nNo action needed from you right now.\n\nRank Labs — ${BRAND.site}`;
  } else if (template === 'migration-review') {
    plainText = `Preview ready — ${biz} migration\n\nHi ${name},\nThe migration of ${url} is complete! Preview your site at:\n${templateData?.preview_url || 'N/A'}\n\nDNS Cutover Instructions:\n1. Update your CNAME record to point to: ${templateData?.cname_target || '<your-project>.pages.dev'}\n2. Root domains: add an ALIAS/ANAME record to the same target\n3. DNS propagation takes minutes to 48 hours\n4. Your original site stays live — zero downtime\n\nWe can work with your team on DNS — just reply.\n\nRank Labs — ${BRAND.site}`;
  } else if (template === 'site-creation-started') {
    plainText = `Your site build is underway — ${biz}\n\nHi ${name},\nWe're building your new site on the Rank Labs platform.\n\nStatus: IN PROGRESS — Building site, configuring SEO, preparing for deployment.\n\nWhat's happening:\n- Creating SEO-optimized pages\n- Configuring meta tags, schema, Open Graph\n- Setting up GA4 analytics\n- Deploying to a preview URL\n\nNext step: Preview link coming soon.\n\nRank Labs — ${BRAND.site}`;
  } else if (template === 'dns-complete') {
    plainText = `DNS cutover complete — ${biz} is live!\n\nHi ${name},\n${url} is now live on the Rank Labs platform via Cloudflare.\n\nWhat's active:\n- HTTPS with auto-renewal\n- SEO-optimized pages\n- Weekly SEO audits (first within 24 hours)\n- AI blog content pipeline\n- Keyword & competitor tracking\n\nWelcome to the lab!\n\nRank Labs — ${BRAND.site}`;
  }

  // Add plain text for existing templates if not already handled by caller
  if (!plainText) {
    if (template === 'site-live') {
      plainText = `Your site is live, ${name}!\n\nHi ${name},\n${url} is now live on Rank Labs.\n\nWhat's active: HTTPS, SEO-optimized pages, weekly audits, AI blog pipeline, keyword tracking.\n\nRank Labs — ${BRAND.site}`;
    } else if (template === 'welcome') {
      plainText = `Welcome to Rank Labs, ${name}!\n\nHi ${name},\n${biz} is now in the lab. Your site is being provisioned.\n\nSteps: 1) Build & deploy 2) First SEO audit within 24h 3) AI content pipeline starts weekly.\n\nRank Labs — ${BRAND.site}`;
    } else if (template === 'blog-approval') {
      plainText = `Blog Approval — ${templateData?.post_title || 'New Post'} [${templateData?.post_id || 'DRAFT'}]\n\nHi ${name},\n"${templateData?.post_title || 'A new blog post'}" is ready for review.\nTarget keyword: ${templateData?.target_keyword || 'N/A'}\n\nReply APPROVE to publish, or describe changes.\n\nRank Labs — ${BRAND.site}`;
    }
  }

  const emailTemplate = `From: ${BRAND.fromName} <${BRAND.from}>
To: ${emailTo}
Subject: ${subject}
Content-Type: text/html

${html}`;

  console.log(emailTemplate);
}

main().catch(e => { console.error(e.message); process.exit(1); });
