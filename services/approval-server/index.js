#!/usr/bin/env node
// approval-server — Click-to-approve blog post microservice
// GET /approve?code=POST-xxx&token=sha256-hash
// Verifies token, marks post approved, returns success page.

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const POSTS_DIR = process.env.POSTS_DIR || path.join(process.env.HOME || '/tmp', '.hermes/workspace/searchops/posts');
const APPROVAL_DIR = process.env.APPROVAL_DIR || path.join(process.env.HOME || '/tmp', '.hermes/workspace/searchops/approvals');
const SECRET = process.env.APPROVAL_SECRET || 'searchops-approval-secret-change-me';

fs.mkdirSync(APPROVAL_DIR, { recursive: true });

function generateToken(postId) {
  return crypto.createHmac('sha256', SECRET).update(postId).digest('hex').substring(0, 16);
}

function html(page) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${page.title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  .card { background: #1e293b; border-radius: 12px; padding: 48px; max-width: 520px; text-align: center; border: 1px solid #334155; }
  .icon { font-size: 64px; margin-bottom: 24px; }
  h1 { font-size: 24px; margin-bottom: 12px; color: #f8fafc; }
  p { color: #94a3b8; line-height: 1.6; margin-bottom: 16px; }
  .post-title { color: #38bdf8; font-weight: 600; }
  .meta { font-size: 13px; color: #64748b; margin-top: 24px; }
  .error { color: #f87171; }
  a { color: #38bdf8; }
</style>
</head>
<body>
<div class="card">
  <div class="icon">${page.icon}</div>
  <h1>${page.heading}</h1>
  ${page.body}
  <div class="meta">SearchOps AI &bull; ${new Date().toISOString().split('T')[0]}</div>
</div>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  
  // Health check
  if (parsed.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
    return;
  }

  // Approval endpoint
  if (parsed.pathname === '/approve') {
    const { code, token } = parsed.query;
    
    if (!code || !token) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(html({ icon: '❓', heading: 'Missing Parameters', body: '<p class="error">This approval link is incomplete. Please check the email and try again.</p>' }));
      return;
    }

    // Verify token
    const expectedToken = generateToken(code);
    if (token !== expectedToken) {
      res.writeHead(403, { 'Content-Type': 'text/html' });
      res.end(html({ icon: '🔒', heading: 'Invalid Approval Link', body: '<p class="error">The approval token does not match. This link may have been tampered with or is expired.</p>' }));
      return;
    }

    // Check if post exists
    const postFile = path.join(POSTS_DIR, `${code}.json`);
    if (!fs.existsSync(postFile)) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(html({ icon: '📭', heading: 'Post Not Found', body: `<p>The post <strong>${code}</strong> could not be found. It may have already been processed.</p>` }));
      return;
    }

    // Check if already approved
    const approvalFile = path.join(APPROVAL_DIR, `${code}.approved`);
    if (fs.existsSync(approvalFile)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html({ icon: '✅', heading: 'Already Approved!', body: '<p>This blog post has already been approved and is being published. No further action is needed.</p>' }));
      return;
    }

    // Mark as approved
    const post = JSON.parse(fs.readFileSync(postFile, 'utf8'));
    const approvalData = {
      id: code,
      subject: `Blog Approval - ${post.new_post?.suggested_title || 'Untitled'}`,
      from: 'web-approval',
      date: new Date().toISOString(),
      method: 'click-link',
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    };
    fs.writeFileSync(approvalFile, JSON.stringify(approvalData, null, 2));

    // Also run the publisher immediately
    const { execSync } = require('child_process');
    try {
      const repoRoot = path.join(__dirname, '..', '..');
      execSync(`node agents/blog-publisher/index.js "${code}"`, { 
        cwd: repoRoot, 
        timeout: 10000,
        stdio: 'pipe'
      });
    } catch (e) {
      console.error('Publisher error:', e.message);
    }

    const postTitle = post.new_post?.suggested_title || 'Untitled';
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html({
      icon: '🎉',
      heading: 'Blog Post Approved!',
      body: `<p>Your blog post has been approved and is now being published.</p>
             <p class="post-title">"${postTitle}"</p>
             <p>The post will appear on your website shortly. You'll receive a confirmation email when it's live.</p>`
    }));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/html' });
  res.end(html({ icon: '🔍', heading: 'Page Not Found', body: '<p>This is a SearchOps AI approval endpoint. Use the link from your approval email.</p>' }));
});

server.listen(PORT, () => {
  console.log(`Approval server running on port ${PORT}`);
  console.log(`Posts dir: ${POSTS_DIR}`);
  console.log(`Approvals dir: ${APPROVAL_DIR}`);
});
