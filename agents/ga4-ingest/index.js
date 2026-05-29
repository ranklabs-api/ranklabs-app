#!/usr/bin/env node
// ga4-ingest — Pull GA4 traffic data for all Rank Labs customer sites
// Usage: node ga4-ingest.js [--site=<id>] [--days=7]
//
// Reads customer GA4 property mappings from customers.yaml,
// queries the GA4 Data API via the Python client, stores in PostgreSQL.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// ── Config ────────────────────────────────────────────────────────────────
const CUSTOMERS_PATH = path.join(__dirname, '..', '..', 'customers.yaml');
const ENV_PATH = path.join(__dirname, '..', '..', '..', '..', '..', 'workspace', 'ranklabs', '.env');
const INGEST_SCRIPT = path.join(__dirname, 'ingest.py');

// ── Helpers ────────────────────────────────────────────────────────────────

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split('\n');
  for (const line of lines) {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0 && !line.startsWith('#')) {
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

function loadCustomers() {
  if (!fs.existsSync(CUSTOMERS_PATH)) return [];
  const doc = yaml.load(fs.readFileSync(CUSTOMERS_PATH, 'utf8'));
  return (doc?.customers || []).filter(c => c.active);
}

function sh(cmd) {
  const result = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
  return result.trim();
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  loadEnv();
  const customers = loadCustomers();

  // Default credentials
  const saPath = process.env.GOOGLE_SA_PATH || path.join(process.env.HOME, '.hermes', 'workspace', 'ranklabs', 'google-sa.json');
  const days = process.env.GA4_INGEST_DAYS || '30';

  // Build customer → property map
  const siteProps = [];
  for (const c of customers) {
    if (c.ga4_property_id) {
      siteProps.push({ site_id: c.id, business_name: c.business_name, property_id: c.ga4_property_id });
    }
  }

  if (siteProps.length === 0) {
    console.error('No customers with ga4_property_id configured. Add ga4_property_id to customers.yaml.');
    process.exit(1);
  }

  console.error(`Ingesting GA4 data for ${siteProps.length} sites (${days} days)...`);

  const siteFilter = process.argv.find(a => a.startsWith('--site='));
  let sites = siteProps;
  if (siteFilter) {
    const sid = siteFilter.split('=')[1];
    sites = sites.filter(s => s.site_id === sid);
    if (sites.length === 0) {
      console.error(`Site "${sid}" not found in customers.yaml`);
      process.exit(1);
    }
  }

  for (const s of sites) {
    console.error(`\n  ${s.business_name} (${s.site_id}) → ${s.property_id}`);
    try {
      const cmd = [
        'GOOGLE_APPLICATION_CREDENTIALS=' + saPath,
        'PGHOST=' + (process.env.PGHOST || 'localhost'),
        'PGPORT=' + (process.env.PGPORT || '5433'),
        'python3', INGEST_SCRIPT,
        '--property-id=' + s.property_id,
        '--site-id=' + s.site_id,
        '--days=' + days,
      ].join(' ');
      
      const output = sh(cmd);
      console.error(`    ${output}`);
    } catch (e) {
      console.error(`    ❌ Failed: ${e.message}`);
    }
  }

  console.error('\n✅ GA4 ingestion complete');
}

main();
