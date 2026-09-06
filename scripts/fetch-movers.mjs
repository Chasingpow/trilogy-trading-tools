/**
 * Fetches the day's top gainers and losers from Financial Modeling Prep and
 * writes ticker-data.json for the hero ticker tape.
 *
 * Runs in GitHub Actions after market close on weekdays (.github/workflows/movers.yml).
 * Needs FMP_API_KEY in the environment (repo secret in CI).
 * On holidays FMP still returns the last session, so the committed file simply
 * doesn't change — exactly the behavior we want.
 */
import { writeFileSync } from 'node:fs';

const KEY = process.env.FMP_API_KEY;
if (!KEY) {
  console.error('FMP_API_KEY is not set');
  process.exit(1);
}

const GAINERS = 8;   // how many of each to keep on the tape
const LOSERS = 4;

async function fmp(path) {
  const res = await fetch(`https://financialmodelingprep.com/stable/${path}?apikey=${KEY}`);
  if (!res.ok) throw new Error(`FMP ${path} -> HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`FMP ${path} -> unexpected payload`);
  return data;
}

const clean = (rows, count) => rows
  .filter(r => r.symbol && r.price > 0.2 && Math.abs(r.changesPercentage) < 500)
  .slice(0, count)
  .map(r => ({
    symbol: String(r.symbol).toUpperCase(),
    company: String(r.name ?? r.symbol).slice(0, 26),
    price: Number(r.price),
    changePct: Number(r.changesPercentage),
  }));

const [gainers, losers] = await Promise.all([
  fmp('biggest-gainers'),
  fmp('biggest-losers'),
]);

const top = clean(gainers, GAINERS);
const bottom = clean(losers, LOSERS);
if (top.length < 4) throw new Error('too few gainers returned — refusing to overwrite');

// interleave a loser after every couple of gainers so the tape has rhythm
const entries = [];
let g = 0, l = 0;
while (g < top.length || l < bottom.length) {
  if (g < top.length) entries.push(top[g++]);
  if (g < top.length) entries.push(top[g++]);
  if (l < bottom.length) entries.push(bottom[l++]);
}

const out = {
  updated: new Date().toISOString().slice(0, 10),
  entries,
};
writeFileSync('ticker-data.json', JSON.stringify(out, null, 2) + '\n');
console.log(`ticker-data.json written: ${entries.length} entries for ${out.updated}`);
