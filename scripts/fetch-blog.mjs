/**
 * Pulls published articles from the HeyCatch API into blog-data.json.
 * Follows heycatch.ai/blog-agents.md:
 *   - key only as the `key` query parameter (HEYCATCH_API_KEY, the publishable hck_lv_… blog key)
 *   - GET /v1/articles (limit 50, offset paging until `total`), then GET /v1/articles/{slug} for content_html
 *   - 401 wrong key, 403 revoked key / deleted project, 404 unknown slug, 429 -> wait Retry-After, retry once
 *
 * Never throws away the last good data: on any error the existing blog-data.json is left untouched.
 * Run by .github/workflows/blog.yml, then `npm run build` turns the JSON into /blog pages.
 *
 * Usage: HEYCATCH_API_KEY=hck_lv_... node scripts/fetch-blog.mjs
 * Optional: HEYCATCH_API_BASE (defaults to https://api.heycatch.ai/v1; used for local mocks).
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'blog-data.json');
const BASE = (process.env.HEYCATCH_API_BASE || 'https://api.heycatch.ai/v1').replace(/\/$/, '');
const KEY = process.env.HEYCATCH_API_KEY || '';

if (!KEY) {
  console.warn('HEYCATCH_API_KEY is not set: leaving blog-data.json as it is.');
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MESSAGES = {
  401: 'HeyCatch rejected the key (401): check the HEYCATCH_API_KEY secret.',
  403: 'HeyCatch key revoked or project deleted (403).',
};

async function get(path, params = {}, retried = false) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set('key', KEY);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 429 && !retried) {
    const wait = Math.min(Number(res.headers.get('retry-after')) || 5, 120);
    console.warn(`Rate limited, retrying once in ${wait}s`);
    await sleep(wait * 1000);
    return get(path, params, true);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(MESSAGES[res.status] || `HeyCatch API error ${res.status} on ${path}`);
  return res.json();
}

try {
  const list = [];
  for (let offset = 0; ; offset += 50) {
    const page = await get('/articles', { limit: 50, offset });
    const items = page?.articles ?? [];
    list.push(...items);
    const total = Number(page?.total ?? list.length);
    if (!items.length || list.length >= total) break;
  }

  const articles = [];
  for (const item of list) {
    const one = await get(`/articles/${encodeURIComponent(item.slug)}`);
    if (!one?.article) { console.warn(`Skipping ${item.slug}: not found`); continue; }
    const a = one.article;
    articles.push({
      slug: a.slug,
      title: a.title,
      meta_description: a.meta_description || '',
      published: a.published || (a.published_at || '').slice(0, 10),
      published_at: a.published_at || a.published || '',
      updated_at: a.updated_at || a.updated || '',
      read_time: a.read_time || null,
      language: a.language || 'en',
      image: a.hero_image_url || a.featured_image || '',
      keywords: a.keywords || [],
      jsonLd: a.jsonLd ?? null,
      content_html: a.content_html || '',
    });
  }
  articles.sort((x, y) => String(y.published_at).localeCompare(String(x.published_at)));
  writeFileSync(OUT, JSON.stringify({ articles }, null, 2) + '\n');
  console.log(`Fetched ${articles.length} article(s) into blog-data.json`);
} catch (err) {
  console.error(String(err.message || err));
  console.error('blog-data.json left unchanged.');
  process.exit(1);
}
