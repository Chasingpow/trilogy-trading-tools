/**
 * Build script for the Trilogy Trading Tools site.
 *
 * 1. Bundles src/main.ts with esbuild (TypeScript -> one inline IIFE).
 * 2. Injects the bundle + video sources into src/template.html.
 * 3. Emits:
 *      index.html     — the deployable page (videos referenced as files, full <head>)
 *      artifact.html  — Claude artifact preview build (videos embedded as data URIs,
 *                       no doctype/head wrapper — the artifact runtime adds its own).
 *
 * Run with: npm run build   (typecheck runs first via prebuild)
 */
import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
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

// 3. emit both outputs
const head = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Trilogy Trading Tools - rent the 3T Pro Scanner, Halal 3T Scanner, Trilogy Journal, and Wealth Builder. Find the move, prove your edge, keep what the market gives you.">
<link rel="canonical" href="https://trilogytradingtools.com/">
<meta property="og:title" content="Trilogy Trading Tools">
<meta property="og:description" content="Rent the 3T Pro Scanner, Halal 3T Scanner, Trilogy Journal, and Wealth Builder.">
<meta property="og:url" content="https://trilogytradingtools.com/">
<meta property="og:type" content="website">
</head>
<body style="margin:0">
`;

writeFileSync(resolve(root, 'index.html'), head + videoAsFile + '\n</body>\n</html>\n');
writeFileSync(resolve(root, 'artifact.html'), videoEmbedded);

for (const f of ['index.html', 'artifact.html']) {
  console.log(f.padEnd(14), readFileSync(resolve(root, f)).length, 'bytes');
}
