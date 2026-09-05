/** Cosmos — fixed full-page canvas behind everything: twinkling stars, meteors, lightning. */
import { reduced } from './util';

interface Star { x: number; y: number; r: number; ph: number; sp: number; }
interface Meteor { x: number; y: number; vx: number; vy: number; life: number; }
type Point = [number, number];
interface Bolt { pts: Point[]; br: Point[]; }

export function initCosmos(): void {
  const cv = document.createElement('canvas');
  cv.id = 'cosmos';
  document.body.prepend(cv);
  const ctx = cv.getContext('2d');
  if (!ctx) return;

  const DPR = devicePixelRatio;
  let W = 0, H = 0;
  let stars: Star[] = [];
  let meteors: Meteor[] = [];
  let bolt: Bolt | null = null;
  let boltT = 0;
  let nextMeteor = performance.now() + 2200;
  let nextBolt = performance.now() + 5000;

  function size(): void {
    W = cv.width = innerWidth * DPR;
    H = cv.height = innerHeight * DPR;
    stars = [];
    const count = Math.min(320, Math.round((W * H) / (11000 * DPR * DPR)));
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * W, y: Math.random() * H,
        r: (Math.random() * 1.1 + 0.3) * DPR,
        ph: Math.random() * 6.28, sp: 0.4 + Math.random(),
      });
    }
  }
  size();
  addEventListener('resize', size);

  function spawnMeteor(): void {
    meteors.push({
      x: Math.random() * W * 0.85, y: Math.random() * H * 0.35,
      vx: (6 + Math.random() * 7) * DPR, vy: (2.5 + Math.random() * 3) * DPR,
      life: 1,
    });
  }

  function spawnBolt(): void {
    const pts: Point[] = [];
    let x = W * (0.12 + Math.random() * 0.76);
    let y = -10 * DPR;
    pts.push([x, y]);
    while (y < H * (0.5 + Math.random() * 0.3)) {
      x += (Math.random() - 0.5) * 90 * DPR;
      y += (26 + Math.random() * 48) * DPR;
      pts.push([x, y]);
    }
    // one short branch forking off a random segment
    const forkAt = 1 + Math.floor(Math.random() * (pts.length - 2));
    const br: Point[] = [[...pts[forkAt]]];
    let bx = pts[forkAt][0], by = pts[forkAt][1];
    for (let i = 0; i < 3; i++) {
      bx += (Math.random() - 0.2) * 70 * DPR;
      by += (20 + Math.random() * 30) * DPR;
      br.push([bx, by]);
    }
    bolt = { pts, br };
    boltT = 1;
  }

  function poly(points: Point[]): void {
    ctx!.beginPath();
    points.forEach((p, i) => (i ? ctx!.lineTo(p[0], p[1]) : ctx!.moveTo(p[0], p[1])));
    ctx!.stroke();
  }

  function draw(now: number): void {
    ctx!.clearRect(0, 0, W, H);

    for (const s of stars) {
      const twinkle = 0.35 + 0.65 * Math.abs(Math.sin((now / 1100) * s.sp + s.ph));
      ctx!.globalAlpha = twinkle * 0.85;
      ctx!.fillStyle = '#cdd6ff';
      ctx!.beginPath();
      ctx!.arc(s.x, s.y, s.r, 0, 6.283);
      ctx!.fill();
    }

    if (now > nextMeteor) { spawnMeteor(); nextMeteor = now + 2600 + Math.random() * 5000; }
    meteors = meteors.filter(m => m.life > 0);
    for (const m of meteors) {
      m.x += m.vx; m.y += m.vy; m.life -= 0.014;
      const g = ctx!.createLinearGradient(m.x, m.y, m.x - m.vx * 13, m.y - m.vy * 13);
      g.addColorStop(0, `rgba(214,225,255,${0.95 * m.life})`);
      g.addColorStop(1, 'rgba(214,225,255,0)');
      ctx!.globalAlpha = 1;
      ctx!.strokeStyle = g;
      ctx!.lineWidth = 1.8 * DPR;
      ctx!.lineCap = 'round';
      ctx!.beginPath();
      ctx!.moveTo(m.x, m.y);
      ctx!.lineTo(m.x - m.vx * 13, m.y - m.vy * 13);
      ctx!.stroke();
    }

    if (now > nextBolt) { spawnBolt(); nextBolt = now + 7000 + Math.random() * 9000; }
    if (bolt) {
      boltT -= 0.05;
      if (boltT <= 0) bolt = null;
      else {
        ctx!.globalAlpha = boltT * (boltT > 0.72 ? 1 : 0.55);
        ctx!.strokeStyle = '#aebcff';
        ctx!.lineCap = 'round';
        ctx!.shadowColor = '#7c7cff';
        ctx!.shadowBlur = 24 * DPR;
        ctx!.lineWidth = 2.4 * DPR;
        poly(bolt.pts);
        ctx!.lineWidth = 1.3 * DPR;
        poly(bolt.br);
        ctx!.shadowBlur = 0;
        if (boltT > 0.85) {   // brief sky flash right after the strike
          ctx!.globalAlpha = 0.06;
          ctx!.fillStyle = '#7c7cff';
          ctx!.fillRect(0, 0, W, H);
        }
      }
    }

    ctx!.globalAlpha = 1;
    if (!reduced) requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);   // reduced motion: a single static starfield frame
}
