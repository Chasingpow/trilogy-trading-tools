# Trilogy Trading Tools
Marketing site - deployed via GitHub Pages. index.html is the live site; source-with-tokens.html is the editable source (video srcs as __TOKENS__).

## Build
`npm run build` regenerates index.html, pricing/index.html, about/index.html, sitemap.xml, robots.txt and llms.txt from src/template.html.
Edit src/template.html (not the generated pages). Content between `<!-- PAGE:name -->` markers becomes the standalone /name/ page.

## Owner TODOs (search the template for `TODO(owner)`)
- Launch-list form: posts to Formspree (https://formspree.io/f/xkjrnvnq, free plan 50/month); emptying data-endpoint falls back to a prefilled email.
- Signup counter: built but `hidden` until a real list size is ready. Testimonials are live (`#traders`); add more as `.quote` cards with an initials avatar.
- 7-day refund policy (confirmed): shown on the hero, monthly plans, FAQ and Terms; change all together.
- og-image.png and logo.png are rendered from scripts/assets/*.html.

## Blog (HeyCatch)
Articles are written in HeyCatch and published here as static pages, following heycatch.ai/blog-agents.md.
- `.github/workflows/blog.yml` runs every 15 minutes: `scripts/fetch-blog.mjs` pulls published articles into `blog-data.json`, then `npm run build` writes `/blog/` (index) and `/blog/<slug>` pages, adds them to the sitemap, and shows the Blog nav/footer links once there are at least three articles.
- Needs the repository secret `HEYCATCH_API_KEY` (the `hck_lv_…` key from HeyCatch → Settings → Integrations → AI builder). It is never written to a file.
- Article HTML is sanitised (allow-list), the title is the page's only h1, a table of contents follows the Key takeaways list, and each article's own JSON-LD is included.
- Errors never break the site: a bad key (401/403) or API failure leaves the last good articles in place; 429 is retried once after Retry-After.

## Changelog
Edit `src/changelog.json` (newest first: date, product, title, detail, optional founder `note`). `npm run build` writes `/changelog/`, shows the three newest on the homepage under "Recently shipped", and adds the page to the sitemap and llms.txt.
