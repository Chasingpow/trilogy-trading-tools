/**
 * Trilogy Ai Chat page (/ai-chat/).
 *
 * Talks to the Cloudflare Worker in worker/. The worker URL comes from the
 * page's data-endpoint (set in scripts/build.mjs). With no endpoint set, the
 * page shows a "coming soon" state instead of a broken box.
 *
 * The conversation lives only in this tab: nothing is stored.
 */
import { $, $$ } from './util';

type Turn = { role: 'user' | 'assistant'; content: string };

const esc = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Tiny, safe Markdown: escape first, then **bold**, *italic*, `code`, lists, paragraphs. */
export function renderMarkdown(src: string): string {
  const inline = (t: string): string =>
    esc(t)
      .replace(/\[([^\]]+)\]\((?:https?:\/\/|www\.)[^)\s]*\)/g, '$1') // [text](url) -> text: no model-chosen links
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const kind = ul ? 'ul' : 'ol';
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
    } else if (!line.trim()) {
      flushPara(); closeList();
    } else {
      closeList();
      para.push(line.replace(/^#{1,6}\s+/, ''));
    }
  }
  flushPara(); closeList();
  return out.join('');
}

export function initAiChat(): void {
  const root = $('#aiChat');
  if (!root) return;
  const form = $('#aicForm') as HTMLFormElement;
  const input = $('#aicInput') as HTMLTextAreaElement;
  const send = $('#aicSend') as HTMLButtonElement;
  const log = $('#aicLog')!;
  const hello = $('#aicHello')!;
  const leftEl = $('#aicLeft')!;
  const chip = $('#aicQuota')!;
  const scroller = $('#aicScroll')!;

  // local testing: ?api=http://localhost:8787 works only on localhost
  const override = new URLSearchParams(location.search).get('api');
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const configured = root.dataset.endpoint ?? '';
  const endpoint = (isLocal && override ? override : configured.startsWith('https://') ? configured : '').replace(/\/$/, '');

  const history: Turn[] = [];
  let limit = 20;
  let busy = false;

  const setLeft = (left: number) => {
    leftEl.textContent = `${left} of ${limit}`;
    chip.classList.toggle('out', left <= 0);
  };

  const scrollDown = () => { scroller.scrollTop = scroller.scrollHeight; };

  const bubble = (role: 'user' | 'assistant' | 'error', html: string): HTMLElement => {
    const el = document.createElement('div');
    el.className = `aic-msg ${role}`;
    el.innerHTML = html;
    log.appendChild(el);
    hello.classList.add('asked');
    scrollDown();
    return el;
  };

  const lock = (on: boolean) => {
    busy = on;
    send.disabled = on || !endpoint;
    root.classList.toggle('busy', on);
  };

  const fit = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; };
  input.addEventListener('input', fit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });

  if (!endpoint) {
    input.disabled = true;
    send.disabled = true;
    input.placeholder = 'Trilogy Ai Chat is launching soon.';
    chip.classList.add('out');
    leftEl.textContent = 'Launching soon';
    chip.lastChild!.textContent = '';
    return;
  }

  fetch(`${endpoint}/quota`).then(r => r.json()).then((q: { left: number; limit: number; open: boolean }) => {
    limit = q.limit;
    setLeft(q.left);
    if (!q.open) bubble('error', 'Trilogy Ai Chat is at capacity for today. Please come back tomorrow.');
  }).catch(() => { /* the chip keeps its default; errors surface when they ask */ });

  async function ask(question: string): Promise<void> {
    if (busy) return;
    question = question.trim();
    if (!question) return;
    lock(true);
    bubble('user', esc(question).replace(/\n/g, '<br>'));
    history.push({ role: 'user', content: question });
    const answerEl = bubble('assistant', '<span class="aic-typing"><i></i><i></i><i></i></span>');
    let answer = '';
    let failed = '';

    try {
      const res = await fetch(`${endpoint}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({})) as { error?: string; left?: number };
        if (typeof err.left === 'number') setLeft(err.left);
        throw new Error(err.error || 'Something went wrong. Please try again.');
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const msg = JSON.parse(line) as { t?: string; done?: boolean; left?: number; error?: string };
          if (msg.t) { answer += msg.t; answerEl.innerHTML = renderMarkdown(answer); scrollDown(); }
          if (typeof msg.left === 'number') setLeft(msg.left);
          if (msg.error) failed = msg.error;
        }
      }
      if (failed && !answer) throw new Error(failed);
      if (!answer) throw new Error('No answer came back. Please try again.');
      history.push({ role: 'assistant', content: answer });
    } catch (e) {
      answerEl.remove();
      history.pop(); // drop the unanswered question so roles keep alternating
      bubble('error', esc(e instanceof Error ? e.message : String(e)));
      input.value = input.value || question;
      fit();
    } finally {
      lock(false);
      input.focus();
    }
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const q = input.value;
    input.value = '';
    fit();
    void ask(q);
  });
  $$<HTMLButtonElement>('#aicSugg button').forEach(b => b.addEventListener('click', () => void ask(b.textContent ?? '')));
  lock(false);
}
