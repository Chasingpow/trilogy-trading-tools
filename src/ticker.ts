/** Hero ticker tape — the scrolling trading-floor strip under the headline. */
import { $ } from './util';

interface TickerEntry {
  symbol: string;
  company: string;
  price: number;
  changePct: number;
}

/** Example gappers shown on the tape (marketing copy, not live data). */
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

export function initTicker(): void {
  const track = $('#tickerTrack');
  if (!track) return;
  const half = ENTRIES.map(({ symbol, company, price, changePct }) => {
    const up = changePct >= 0;
    return (
      `<span class="tk"><b>${symbol}</b><span class="px num">${price.toFixed(2)}</span>` +
      `<span class="chg num ${up ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${up ? '+' : ''}${changePct.toFixed(2)}%</span>` +
      `<span class="fl">${company.toUpperCase()}</span></span>`
    );
  }).join('');
  track.innerHTML = half + half;   // doubled so the CSS loop is seamless
}
