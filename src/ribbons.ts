/** Hero ribbons — three flowing gradient ribbons behind the headline, one per tool. */
import { $, cssVar, reduced } from './util';

const FALLBACK_COLORS = ['#5b5bf0', '#8b5cf6', '#12b5d6'] as const;

export function initHeroRibbons(): void {
  const cv = $<HTMLCanvasElement>('#ribbons');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;

  const colors = ['--brand', '--brand-2', '--brand-3']
    .map((v, i) => cssVar(v, FALLBACK_COLORS[i]));

  let w = 0, h = 0;
  const t0 = performance.now();

  function size(): void {
    const r = cv!.parentElement!.getBoundingClientRect();
    w = cv!.width = r.width * devicePixelRatio;
    h = cv!.height = r.height * devicePixelRatio;
  }
  size();
  addEventListener('resize', size);

  function draw(now: number): void {
    const t = (now - t0) / 1000;
    ctx!.clearRect(0, 0, w, h);
    ctx!.globalCompositeOperation = 'lighter';
    colors.forEach((color, k) => {
      const yBase = h * (0.28 + k * 0.22);
      const amp = h * 0.09;
      const speed = 0.35 + k * 0.12;
      ctx!.beginPath();
      for (let x = 0; x <= w; x += w / 70) {
        const y = yBase
          + Math.sin((x / w) * 4.2 + t * speed + k * 2.1) * amp
          + Math.sin((x / w) * 9.5 - t * speed * 0.7 + k) * amp * 0.35;
        x === 0 ? ctx!.moveTo(x, y) : ctx!.lineTo(x, y);
      }
      // soft wide glow pass, then a crisp core line
      ctx!.strokeStyle = color;
      ctx!.globalAlpha = 0.17;
      ctx!.lineWidth = 34 * devicePixelRatio;
      ctx!.lineCap = 'round';
      ctx!.filter = `blur(${18 * devicePixelRatio}px)`;
      ctx!.stroke();
      ctx!.filter = 'none';
      ctx!.globalAlpha = 0.5;
      ctx!.lineWidth = 2 * devicePixelRatio;
      ctx!.stroke();
    });
    ctx!.globalAlpha = 1;
    ctx!.globalCompositeOperation = 'source-over';
    if (!reduced) requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);   // reduced motion still paints one static frame
}
