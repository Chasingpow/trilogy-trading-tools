# Trilogy Trading Tools
Marketing site - deployed via GitHub Pages. index.html is the live site; source-with-tokens.html is the editable source (video srcs as __TOKENS__).

## Build
`npm run build` regenerates index.html, pricing/index.html, about/index.html, sitemap.xml, robots.txt and llms.txt from src/template.html.
Edit src/template.html (not the generated pages). Content between `<!-- PAGE:name -->` markers becomes the standalone /name/ page.

## Owner TODOs (search the template for `TODO(owner)`)
- Launch-list form: set `data-endpoint` on #waitlistForm to a form backend; until then it falls back to a prefilled email.
- Signup counter, founder block, beta-trader testimonials, Halal screening methodology: built but `hidden` until real content exists.
- 14-day refund line: confirm the policy before deploying (Terms updated to match).
- og-image.png and logo.png are rendered from scripts/assets/*.html.
