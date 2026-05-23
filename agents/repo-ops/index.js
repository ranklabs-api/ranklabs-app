#!/usr/bin/env node
// repo-ops — Hermes orchestration layer for Git repository operations
// Safe, auditable operations: clone, branch, modify, commit, push, PR

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ORG = process.env.GITHUB_ORG || 'searchops-api';
const WORK_ROOT = process.env.REPO_OPS_WORKDIR || '/tmp/searchops-repo-ops';

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
  return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts });
}

function gitUrl(repo) {
  return `https://oauth2:${process.env.GH_TOKEN}@github.com/${ORG}/${repo}.git`;
}

class RepoOps {
  constructor(repo) {
    this.repo = repo;
    this.runId = crypto.randomBytes(4).toString('hex');
    this.workDir = path.join(WORK_ROOT, `${repo}-${this.runId}`);
    this.changes = [];
    fs.mkdirSync(this.workDir, { recursive: true });
  }

  clone(branch = 'main') {
    console.log(`📦 Cloning ${ORG}/${this.repo}...`);
    sh(`git clone --branch ${branch} ${gitUrl(this.repo)} ${this.workDir}`);
    return this;
  }

  branch(name) {
    console.log(`🌿 Creating branch: ${name}`);
    sh(`cd ${this.workDir} && git checkout -b ${name}`);
    return this;
  }

  modifyFile(filePath, content, commitMsg) {
    const fullPath = path.join(this.workDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    this.changes.push({ file: filePath, message: commitMsg });
    return this;
  }

  replaceInFile(filePath, search, replace, commitMsg) {
    const fullPath = path.join(this.workDir, filePath);
    if (!fs.existsSync(fullPath)) {
      console.error(`File not found: ${filePath}`);
      return this;
    }
    let content = fs.readFileSync(fullPath, 'utf8');
    if (!content.includes(search)) {
      console.error(`Search string not found in ${filePath}`);
      return this;
    }
    content = content.replace(search, replace);
    fs.writeFileSync(fullPath, content);
    this.changes.push({ file: filePath, message: commitMsg });
    return this;
  }

  commit(message) {
    console.log(`💾 Committing: ${message}`);
    sh(`cd ${this.workDir} && git add -A && git commit -m "${message}" || true`);
    return this;
  }

  push(branch) {
    console.log(`🚀 Pushing to ${branch}...`);
    sh(`cd ${this.workDir} && git push origin ${branch}`);
    return this;
  }

  createPR(title, body, base = 'main') {
    const branch = sh(`cd ${this.workDir} && git rev-parse --abbrev-ref HEAD`).trim();
    console.log(`📝 Creating PR: ${branch} → ${base}`);
    const AUTH = `-H "Authorization: Bearer ${process.env.GH_TOKEN}" -H "Accept: application/vnd.github+json"`;
    const data = JSON.stringify({ title, body, head: branch, base });
    const result = sh(`curl -s -X POST "https://api.github.com/repos/${ORG}/${this.repo}/pulls" ${AUTH} -d '${data}'`);
    try {
      const pr = JSON.parse(result);
      console.log(`  PR created: ${pr.html_url}`);
      return pr;
    } catch (e) {
      console.error('PR creation failed:', result);
      return null;
    }
  }

  cleanup() {
    sh(`rm -rf ${this.workDir}`);
    console.log('🧹 Workspace cleaned');
    return this;
  }

  getChanges() {
    return this.changes;
  }
}

// ─── CLI ────────────────────────────────────────────────────────────
const command = process.argv[2];

if (command === 'seo-edit') {
  // SEO edit workflow: clone → modify SEO files → commit → push
  const [,,, repo, file, search, replace, commitMsg] = process.argv;
  const ops = new RepoOps(repo);
  ops.clone()
    .branch(`seo/${crypto.randomBytes(4).toString('hex')}`)
    .replaceInFile(file, search, replace, commitMsg)
    .commit(commitMsg)
    .push(ops.runId)
    .createPR(`SEO: ${commitMsg}`, `Automated SEO optimization: ${commitMsg}`)
    .cleanup();
  
  console.log(JSON.stringify({ success: true, changes: ops.getChanges() }));
} else {
  console.log(`Repo Operations Orchestration
Usage:
  node repo-ops.js seo-edit <repo> <file> <search> <replace> <message>
  
Operations: clone, branch, modifyFile, replaceInFile, commit, push, createPR, cleanup`);
}

// Export for programmatic use
module.exports = { RepoOps };
