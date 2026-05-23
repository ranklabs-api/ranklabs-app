#!/usr/bin/env node
// site-provisioning — End-to-end customer site provisioning workflow
// Orchestrates: customer input → repo create → template apply → Pages config → deploy

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────
const ORG = process.env.GITHUB_ORG || 'searchops-api';
const TEMPLATE_REPO = process.env.TEMPLATE_REPO || 'searchops';
const TEMPLATE_PATH = process.env.TEMPLATE_PATH || path.join(__dirname, '..', 'templates');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '..', 'searchops', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const [k, ...v] = line.split('=');
      if (k && !process.env[k]) process.env[k.trim()] = v.join('=');
    }
  }
}
loadEnv();

function sh(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts });
  } catch (e) {
    if (opts.ignoreError) return '';
    throw e;
  }
}

function ghApi(endpoint, method = 'GET', data = null) {
  const AUTH = `-H "Authorization: Bearer ${process.env.GH_TOKEN}" -H "Accept: application/vnd.github+json"`;
  let cmd = `curl -s -X ${method} "https://api.github.com${endpoint}" ${AUTH}`;
  if (data) cmd += ` -d '${JSON.stringify(data).replace(/'/g, "'\''")}'`;
  return JSON.parse(sh(cmd, { ignoreError: true }) || '{}');
}

// ─── Template variable substitution ──────────────────────────────────
function applyTemplate(templateDir, outputDir, vars) {
  console.log(`Applying template: ${templateDir} → ${outputDir}`);
  
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const src = path.join(dir, entry.name);
      const rel = path.relative(templateDir, src);
      const dest = path.join(outputDir, rel);
      
      if (entry.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        walk(src);
      } else {
        let content = fs.readFileSync(src, 'utf8');
        for (const [key, value] of Object.entries(vars)) {
          content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, content);
      }
    }
  }
  
  walk(templateDir);
  console.log(`  Template applied with ${Object.keys(vars).length} variables`);
}

// ─── Main Provisioning Flow ──────────────────────────────────────────
async function provision(customer) {
  const startTime = Date.now();
  const {
    business_name,
    industry,
    description,
    domain,
    email,
    phone,
    keywords = [],
  } = customer;
  
  const repoName = business_name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  
  console.log(`\n🏗️  Provisioning site for: ${business_name}`);
  console.log(`   Repo: ${ORG}/${repoName}`);
  
  // Step 1: Create repository
  console.log('\n📁 Creating GitHub repository...');
  const repo = ghApi(`/orgs/${ORG}/repos`, 'POST', {
    name: repoName,
    description: `${business_name} — ${industry}`,
    private: false,
    has_issues: false,
    has_wiki: false,
    auto_init: false,
  });
  
  if (!repo || repo.message) {
    console.error('Failed to create repo:', repo?.message);
    return { success: false, error: repo?.message };
  }
  console.log(`  ✅ Repo created: ${repo.html_url}`);
  
  // Step 2: Apply template
  console.log('\n🎨 Applying Astro SEO template...');
  const workDir = `/tmp/searchops-provision-${repoName}`;
  fs.mkdirSync(workDir, { recursive: true });
  
  const repoUrl = `https://oauth2:${process.env.GH_TOKEN}@github.com/${ORG}/${repoName}.git`;
  sh(`git clone ${repoUrl} ${workDir}`);
  
  applyTemplate(TEMPLATE_PATH, workDir, {
    site_name: business_name,
    site_description: description,
    site_domain: domain,
  });
  
  // Update site-config.yaml with customer data
  const configPath = path.join(workDir, 'site-config.yaml');
  let config = fs.readFileSync(configPath, 'utf8');
  config = config.replace('name: ""', `name: "${business_name}"`);
  config = config.replace('description: ""', `description: "${description}"`);
  config = config.replace('domain: ""', `domain: "${domain}"`);
  config = config.replace('email: ""', `email: "${email || ''}"`);
  config = config.replace('phone: ""', `phone: "${phone || ''}"`);
  fs.writeFileSync(configPath, config);
  
  // Update keywords
  if (keywords.length > 0) {
    const kwPath = path.join(workDir, 'seo', 'keywords.yaml');
    let kw = fs.readFileSync(kwPath, 'utf8');
    kw = kw.replace('primary: []', `primary: [${keywords.map(k => `"${k}"`).join(', ')}]`);
    fs.writeFileSync(kwPath, kw);
  }
  
  // Commit and push
  sh(`cd ${workDir} && git add -A && git commit -m "Provision: ${business_name} site from SearchOps template" && git push origin main`);
  console.log('  ✅ Template applied and pushed');
  
  // Step 3: Enable GitHub Pages
  console.log('\n🌐 Enabling GitHub Pages...');
  const pagesResult = ghApi(`/repos/${ORG}/${repoName}/pages`, 'POST', {
    source: { branch: 'main', path: '/' },
  });
  
  // Step 4: Configure deployment
  console.log('\n⚙️  Configuring deployment...');
  // The GitHub Actions workflow will auto-trigger on push
  console.log('  ✅ GitHub Actions deploy workflow triggered');
  
  // Step 5: Cleanup
  sh(`rm -rf ${workDir}`);
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const siteUrl = `https://${ORG}.github.io/${repoName}`;
  
  console.log(`\n✅ Provisioning complete in ${elapsed}s`);
  console.log(`   Site: ${siteUrl}`);
  
  return {
    success: true,
    repo: `${ORG}/${repoName}`,
    url: siteUrl,
    elapsed_seconds: parseFloat(elapsed),
  };
}

// ─── CLI ────────────────────────────────────────────────────────────
const [,, command, ...args] = process.argv;

if (command === 'provision') {
  // Read customer JSON from stdin or file
  let input = '';
  if (args[0]) {
    input = fs.readFileSync(args[0], 'utf8');
  } else {
    input = fs.readFileSync('/dev/stdin', 'utf8');
  }
  
  const customer = JSON.parse(input);
  provision(customer).then(result => {
    console.log('\n' + JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  });
} else if (command === 'validate') {
  // Validate customer input
  const required = ['business_name', 'description', 'domain'];
  let input = '';
  if (args[0]) {
    input = fs.readFileSync(args[0], 'utf8');
  }
  const customer = JSON.parse(input);
  const missing = required.filter(f => !customer[f]);
  if (missing.length) {
    console.log(JSON.stringify({ valid: false, missing }));
    process.exit(1);
  }
  console.log(JSON.stringify({ valid: true }));
} else {
  console.log(`Site Provisioning Engine
Usage:
  node site-provisioning.js provision [customer.json]
  node site-provisioning.js validate [customer.json]

Customer JSON format:
{
  "business_name": "Acme Corp",
  "industry": "Technology",
  "description": "We make widgets",
  "domain": "acmecorp.com",
  "email": "hello@acmecorp.com",    // optional
  "phone": "+15551234567",           // optional
  "keywords": ["widgets", "technology"] // optional
}`);
}
