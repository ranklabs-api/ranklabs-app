#!/usr/bin/env node
// admin-dashboard — SearchRank platform admin CLI
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '..', 'searchrank', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const [k, ...v] = line.split('=');
      if (k && !process.env[k]) process.env[k.trim()] = v.join('=');
    }
  }
}
loadEnv();

const ORG = process.env.GITHUB_ORG || 'searchrank-api';

function sh(cmd, opts = {}) { try { return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts }); } catch (_) { return ''; } }

function listCustomers() {
  const AUTH = `-H "Authorization: Bearer ${process.env.GH_TOKEN}"`;
  const repos = JSON.parse(sh(`curl -s "https://api.github.com/orgs/${ORG}/repos?per_page=50" ${AUTH}`) || '[]');
  return repos.filter(r => r.name !== 'searchrank' && !r.name.includes('template')).map(r => ({
    name: r.name, site: `https://${ORG}.github.io/${r.name}`, created: r.created_at, last_push: r.pushed_at,
  }));
}

const [,, command, ...args] = process.argv;
switch (command) {
  case 'customers': {
    const customers = listCustomers();
    console.log(`Customers (${customers.length}):`);
    customers.forEach(c => console.log(`  ${c.name.padEnd(25)} ${c.site}`));
    break;
  }
  case 'status': {
    if (!args[0]) { console.log('Usage: admin.js status <repo>'); process.exit(1); }
    const AUTH = `-H "Authorization: Bearer ${process.env.GH_TOKEN}" -H "Accept: application/vnd.github+json"`;
    const pages = JSON.parse(sh(`curl -s "https://api.github.com/repos/${ORG}/${args[0]}/pages" ${AUTH}`) || '{}');
    console.log(JSON.stringify({ repo: `${ORG}/${args[0]}`, pages_status: pages.status || 'unknown', url: pages.html_url || '' }, null, 2));
    break;
  }
  case 'health': {
    console.log('Platform Health:');
    console.log(`  K8s: ${sh('kubectl cluster-info 2>&1 | head -1').trim()}`);
    console.log(`  Org: ${ORG}`);
    console.log(`  Customers: ${listCustomers().length} sites`);
    break;
  }
  default:
    console.log('SearchRank Admin\nUsage:\n  node admin.js customers\n  node admin.js status <repo>\n  node admin.js health');
}
