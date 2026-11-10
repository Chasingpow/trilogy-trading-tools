/**
 * Launch-list form.
 *
 * - Every "Join the launch list" / "Get notified" button carries data-plan; clicking one
 *   records the plan in the form and moves focus to the email field.
 * - On submit: if the form has a data-endpoint, the email + plan are POSTed there
 *   (works with Formspree, a Supabase edge function, or any endpoint that accepts form data).
 *   With no endpoint configured, it falls back to opening a prefilled email to data-fallback.
 */
import { $, $$ } from './util';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function initWaitlist(): void {
  const form = $('#waitlistForm') as HTMLFormElement | null;
  const email = $('#wlEmail') as HTMLInputElement | null;
  const plan = $('#wlPlan') as HTMLInputElement | null;
  const planNote = $('#wlPlanNote');
  const msg = $('#wlMsg');
  if (!form || !email || !plan || !msg) return;

  const say = (text: string, isError = false): void => {
    msg.textContent = text;
    msg.classList.toggle('err', isError);
  };

  $$<HTMLAnchorElement>('a[data-plan]').forEach(btn => btn.addEventListener('click', () => {
    plan.value = btn.dataset.plan ?? '';
    if (planNote) {
      planNote.textContent = plan.value ? `You picked: ${plan.value}` : '';
      planNote.hidden = !plan.value;
    }
    // let the anchor scroll first, then focus without a second jump
    setTimeout(() => email.focus({ preventScroll: true }), 450);
  }));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const address = email.value.trim();
    if (!EMAIL_RE.test(address)) { say('Enter a valid email address.', true); email.focus(); return; }

    const endpoint = form.dataset.endpoint?.trim();
    if (!endpoint) {
      const to = form.dataset.fallback ?? '';
      const subject = encodeURIComponent('Launch list');
      const body = encodeURIComponent(`Add me to the launch list.\nEmail: ${address}\nTool: ${plan.value || 'Not sure yet'}`);
      location.href = `mailto:${to}?subject=${subject}&body=${body}`;
      say('Opening your email app — hit send and you are on the list.');
      return;
    }

    const button = form.querySelector('button[type=submit]') as HTMLButtonElement | null;
    if (button) button.disabled = true;
    say('Adding you…');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      if (planNote) planNote.hidden = true;
      say("You're on the list. We'll email you the day it opens.");
    } catch {
      say('That did not go through. Try again, or email info@trilogytradingtools.com.', true);
    } finally {
      if (button) button.disabled = false;
    }
  });
}
