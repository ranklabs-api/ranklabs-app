#!/usr/bin/env node
// blog-writer — Combines blog analysis with writing prompt for LLM
// Output: complete prompt ready for LLM to write the post
// The calling agent feeds this prompt to its LLM and saves the result.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const blogFile = process.argv[2];
const promptFile = process.argv[3] || path.join(__dirname, '../blog/prompt.txt');

if (!blogFile) {
  console.log('Usage: node blog-writer.js <blog-analysis.json> [prompt.txt]');
  process.exit(1);
}

const blogData = JSON.parse(fs.readFileSync(blogFile, 'utf8'));
const promptTemplate = fs.readFileSync(promptFile, 'utf8');

const np = blogData.new_post || {};

// Build the complete prompt
const brief = JSON.stringify({
  suggested_title: np.suggested_title,
  target_keyword: np.target_keyword,
  meta_description: np.meta_description,
  category: np.category,
  word_count_target: np.word_count_target,
  outline: np.outline,
  content_strategy: np.content_strategy,
  site_niche: {
    business_name: blogData.site_niche?.title?.split('–')[0]?.trim() || blogData.site_niche?.title || '',
    description: blogData.site_niche?.description || '',
    h2s: blogData.site_niche?.h2s || [],
    snippet: (blogData.site_niche?.body_snippet || '').substring(0, 500),
  },
  related_posts: blogData.existing_posts?.map(p => ({ title: p.title, url: p.url })) || [],
  existing_topics: blogData.existing_topics || [],
  content_gaps: blogData.content_gaps || [],
}, null, 2);

const fullPrompt = `${promptTemplate}

${brief}

## Instructions for the LLM Agent
Write the complete blog post now. Output ONLY the blog post in clean Markdown format (no JSON wrapper, no explanation).
Start with the title as an H1 heading (# Title).
Include the frontmatter metadata as a YAML block at the top:
---
title: "${np.suggested_title || ''}"
date: ${new Date().toISOString().split('T')[0]}
slug: ${np.slug || ''}
category: ${np.category || 'Blog'}
keywords: [${np.target_keyword || ''}]
meta_description: "${np.meta_description || ''}"
---

Then write the post body.`;

// Output the prompt + save it for the approval pipeline
const postId = np.id || `POST-${new Date().toISOString().split('T')[0]}-001`;
const APPROVAL_SECRET = process.env.APPROVAL_SECRET || 'searchrank-approval-secret-change-me';
const token = crypto.createHmac('sha256', APPROVAL_SECRET).update(postId).digest('hex').substring(0, 16);
const approvalBaseUrl = process.env.APPROVAL_BASE_URL || 'http://localhost:3000';
const approvalLink = `${approvalBaseUrl}/approve?code=${postId}&token=${token}`;

// Save blog analysis with post ID + token for later publishing
const postsDir = path.join(process.env.HOME, '.hermes/workspace/searchrank/posts');
fs.mkdirSync(postsDir, { recursive: true });
fs.writeFileSync(
  path.join(postsDir, `${postId}.json`),
  JSON.stringify({ ...blogData, post_id: postId, approval_token: token, approval_link: approvalLink, prompt_generated_at: new Date().toISOString() }, null, 2)
);

console.log(fullPrompt);
console.error(`POST_META: ${JSON.stringify({ postId, token, approvalLink })}`);
console.error(`Draft saved to: ${postsDir}/${postId}.json`);
