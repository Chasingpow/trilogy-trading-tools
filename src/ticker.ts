/** Hero ticker tape — the scrolling trading-floor strip under the headline. */
import { $ } from './util';

interface TickerEntry {
  symbol: string;
  company: string;
  price: number;
  changePct: number;
}

/** Fallback tape used until ticker-data.json loads (or when it can't). */
const ENTRIES: TickerEntry[] = [
  { symbol: 'NRXS', company: 'NRx Sustain', price: 4.18, changePct: 42.7 },
  { symbol: 'LGVN', company: 'Longeveron', price: 3.62, changePct: 28.4 },
  { symbol: 'CYCC', company: 'Cyclacel', price: 2.09, changePct: 21.6 },
  { symbol: 'GFAI', company: 'Guardforce AI', price: 1.44, changePct: 18.2 },
  { symbol: 'MULN', company: 'Mullen Auto', price: 0.87, changePct: -6.3 },
  { symbol: 'TOPS', company: 'Top Ships', price: 6.55, changePct: 15.9 },
  { symbol: 'BDRX', company: 'Biodexa', price: 1.92, changePct: 33.1 },
  { symbol: 'SINT', company: 'SiNtx Tech', price: 0.61, changePct: 12.4 },
  { symbol: 'COSM', company: 'Cosmos Health', price: 1.13, changePct: -4.1 },
  { symbol: 'VERB', company: 'Verb Tech', price: 5.24, changePct: 24.8 },
];

function render(track: HTMLElement, entries: TickerEntry[], label?: string): void {
  const cells = entries.map(({ symbol, company, price, changePct }) => {
    const up = changePct >= 0;
    return (
      `<span class="tk"><b>${symbol}</b><span class="px num">${price.toFixed(2)}</span>` +
      `<span class="chg num ${up ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${up ? '+' : ''}${changePct.toFixed(2)}%</span>` +
      `<span class="fl">${company.toUpperCase()}</span></span>`
    );
  });
  if (label) cells.unshift(`<span class="tk"><b class="tape-label">${label}</b></span>`);
  const half = cells.join('');
  track.innerHTML = half + half;   // doubled so the CSS loop is seamless
}

interface MoversFile { updated: string; entries: TickerEntry[]; }

export function initTicker(): void {
  const track = $('#tickerTrack');
  if (!track) return;
  render(track, ENTRIES);   // instant paint with the fallback tape

  // Upgrade to the real daily movers, refreshed each trading day by
  // .github/workflows/movers.yml. Any failure just keeps the fallback.
  fetch('ticker-data.json', { cache: 'no-store' })
    .then(r => (r.ok ? (r.json() as Promise<MoversFile>) : Promise.reject(new Error(String(r.status)))))
    .then(data => {
      if (!Array.isArray(data.entries) || data.entries.length < 4) return;
      const [y, m, d] = data.updated.split('-').map(Number);
      const label = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      render(track, data.entries, `TOP MOVERS · ${label}`);
    })
    .catch(() => { /* fallback tape stays up */ });
}
