/**
 * Product demo stages — keeps each section's 3-step "how it works" rail cycling
 * while its footage loops, and pauses everything offscreen.
 */
import { $$, reduced } from './util';

type DemoKey = 'scanner' | 'journal' | 'wealth';
const STEP_INTERVAL_MS = 4500;

export function initStages(): void {
  // step rails, keyed by their data-demo attribute
  const rails = new Map<DemoKey, HTMLElement>();
  $$('.steps').forEach(rail => {
    const key = rail.dataset.demo as DemoKey | undefined;
    if (key) rails.set(key, rail);
  });

  function setStep(demo: DemoKey, index: number): void {
    const rail = rails.get(demo);
    if (!rail) return;
    [...rail.children].forEach((step, j) => step.classList.toggle('on', j === index));
  }

  const timers = new Map<DemoKey, number>();

  function startLoop(key: DemoKey): void {
    let i = 0;
    setStep(key, 0);
    timers.set(key, window.setInterval(() => {
      i = (i + 1) % 3;
      setStep(key, i);
    }, STEP_INTERVAL_MS));
  }

  function stopLoop(key: DemoKey): void {
    const t = timers.get(key);
    if (t !== undefined) { clearInterval(t); timers.delete(key); }
  }

  if (reduced) {
    // static resting frame: pause the footage, light every step
    $$<HTMLVideoElement>('.stage-video video').forEach(v => {
      v.removeAttribute('autoplay');
      v.setAttribute('controls', '');
    });
    rails.forEach(rail => [...rail.children].forEach(s => s.classList.add('on')));
    return;
  }

  const running = new Set<DemoKey>();
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const section = entry.target.closest('section');
      if (!section) return;
      const key = (['scanner', 'journal', 'wealth'] as DemoKey[])
        .find(k => k === section.id);
      if (!key) return;
      if (entry.isIntersecting && !running.has(key)) { running.add(key); startLoop(key); }
      else if (!entry.isIntersecting && running.has(key)) { running.delete(key); stopLoop(key); }
    });
  }, { threshold: 0.25 });
  $$('.stage').forEach(stage => io.observe(stage));
}
