/**
 * Build script for the Trilogy Trading Tools site.
 *
 * 1. Bundles src/main.ts with esbuild (TypeScript -> one inline IIFE).
 * 2. Injects the bundle + video sources into src/template.html.
 * 3. Emits:
 *      index.html, pricing/index.html, about/index.html — deployable pages (full <head>, JSON-LD)
 *      sitemap.xml, robots.txt, llms.txt — crawler files
 *      artifact.html  — Claude artifact preview build (videos embedded as data URIs,
 *                       no doctype/head wrapper — the artifact runtime adds its own).
 *
 * Run with: npm run build   (typecheck runs first via prebuild)
 */
import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import sanitizeHtml from 'sanitize-html';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p));

// 1. bundle the TypeScript entry point
const result = buildSync({
  entryPoints: [resolve(root, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  charset: 'utf8',
  write: false,
});
const js = result.outputFiles[0].text;

// 2. fill the template
// NOTE: every replacement uses a function so the inserted text is taken
// literally — with a plain string, sequences like `$$` are replace() escapes
// and would silently corrupt the bundled code.
const fill = (haystack, token, value) => haystack.replace(token, () => value);

const template = read('src/template.html').toString('utf8');
const withScript = fill(template, '__SCRIPT__', `<script>\n${js}</script>`);

const videoAsFile =
  fill(fill(fill(withScript,
    '__VIDEO_SRC__', 'scanner-live.mp4'),
    '__VIDEO_JR__', 'journal-reel.mp4'),
    '__VIDEO_WB__', 'wealth-builder.mp4');

const dataUri = (p) => `data:video/mp4;base64,${read(p).toString('base64')}`;
const videoEmbedded =
  fill(fill(fill(withScript,
    '__VIDEO_SRC__', dataUri('scanner-live.mp4')),
    '__VIDEO_JR__', dataUri('journal-reel.mp4')),
    '__VIDEO_WB__', dataUri('wealth-builder.mp4'));

// 3. emit the pages
const SITE = 'https://trilogytradingtools.com';
const OG_IMAGE = `${SITE}/og-image.png`;

const plans = [
  { name: '3T Pro Scanner', price: 175, unit: 'MON', desc: 'Real-time small-cap gapper scanner: live gap %, volume and float, dual charts and audio alerts, premarket through power hour.' },
  { name: 'Halal 3T Scanner', price: 200, unit: 'MON', desc: 'The 3T scanning engine on a Sharia-compliant, AAOIFI-screened universe.' },
  { name: 'Trilogy Journal', price: 100, unit: 'MON', desc: 'Trading journal with fast trade logging, live win rate, profit factor and average R, and the 3D Edge Surface.' },
  { name: 'Wealth Builder', price: 200, unit: 'ANN', desc: 'Budgeting app built around the Trilogy Split, with a bill calendar, card interest tracker and savings goals.' },
];

const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
const org = {
  '@context': 'https://schema.org', '@type': 'Organization',
  name: 'Trilogy Trading Tools', url: `${SITE}/`, logo: `${SITE}/logo.png`,
  email: 'info@trilogytradingtools.com',
  // TODO(owner): add sameAs: [founder / company LinkedIn and X URLs] once they are public.
};
const products = plans.map(p => ({
  '@context': 'https://schema.org', '@type': 'SoftwareApplication',
  name: p.name, applicationCategory: 'FinanceApplication', operatingSystem: 'Web browser',
  description: p.desc, url: `${SITE}/pricing/`,
  publisher: { '@type': 'Organization', name: 'Trilogy Trading Tools' },
  offers: {
    '@type': 'Offer', price: String(p.price), priceCurrency: 'CAD', url: `${SITE}/pricing/`,
    priceSpecification: { '@type': 'UnitPriceSpecification', price: String(p.price), priceCurrency: 'CAD', unitCode: p.unit },
  },
}));

/** FAQ schema built from the FAQ markup itself, so the two never drift apart. */
function faqLd(html) {
  const items = [...html.matchAll(/<details><summary>(.*?)<\/summary><p>(.*?)<\/p><\/details>/g)];
  if (!items.length) return '';
  const strip = (t) => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
  return jsonLd({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: items.map(([, q, a]) => ({ '@type': 'Question', name: strip(q), acceptedAnswer: { '@type': 'Answer', text: strip(a) } })),
  });
}

const RTL = new Set(['ar', 'he', 'fa', 'ur']);
const esc = (t) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
function head({ title, description, path, ld, image = OG_IMAGE, type = 'website', lang = 'en' }) {
  const url = `${SITE}${path}`;
  return `<!doctype html>
<html lang="${esc(lang)}"${RTL.has(lang.slice(0, 2)) ? ' dir="rtl"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:site_name" content="Trilogy Trading Tools">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="${type}">
<meta property="og:image" content="${image}">
${image === OG_IMAGE ? '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n' : ''}<meta property="og:image:alt" content="Trilogy Trading Tools: small-cap scanner, trade journal and budgeting app">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${image}">
${ld}
</head>
<body style="margin:0">
`;
}
const tail = '\n</body>\n</html>\n';

/** Everything between <!-- PAGE:name --> and <!-- /PAGE:name --> in the template. */
function block(html, name) {
  const open = `<!-- PAGE:${name} -->`, close = `<!-- /PAGE:${name} -->`;
  const a = html.indexOf(open), b = html.indexOf(close);
  if (a < 0 || b < 0) throw new Error(`missing PAGE:${name} markers`);
  return html.slice(a + open.length, b);
}

/**
 * A standalone sub-page: same chrome (styles, nav, footer, dialogs, script),
 * with the main content swapped for one PAGE block. The block's first h2 becomes
 * the page's h1, and any #anchor that no longer exists on the page points home.
 */
function subpage(html, name) {
  const navEnd = html.indexOf('<div class="progress"');
  const footStart = html.indexOf('<footer>');
  let content = block(html, name).replace(/<h2>([\s\S]*?)<\/h2>/, '<h1>$1</h1>');
  let page = html.slice(0, navEnd) + content + html.slice(footStart);
  const ids = new Set([...page.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  page = page.replace(/href="#([^"]+)"/g, (m, id) => (ids.has(id) ? m : `href="/#${id}"`));
  return page;
}


/** Same chrome as the sub-pages (styles, nav, footer, dialogs, script) around arbitrary content. */
function withContent(html, content) {
  const navEnd = html.indexOf('<div class="progress"');
  const footStart = html.indexOf('<footer>');
  let page = html.slice(0, navEnd) + content + html.slice(footStart);
  const ids = new Set([...page.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  return page.replace(/href="#([^"]+)"/g, (m, id) => (ids.has(id) ? m : `href="/#${id}"`));
}

// ---------- blog (articles from HeyCatch, fetched into blog-data.json by scripts/fetch-blog.mjs) ----------
const blogFile = resolve(root, 'blog-data.json');
const articles = existsSync(blogFile)
  ? (JSON.parse(readFileSync(blogFile, 'utf8')).articles || []).filter(a => a && a.slug && a.title)
  : [];

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/i;
const escText = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtDate = (d) => {
  const t = Date.parse(d);
  return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};
const metaLine = (a) => [fmtDate(a.published_at || a.published), a.read_time ? `${a.read_time} min read` : ''].filter(Boolean).join(' · ');
const safeUrl = (u) => (/^https:\/\//i.test(u || '') ? u : '');

/** Sanitise article HTML: allow-list tags, keep heading ids, no <h1> (the title is the page's only h1). */
function cleanArticle(html) {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h2', 'h3', 'h4', 'figure', 'figcaption']),
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'], img: ['src', 'alt', 'width', 'height', 'loading'],
      h2: ['id'], h3: ['id'], h4: ['id'], th: ['colspan', 'rowspan', 'scope'], td: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['https', 'mailto'],
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
    transformTags: {
      h1: 'h2',
      a: (tag, attribs) => {
        const external = /^https?:\/\//i.test(attribs.href || '') && !attribs.href.includes('trilogytradingtools.com');
        return { tagName: 'a', attribs: external ? { ...attribs, rel: 'noopener', target: '_blank' } : attribs };
      },
      img: (tag, attribs) => ({ tagName: 'img', attribs: { ...attribs, loading: 'lazy' } }),
    },
  });
}

/** Table of contents: one link per <h2 id>, skipping id="faq"; after the Key takeaways list, else on top. */
function withToc(html) {
  const heads = [...html.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)]
    .filter(([, id]) => id.toLowerCase() !== 'faq')
    .filter(([, , text]) => !/key takeaways/i.test(text.replace(/<[^>]+>/g, '')));
  if (!heads.length) return html;
  const toc = `<nav class="toc" aria-label="Table of contents"><h2>Table of contents</h2><ol>${
    heads.map(([, id, text]) => `<li><a href="#${id}">${text.replace(/<[^>]+>/g, '')}</a></li>`).join('')}</ol></nav>`;
  const kt = html.match(/<h[2-4][^>]*>\s*Key takeaways\s*<\/h[2-4]>\s*<(ul|ol)>[\s\S]*?<\/\1>/i);
  if (kt) { const end = kt.index + kt[0].length; return html.slice(0, end) + toc + html.slice(end); }
  return toc + html;
}

/** The article's own JSON-LD, made safe to sit inside a <script> tag. */
function articleLd(a) {
  if (!a.jsonLd) return '';
  let obj = a.jsonLd;
  if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch { return ''; } }
  const list = Array.isArray(obj) ? obj : [obj];
  return list.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n');
}

function blogIndex(site) {
  const items = articles.map(a =>
    `<li><a href="/blog/${a.slug}"><b>${escText(a.title)}</b><span>${escText(metaLine(a))}</span></a></li>`).join('\n');
  return withContent(site, `<main class="blog-wrap">
  <span class="post-meta">Trilogy Trading Tools</span>
  <h1>The Trilogy <span class="serif-i grad-text">blog</span></h1>
  ${articles.length ? `<ul class="post-list">\n${items}\n</ul>` : '<p class="post-empty">No articles yet. Check back soon.</p>'}
</main>
`);
}

function blogPost(site, a) {
  const lang = a.language || 'en';
  const img = safeUrl(a.image);
  const body = withToc(cleanArticle(a.content_html));
  return withContent(site, `<main class="blog-wrap">
  <span class="post-meta">${escText(metaLine(a))}</span>
  <article lang="${esc(lang)}"${RTL.has(lang.slice(0, 2)) ? ' dir="rtl"' : ''}>
    <h1>${escText(a.title)}</h1>
    ${img ? `<img class="post-hero" src="${esc(img)}" alt="">` : ''}
    <div class="prose">${body}</div>
  </article>
  <p><a href="/blog/">← All articles</a></p>
</main>
`);
}

const homeDesc = 'Trilogy Trading Tools - rent the 3T Pro Scanner, Halal 3T Scanner, Trilogy Journal, and Wealth Builder. Find the move, prove your edge, keep what the market gives you.';
const site = articles.length ? videoAsFile.replace(/ data-blog-link hidden>/g, ' data-blog-link>') : videoAsFile;
const pages = [
  {
    file: 'index.html', path: '/', body: site,
    title: 'Trilogy - Small-Cap Scanner, Journal & Budget',
    description: homeDesc,
    ld: [org, ...products].map(jsonLd).join('\n') + '\n' + faqLd(videoAsFile),
  },
  {
    file: 'pricing/index.html', path: '/pricing/', body: subpage(site, 'pricing'),
    title: 'Trading Tool Pricing in CAD - Trilogy',
    description: 'Month-to-month pricing in CAD: 3T Pro Scanner $175/mo, Halal 3T Scanner $200/mo, Trilogy Journal $100/mo, Wealth Builder $200/yr, plus bundles from $225/mo. Cancel anytime.',
    ld: products.map(jsonLd).join('\n') + '\n' + faqLd(block(videoAsFile, 'pricing')),
  },
  {
    file: 'about/index.html', path: '/about/', body: subpage(site, 'about'),
    title: 'About Trilogy - Built by Small-Cap Traders',
    description: 'Trilogy Trading Tools started as the scanner, journal and budget we built for our own small-cap trading. We rent out the exact tools we run live.',
    ld: jsonLd(org),
  },
];


// blog pages: /blog/ (index) and /blog/<slug> (served by GitHub Pages from blog/<slug>.html)
const goodArticles = articles.filter(a => SAFE_SLUG.test(a.slug));
pages.push({
  file: 'blog/index.html', path: '/blog/', body: blogIndex(site), inSitemap: goodArticles.length > 0,
  title: 'Blog - Trilogy Trading Tools',
  description: 'Articles for small-cap momentum traders from the team behind the 3T Pro Scanner, Trilogy Journal and Wealth Builder.',
  ld: '',
});
for (const a of goodArticles) {
  pages.push({
    file: `blog/${a.slug}.html`, path: `/blog/${a.slug}`, body: blogPost(site, a),
    title: `${a.title} - Trilogy`, description: a.meta_description || a.title,
    image: safeUrl(a.image) || OG_IMAGE, type: 'article', lang: a.language || 'en', ld: articleLd(a),
    lastmod: (a.updated_at || a.published_at || a.published || '').slice(0, 10),
  });
}
// remove pages for articles that are no longer published
mkdirSync(resolve(root, 'blog'), { recursive: true });
const keep = new Set(pages.map(p => p.file));
for (const f of readdirSync(resolve(root, 'blog'))) {
  if (f.endsWith('.html') && !keep.has(`blog/${f}`)) rmSync(resolve(root, 'blog', f));
}

mkdirSync(resolve(root, 'pricing'), { recursive: true });
mkdirSync(resolve(root, 'about'), { recursive: true });
for (const p of pages) writeFileSync(resolve(root, p.file), head(p) + p.body + tail);
writeFileSync(resolve(root, 'artifact.html'), videoEmbedded);

// crawler files
const today = new Date().toISOString().slice(0, 10);
writeFileSync(resolve(root, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.filter(p => p.inSitemap !== false).map(p => `  <url><loc>${SITE}${p.path}</loc><lastmod>${p.lastmod || today}</lastmod></url>`).join('\n')}
</urlset>
`);
writeFileSync(resolve(root, 'robots.txt'), `# Search engines and AI assistants are welcome.
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

Sitemap: ${SITE}/sitemap.xml
`);
writeFileSync(resolve(root, 'llms.txt'), `# Trilogy Trading Tools

> Rentable trading software for small-cap momentum traders: a real-time gapper scanner, a trading journal, and a budgeting app, sold month to month in CAD. Pre-launch: plans are open on a launch list.

## Tools
${plans.map(p => `- ${p.name}: $${p.price} CAD/${p.unit === 'MON' ? 'mo' : 'yr'}. ${p.desc}`).join('\n')}

## Bundles
- Trader Pack (3T Pro Scanner + Trilogy Journal): $225 CAD/mo
- Halal Trader Pack (Halal 3T Scanner + Trilogy Journal): $275 CAD/mo
- The Full Trilogy (both scanners + Journal + a year of Wealth Builder): $325 CAD/mo
- Pay the year upfront for 10% off any monthly tool or package. Cancel anytime.

## Pages
- [Home](${SITE}/)
- [Pricing](${SITE}/pricing/)
- [About](${SITE}/about/)
${goodArticles.length ? `- [Blog](${SITE}/blog/)\n` : ''}
Contact: info@trilogytradingtools.com. Nothing here is financial advice.
`);

console.log(`blog: ${goodArticles.length} article(s)`);
for (const f of [...pages.filter(p => !p.file.startsWith('blog/') || p.file === 'blog/index.html').map(p => p.file), 'artifact.html', 'sitemap.xml', 'robots.txt', 'llms.txt']) {
  console.log(f.padEnd(20), readFileSync(resolve(root, f)).length, 'bytes');
}
