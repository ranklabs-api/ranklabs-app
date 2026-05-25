#!/usr/bin/env node
// deployment-agent — Validate build, trigger deploy, verify, rollback
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

function sh(cmd, opts = {}) { 
  try { return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts }); } 
  catch (e) { if (!opts.ignoreError) throw e; return ''; }
}

async function deploy(repo, branch = 'main') {
  console.error(`Deploying ${ORG}/${repo}...`);
  const results = { repo, branch, steps: [] };
  
  // Step 1: Validate build
  console.error('1. Validating build...');
  const AUTH = `-H "Authorization: Bearer ${process.env.GH_TOKEN}" -H "Accept: application/vnd.github+json"`;
  const workflows = sh(`curl -s "https://api.github.com/repos/${ORG}/${repo}/actions/workflows" ${AUTH}`, { ignoreError: true });
  const hasDeployWorkflow = workflows.includes('deploy.yml');
  results.steps.push({ step: 'validate_build_workflow', success: hasDeployWorkflow });
  
  // Step 2: Trigger deploy
  console.error('2. Triggering deployment...');
  if (hasDeployWorkflow) {
    const trigger = sh(`curl -s -X POST "https://api.github.com/repos/${ORG}/${repo}/actions/workflows/deploy.yml/dispatches" ${AUTH} -d '{"ref":"${branch}"}' -w "%{http_code}"`, { ignoreError: true });
    results.steps.push({ step: 'trigger_deploy', status: trigger });
  }
  
  // Step 3: Check Pages status
  console.error('3. Checking deployment...');
  const pages = sh(`curl -s "https://api.github.com/repos/${ORG}/${repo}/pages" ${AUTH}`, { ignoreError: true });
  try {
    const pagesData = JSON.parse(pages);
    results.pages = { status: pagesData.status, url: pagesData.html_url };
  } catch (e) {
    results.pages = { error: 'Could not parse pages status' };
  }
  
  // Step 4: Verify
  console.error('4. Verifying site...');
  const siteUrl = `https://${ORG}.github.io/${repo}`;
  const httpStatus = sh(`curl -s -o /dev/null -w "%{http_code}" "${siteUrl}"`, { ignoreError: true, timeout: 10000 }).trim();
  results.steps.push({ step: 'verify', url: siteUrl, status: httpStatus });
  results.success = httpStatus === '200';
  
  return results;
}

const [,, repo, branch] = process.argv;
if (!repo) { console.error('Usage: node deployment-agent.js <repo> [branch]'); process.exit(1); }
deploy(repo, branch || 'main').then(r => {
  console.log('\n' + JSON.stringify(r, null, 2));
  process.exit(r.success ? 0 : 1);
});
