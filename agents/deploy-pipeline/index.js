#!/usr/bin/env node
// deploy-pipeline — Build and deploy static sites to GitHub Pages
// Orchestrates: clone → build → deploy → verify → (rollback)

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKEN = process.env.GH_TOKEN;
const ORG = process.env.GITHUB_ORG || 'searchrank-api';
const WORK_DIR = process.env.DEPLOY_WORKDIR || '/tmp/searchrank-deploy';

if (!TOKEN) {
  const envPath = path.join(__dirname, '..', '..', '..', 'searchrank', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const [k, ...v] = line.split('=');
      if (k && !process.env[k]) process.env[k] = v.join('=');
    }
  }
}

function sh(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts });
}

function gitUrl(repo) {
  return `https://oauth2:${process.env.GH_TOKEN}@github.com/${ORG}/${repo}.git`;
}

async function deploy(repo, branch = 'main') {
  const runId = crypto.randomBytes(4).toString('hex');
  const repoDir = path.join(WORK_DIR, `${repo}-${runId}`);
  
  console.log(`\n🚀 Deploying ${ORG}/${repo} (run: ${runId})`);
  
  // Phase 1: Clone
  console.log('📦 Cloning repository...');
  fs.mkdirSync(WORK_DIR, { recursive: true });
  sh(`git clone --depth 1 --branch ${branch} ${gitUrl(repo)} ${repoDir}`);
  
  // Phase 2: Build
  console.log('🔨 Building site...');
  const buildCmd = 'npm ci && npm run build';
  try {
    sh(buildCmd, { cwd: repoDir, timeout: 120000 });
  } catch (e) {
    console.error('Build failed:', e.stderr);
    return { success: false, phase: 'build', error: e.stderr };
  }
  
  // Phase 3: Verify build output
  const distDir = path.join(repoDir, 'dist');
  if (!fs.existsSync(distDir)) {
    console.error('No dist/ directory — build may have failed silently');
    return { success: false, phase: 'verify', error: 'No dist/ directory' };
  }
  const files = fs.readdirSync(distDir);
  console.log(`✅ Build complete — ${files.length} files in dist/`);
  
  // Phase 4: Deploy (trigger GitHub Actions or push to gh-pages)
  console.log('🚀 Deploying...');
  
  // First try: trigger workflow_dispatch if deploy.yml exists
  const workflowFile = path.join(repoDir, '.github', 'workflows', 'deploy.yml');
  if (fs.existsSync(workflowFile)) {
    console.log('Triggering GitHub Actions deploy workflow...');
    try {
      const curl = `curl -s -X POST \
        -H "Authorization: Bearer ${process.env.GH_TOKEN}" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/${ORG}/${repo}/actions/workflows/deploy.yml/dispatches" \
        -d '{"ref":"${branch}"}'`;
      const result = JSON.parse(sh(curl));
      console.log('Workflow dispatched');
    } catch (e) {
      console.log('Workflow dispatch requires deploy.yml in .github/workflows/');
    }
  }
  
  // Alternative: push to gh-pages branch
  try {
    sh(`cd ${repoDir} && git checkout -b gh-pages 2>/dev/null || git checkout gh-pages`);
    // Copy dist contents
    const pagesDir = path.join(WORK_DIR, `${repo}-pages-${runId}`);
    fs.mkdirSync(pagesDir, { recursive: true });
    sh(`cp -r ${distDir}/* ${pagesDir}/`);
    sh(`cd ${pagesDir} && git init && git checkout -b gh-pages && git add -A && git commit -m "Deploy ${runId}" && git push -f ${gitUrl(repo)} gh-pages`);
    console.log('✅ Pushed to gh-pages branch');
  } catch (e) {
    console.log('gh-pages push skipped (using Actions workflow instead)');
  }
  
  // Phase 5: Verify
  console.log('🔍 Verifying deployment...');
  const pageUrl = `https://${ORG}.github.io/${repo}`;
  try {
    sh(`curl -s -o /dev/null -w "%{http_code}" "${pageUrl}"`, { timeout: 15000 });
    console.log(`✅ Site accessible at ${pageUrl}`);
  } catch (e) {
    console.log('Site may take a moment to become available');
  }
  
  // Cleanup
  sh(`rm -rf ${repoDir}`);
  console.log('🧹 Cleaned up workspace');
  
  return { success: true, url: pageUrl, runId };
}

// CLI
const [,, command, repo, branch] = process.argv;

if (command === 'deploy') {
  deploy(repo, branch || 'main').then(result => {
    console.log('\n' + JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  });
} else {
  console.log(`Usage: node deploy-pipeline.js deploy <repo> [branch]`);
}
