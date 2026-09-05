/** Shared helpers used across every page module. */

/** True when the visitor asked the OS for reduced motion — every animation must respect this. */
export const reduced: boolean = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Shorthand for document.querySelector with a typed result. */
export function $<T extends Element = HTMLElement>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

/** Shorthand for document.querySelectorAll, returned as a real array. */
export function $$<T extends Element = HTMLElement>(selector: string): T[] {
  return [...document.querySelectorAll<T>(selector)];
}

/** Read a CSS custom property off :root, with a fallback when it is unset. */
export function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
