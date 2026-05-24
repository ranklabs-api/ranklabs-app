#!/usr/bin/env node
// blog-publisher — Publishes approved blog posts
// Reads approval data and post draft, then publishes to target CMS

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APPROVAL_DIR = path.join(process.env.HOME, '.hermes/workspace/searchrank/approvals');
const POSTS_DIR = path.join(process.env.HOME, '.hermes/workspace/searchrank/posts');
const PUBLISHED_DIR = path.join(process.env.HOME, '.hermes/workspace/searchrank/published');

function publish(postId) {
  const approvalFile = path.join(APPROVAL_DIR, `${postId}.approved`);
  const postFile = path.join(POSTS_DIR, `${postId}.json`);
  
  if (!fs.existsSync(postFile)) {
    return { error: `Post draft not found: ${postId}`, success: false };
  }
  
  const post = JSON.parse(fs.readFileSync(postFile, 'utf8'));
  const approval = fs.existsSync(approvalFile) 
    ? JSON.parse(fs.readFileSync(approvalFile, 'utf8')) 
    : {};

  const result = {
    post_id: postId,
    title: post.suggested_title,
    published_at: new Date().toISOString(),
    method: 'file', // default: save to file
    path: null,
    url: null,
  };

  // Save published post
  fs.mkdirSync(PUBLISHED_DIR, { recursive: true });
  
  const publishedPost = {
    ...post,
    approved_by: approval.from || 'unknown',
    approved_at: approval.date || new Date().toISOString(),
    published_at: result.published_at,
    status: 'published',
  };

  // Save as markdown (ready for CMS import)
  const slug = post.slug || postId.toLowerCase();
  const mdPath = path.join(PUBLISHED_DIR, `${slug}.md`);
  
  let md = `---\ntitle: "${post.suggested_title}"\ndate: ${result.published_at.split('T')[0]}\n`;
  md += `slug: ${slug}\ncategory: ${post.category || 'Blog'}\n`;
  md += `keywords: [${post.target_keyword || ''}]\n`;
  md += `meta_description: "${post.meta_description || ''}"\n---\n\n`;
  
  if (post.full_content) {
    md += post.full_content;
  } else {
    md += `# ${post.suggested_title}\n\n`;
    md += `*Content pending — approved by ${publishedPost.approved_by}*\n\n`;
    if (post.outline) {
      post.outline.forEach(h => { md += `${h}\n\n`; });
    }
  }

  fs.writeFileSync(mdPath, md);
  result.path = mdPath;

  // Save JSON version
  fs.writeFileSync(
    path.join(PUBLISHED_DIR, `${slug}.json`),
    JSON.stringify(publishedPost, null, 2)
  );

  // Mark approval as processed
  fs.writeFileSync(
    path.join(APPROVAL_DIR, `${postId}.published`),
    JSON.stringify(result, null, 2)
  );

  result.success = true;
  return result;
}

// CLI
const postId = process.argv[2];
if (!postId) {
  // List pending approvals
  if (fs.existsSync(APPROVAL_DIR)) {
    const files = fs.readdirSync(APPROVAL_DIR).filter(f => f.endsWith('.approved'));
    if (files.length === 0) {
      console.log(JSON.stringify({ pending: [] }));
    } else {
      const pending = files.map(f => {
        const id = f.replace('.approved', '');
        const data = JSON.parse(fs.readFileSync(path.join(APPROVAL_DIR, f), 'utf8'));
        return { id, ...data };
      });
      console.log(JSON.stringify({ pending }));
    }
  } else {
    console.log(JSON.stringify({ pending: [] }));
  }
  process.exit(0);
}

console.log(JSON.stringify(publish(postId), null, 2));
