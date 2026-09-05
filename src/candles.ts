/**
 * Candlestick typography — the section ghost words (SCANNER, JOURNAL, ...) built
 * from hundreds of tiny live candles that flicker and occasionally flip color.
 * Also drives the 3D fly-in + heartbeat on the parent .sec-head every time the
 * section re-enters the viewport.
 */
import { $$, cssVar, reduced } from './util';

interface Cell {
  x: number; y: number;
  up: boolean;          // green (gain) or red (loss)
  ph: number;           // flicker phase offset
  hb: number;           // base candle height
  delay: number;        // stagger for the left-to-right print-in
}

export function initCandleWords(): void {
  const canvases = $$<HTMLCanvasElement>('.ghost-cv');
  if (!canvases.length) return;

  const GAIN = cssVar('--gain', '#0eae74');
  const LOSS = cssVar('--loss', '#e0455e');

  function setup(cv: HTMLCanvasElement): void {
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const DPR = devicePixelRatio;
    let W = 0, H = 0, step = 8;
    let cells: Cell[] = [];
    let born = performance.now();
    let raf = 0;
    let running = false;

    /** Rasterize the word offscreen, then sample it into a grid of candles. */
    function build(): void {
      const r = cv.getBoundingClientRect();
      W = cv.width = Math.max(2, Math.round(r.width * DPR));
      H = cv.height = Math.max(2, Math.round(r.height * DPR));
      const off = document.createElement('canvas');
      off.width = W; off.height = H;
      const o = off.getContext('2d')!;
      o.fillStyle = '#000';
      o.font = `800 ${Math.round(H * 0.72)}px "Bricolage Grotesque",sans-serif`;
      o.textAlign = 'center';
      o.textBaseline = 'middle';
      o.fillText(cv.dataset.word ?? '', W / 2, H * 0.46);
      const px = o.getImageData(0, 0, W, H).data;
      cells = [];
      step = Math.max(7 * DPR, W / 120);
      for (let x = step / 2; x < W; x += step) {
        for (let y = step / 2; y < H; y += step) {
          if (px[((y | 0) * W + (x | 0)) * 4 + 3] > 110) {
            cells.push({
              x, y,
              up: Math.random() > 0.42,
              ph: Math.random() * 6.28,
              hb: step * (0.55 + Math.random() * 0.75),
              delay: (x / W) * 900 + Math.random() * 250,
            });
          }
        }
      }
      born = performance.now();
    }

    function draw(now: number): void {
      const t = now - born;
      ctx!.clearRect(0, 0, W, H);
      const bodyWidth = step * 0.52;
      for (const c of cells) {
        const appear = Math.min(1, (t - c.delay) / 350);
        if (appear <= 0) continue;
        const flicker = Math.sin(now / 640 + c.ph);
        const h = c.hb * (0.85 + 0.3 * flicker);
        if (Math.random() < 0.0015) c.up = !c.up;   // a print flips the candle
        ctx!.globalAlpha = appear * (0.4 + 0.28 * flicker * flicker);
        ctx!.fillStyle = c.up ? GAIN : LOSS;
        ctx!.fillRect(c.x - DPR * 0.7, c.y - h * 0.85, DPR * 1.4, h * 1.7);  // wick
        ctx!.fillRect(c.x - bodyWidth / 2, c.y - h / 2, bodyWidth, h);       // body
      }
      ctx!.globalAlpha = 1;
      if (running && !reduced) raf = requestAnimationFrame(draw);
    }

    const head = cv.closest('.sec-head') as HTMLElement | null;

    function start(): void {
      if (running) return;
      running = true;
      born = performance.now();
      if (head) {   // retrigger the 3D fly-in + heartbeat on every re-entry
        head.classList.remove('fly');
        void head.offsetWidth;
        head.classList.add('fly');
      }
      raf = requestAnimationFrame(draw);
    }

    function stop(): void {
      running = false;
      cancelAnimationFrame(raf);
      head?.classList.remove('fly');
    }

    build();
    if (reduced) {
      born = -1e6;                    // fully assembled static frame
      draw(performance.now());
    } else {
      const io = new IntersectionObserver(
        entries => entries.forEach(e => (e.isIntersecting ? start() : stop())),
        { threshold: 0.05 },
      );
      io.observe(cv);
    }
    addEventListener('resize', () => {
      stop();
      build();
      if (reduced) { born = -1e6; draw(performance.now()); }
      else start();
    });
  }

  // Wait for the display font so the sampled glyphs are the real ones.
  const go = (): void => canvases.forEach(setup);
  (document.fonts?.ready ?? Promise.resolve()).then(go).catch(go);
}
