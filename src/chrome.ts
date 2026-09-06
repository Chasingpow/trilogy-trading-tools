/** Page chrome: scroll progress bar, card cursor spotlight, reveal-on-scroll, legal dialogs. */
import { $, $$, reduced } from './util';

/** Thin gradient bar at the very top that tracks scroll position. */
export function initProgressBar(): void {
  const bar = $('#progress');
  if (!bar) return;
  addEventListener('scroll', () => {
    const doc = document.documentElement;
    bar.style.width = (scrollY / (doc.scrollHeight - innerHeight)) * 100 + '%';
  }, { passive: true });
}

/** Radial highlight that follows the cursor across pricing/bundle/workshop cards. */
export function initCardSpotlight(): void {
  document.addEventListener('pointermove', (e: PointerEvent) => {
    const target = e.target as Element | null;
    const card = target?.closest?.('.plan,.bundle,.soon-card') as HTMLElement | null;
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', e.clientX - r.left + 'px');
    card.style.setProperty('--my', e.clientY - r.top + 'px');
  }, { passive: true });
}

/**
 * Rise-in reveal as blocks scroll into view.
 * The base state stays visible, so the page still reads if JS never runs.
 */
export function initRevealOnScroll(): void {
  if (reduced || !('IntersectionObserver' in window)) return;
  const rio = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('rv-in');
      rio.unobserve(entry.target);
    }
  }), { threshold: 0.15 });
  $$('.sec-head,.p-copy,.stage,.plan,.bundle,.soon-card').forEach((el, i) => {
    el.style.animationDelay = (i % 4) * 0.08 + 's';
    if (el.getBoundingClientRect().top > innerHeight) rio.observe(el);
  });
}

/** Hamburger menu on small screens: toggle, close on link tap or Escape. */
export function initMobileNav(): void {
  const burger = $('#navBurger') as HTMLButtonElement | null;
  const links = $('#navLinks');
  if (!burger || !links) return;
  const setOpen = (open: boolean): void => {
    links.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  burger.addEventListener('click', () => setOpen(!links.classList.contains('open')));
  links.addEventListener('click', e => {
    if ((e.target as Element).closest('a')) setOpen(false);   // navigating closes the menu
  });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && links.classList.contains('open')) { setOpen(false); burger.focus(); }
  });
}

/** Privacy / Terms <dialog> open + close wiring. */
export function initLegalDialogs(): void {
  $$('[data-dlg]').forEach(btn => btn.addEventListener('click', () => {
    const dlg = document.getElementById(btn.dataset.dlg ?? '') as HTMLDialogElement | null;
    dlg?.showModal();
  }));
  $$('dialog.legal [data-close]').forEach(btn => btn.addEventListener('click', () => {
    (btn.closest('dialog') as HTMLDialogElement | null)?.close();
  }));
  $$<HTMLDialogElement>('dialog.legal').forEach(dlg => dlg.addEventListener('click', e => {
    if (e.target === dlg) dlg.close();   // click on the backdrop closes
  }));
}
