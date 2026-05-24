#!/usr/bin/env node
// blog-agent — Scan existing blog posts, identify content gaps, draft new post
const { chromium } = require('playwright');

async function analyze(siteUrl) {
  console.error(`Blog analysis: ${siteUrl}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const result = {
    site: siteUrl,
    timestamp: new Date().toISOString(),
    existing_posts: [],
    site_niche: {},
    content_gaps: [],
    new_post: null,
  };

  try {
    // 1. Crawl main page for niche/site info
    await page.goto(siteUrl, { waitUntil: 'networkidle', timeout: 30000 });
    result.site_niche = await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      h1: document.querySelector('h1')?.textContent?.trim() || '',
      h2s: Array.from(document.querySelectorAll('h2')).slice(0, 5).map(h => h.textContent.trim()),
      body_snippet: document.body.innerText.substring(0, 1500),
    }));

    // 2. Find and crawl blog page
    const blogUrl = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      const blogLink = links.find(a => {
        const text = a.textContent.toLowerCase();
        const href = a.href.toLowerCase();
        return text.includes('blog') || href.includes('/blog');
      });
      return blogLink ? blogLink.href : null;
    });

    if (!blogUrl) {
      result.error = 'No blog link found on site';
      await browser.close();
      return result;
    }

    // 3. Crawl blog index page for existing posts
    await page.goto(blogUrl, { waitUntil: 'networkidle', timeout: 30000 });
    result.blog_url = blogUrl;

    const blogData = await page.evaluate(() => {
      // Try multiple selectors for blog post listings
      const selectors = [
        'article', '.post', '.blog-post', '.entry', '.blog-entry',
        '.post-item', '.article-item', 'main a[href]',
      ];

      let posts = [];
      for (const sel of selectors) {
        const elements = document.querySelectorAll(sel);
        if (elements.length > 0) {
          posts = Array.from(elements).slice(0, 30).map((el, i) => {
            const titleEl = el.querySelector('h1, h2, h3, h4, .title, .entry-title');
            const linkEl = el.tagName === 'A' ? el : el.querySelector('a[href]');
            const dateEl = el.querySelector('time, .date, .post-date, .entry-date');
            const excerptEl = el.querySelector('p, .excerpt, .entry-summary');

            const rawTitle = titleEl?.textContent?.trim() || linkEl?.textContent?.trim() || '';
            const rawUrl = linkEl?.href || '';

            // Filter noise: "Read more" buttons, wp-admin links, generic "Post N" placeholders
            const noiseWords = /^(read more|post \d+|learn more|continue reading|view more)$/i;
            if (noiseWords.test(rawTitle) || rawUrl.includes('/wp-admin/') || !rawUrl) {
              return null;
            }

            return {
              title: rawTitle.substring(0, 120),
              url: rawUrl,
              date: dateEl?.textContent?.trim() || dateEl?.getAttribute('datetime') || '',
              excerpt: excerptEl?.textContent?.trim().substring(0, 200) || '',
            };
          }).filter(Boolean);
          break;
        }
      }

      // Deduplicate by URL
      const seen = new Set();
      posts = posts.filter(p => {
        if (seen.has(p.url)) return false;
        seen.add(p.url);
        return true;
      });

      // Also grab any linked blog posts from the page
      const blogLinks = Array.from(document.querySelectorAll('a[href]'))
        .filter(a => {
          const href = a.href;
          return href.includes('/blog/') || href.includes('/post/') || href.includes('/article/');
        })
        .slice(0, 30)
        .map(a => ({
          title: a.textContent.trim().substring(0, 80),
          url: a.href,
        }));

      // Add word count and page count
      const wordCount = document.body.innerText.split(/\s+/).length;

      return { posts, blogLinks, wordCount };
    });

    result.existing_posts = blogData.posts.length > 0 ? blogData.posts : blogData.blogLinks;
    result.blog_word_count = blogData.wordCount;

    // 4. Extract topics from existing posts
    const existingTopics = result.existing_posts.map(p => {
      const words = p.title.toLowerCase().split(/\s+/);
      return words.filter(w => w.length > 4);
    }).flat();

    const topicFreq = {};
    existingTopics.forEach(t => { topicFreq[t] = (topicFreq[t] || 0) + 1; });
    result.existing_topics = Object.entries(topicFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, count]) => ({ word, count }));

    // 5. Content gap analysis
    // Extract key phrases from site niche
    const siteWords = (result.site_niche.body_snippet || '').toLowerCase().split(/\s+/);
    const nicheKeywords = [...new Set(siteWords.filter(w => w.length > 5))].slice(0, 30);

    // Common healthcare topic clusters (tailored to site niche)
    const healthcareTopics = [
      'preparation', 'recovery', 'risks', 'benefits', 'procedure',
      'screening', 'prevention', 'symptoms', 'diagnosis', 'treatment',
      'questions', 'guide', 'diet', 'exercise', 'wellness',
      'insurance', 'cost', 'appointment', 'referral', 'specialist',
      'technology', 'research', 'update', 'myth', 'facts',
      'comparison', 'alternative', 'timeline', 'checklist', 'tips',
    ];

    const blogTopics = ['trends', 'news', 'update', 'case-study', 'how-to', 'guide', 'checklist', 'tips', 'faq', 'myth', 'comparison', 'review', 'beginners', 'advanced', 'seasonal'];

    // Find topics not yet covered
    const coveredWords = new Set(existingTopics.map(t => t.toLowerCase()));
    const allTopicPools = [...new Set([...healthcareTopics, ...blogTopics])];

    result.content_gaps = allTopicPools
      .filter(topic => !coveredWords.has(topic) && !coveredWords.has(topic + 's'))
      .map(topic => ({
        topic,
        relevance: nicheKeywords.some(kw => kw.includes(topic) || topic.includes(kw)) ? 'high' : 'medium',
      }))
      .sort((a, b) => a.relevance === 'high' ? -1 : 1)
      .slice(0, 10);

    // 6. Generate new blog post brief
    const highGaps = result.content_gaps.filter(g => g.relevance === 'high');
    const chosenTopic = highGaps[0] || result.content_gaps[0] || { topic: 'general', relevance: 'medium' };

    const siteTitle = result.site_niche.title || '';
    const nicheName = siteTitle.split('–')[0]?.trim() || siteTitle.split('|')[0]?.trim() || 'Practice';

    result.new_post = {
      id: `POST-${new Date().toISOString().split('T')[0]}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`,
      status: 'draft',
      suggested_title: generateTitle(chosenTopic.topic, nicheName, result.site_niche),
      target_keyword: `${chosenTopic.topic} ${nicheName.toLowerCase()}`,
      meta_description: `Learn about ${chosenTopic.topic} for ${nicheName}. Expert guidance on what to expect, how to prepare, and key considerations.`,
      slug: chosenTopic.topic.replace(/\s+/g, '-').toLowerCase(),
      category: chosenTopic.relevance === 'high' ? 'Patient Education' : 'Practice News',
      word_count_target: 800,
      outline: generateOutline(chosenTopic.topic, nicheName),
      content_strategy: `${result.existing_posts.length} existing post(s) found. This fills the "${chosenTopic.topic}" content gap. Target: answer patient FAQs, rank for long-tail "${chosenTopic.topic}" queries.`,
      related_posts: result.existing_posts.slice(0, 3).map(p => p.title),
    };

  } catch (e) {
    result.error = e.message;
  }

  await browser.close();
  return result;
}

function generateTitle(topic, nicheName, siteNiche) {
  const templates = [
    `${topic.charAt(0).toUpperCase() + topic.slice(1)}: What ${nicheName} Patients Need to Know`,
    `Your Guide to ${topic.charAt(0).toUpperCase() + topic.slice(1)} at ${nicheName}`,
    `${topic.charAt(0).toUpperCase() + topic.slice(1)} 101: A Complete Overview from ${nicheName}`,
    `The ${nicheName} Guide to ${topic.charAt(0).toUpperCase() + topic.slice(1)}`,
    `Top Questions About ${topic.charAt(0).toUpperCase() + topic.slice(1)} — Answered by ${nicheName}`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateOutline(topic, nicheName) {
  return [
    `## What Is ${topic.charAt(0).toUpperCase() + topic.slice(1)}?`,
    `## Why ${topic.charAt(0).toUpperCase() + topic.slice(1)} Matters for ${nicheName} Patients`,
    `## How to Prepare`,
    `## What to Expect`,
    `## Frequently Asked Questions`,
    `## Next Steps & Resources`,
  ];
}

// CLI
const url = process.argv[2];
if (!url) {
  console.log('Usage: node blog-agent.js <site-url>');
  process.exit(1);
}

analyze(url).then(r => {
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.error ? 1 : 0);
});
