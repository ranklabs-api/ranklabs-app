#!/usr/bin/env node
// repo-automation — GitHub repository operations for SearchRank
// Handles: create repo from template, configure Pages, manage settings

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load env
const envPath = path.join(__dirname, '..', '..', '..', 'searchrank', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const [k, ...v] = line.split('=');
    if (k && !process.env[k]) process.env[k] = v.join('=');
  }
}

const TOKEN = process.env.GH_TOKEN;
const ORG = process.env.GITHUB_ORG || 'searchrank-api';

if (!TOKEN) {
  console.error('GH_TOKEN not set');
  process.exit(1);
}

const AUTH = `-H "Authorization: Bearer ${TOKEN}" -H "Accept: application/vnd.github+json"`;
const API = 'https://api.github.com';

function gh(args, opts = {}) {
  const result = execSync(`gh ${args}`, { encoding: 'utf8', ...opts });
  return result.trim();
}

function curl(endpoint, method = 'GET', data = null) {
  let cmd = `curl -s -X ${method} "${API}${endpoint}" ${AUTH}`;
  if (data) cmd += ` -d '${JSON.stringify(data)}'`;
  try {
    return JSON.parse(execSync(cmd, { encoding: 'utf8' }));
  } catch (e) {
    return null;
  }
}

// ─── Core Operations ────────────────────────────────────────────────

function createRepo(name, description = '', privateRepo = false) {
  console.log(`Creating repo: ${ORG}/${name}`);
  return curl(`/orgs/${ORG}/repos`, 'POST', {
    name,
    description,
    private: privateRepo,
    has_issues: true,
    has_projects: false,
    has_wiki: false,
    auto_init: false,
  });
}

function enablePages(repo, branch = 'main', folder = '/') {
  console.log(`Enabling GitHub Pages for ${ORG}/${repo}`);
  // Enable Pages
  curl(`/repos/${ORG}/${repo}/pages`, 'POST', {
    source: { branch, path: folder }
  });
  
  // Wait and get status
  return new Promise(resolve => setTimeout(resolve, 3000)).then(() => {
    const status = curl(`/repos/${ORG}/${repo}/pages`);
    return status;
  });
}

function createFromTemplate(templateRepo, newRepoName, description = '') {
  console.log(`Creating ${newRepoName} from template ${templateRepo}`);
  const result = curl(`/repos/${ORG}/${templateRepo}/generate`, 'POST', {
    name: newRepoName,
    description,
    owner: ORG,
    include_all_branches: false,
    private: false,
  });
  return result;
}

function getRepo(repo) {
  return curl(`/repos/${ORG}/${repo}`);
}

function listRepos() {
  return curl(`/orgs/${ORG}/repos?per_page=100`);
}

function deleteRepo(repo) {
  console.log(`Deleting ${ORG}/${repo}`);
  return curl(`/repos/${ORG}/${repo}`, 'DELETE');
}

// ─── CLI ────────────────────────────────────────────────────────────

const [,, command, ...args] = process.argv;

async function main() {
  switch (command) {
    case 'create':
      console.log(JSON.stringify(createRepo(args[0], args[1] || ''), null, 2));
      break;
    case 'create-from-template':
      console.log(JSON.stringify(createFromTemplate(args[0], args[1], args[2] || ''), null, 2));
      break;
    case 'enable-pages':
      console.log(JSON.stringify(await enablePages(args[0], args[1] || 'main'), null, 2));
      break;
    case 'get':
      console.log(JSON.stringify(getRepo(args[0]), null, 2));
      break;
    case 'list':
      const repos = listRepos();
      if (Array.isArray(repos)) {
        console.log(repos.map(r => r.full_name).join('\n'));
      } else {
        console.log(JSON.stringify(repos, null, 2));
      }
      break;
    case 'delete':
      console.log(JSON.stringify(deleteRepo(args[0]), null, 2));
      break;
    default:
      console.log(`Usage: node repo-automation.js <command> [args]
  create <name> [description]
  create-from-template <template> <name> [description]
  enable-pages <repo> [branch]
  get <repo>
  list
  delete <repo>`);
  }
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
