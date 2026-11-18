/**
 * Trilogy Ai Chat: Cloudflare Worker backend.
 *
 * Holds the Anthropic API key so the browser never sees it, and enforces two
 * daily limits that keep the bill predictable:
 *   - PER_USER_DAILY questions per visitor (keyed by a salted hash of their IP)
 *   - GLOBAL_DAILY_CAP questions across the whole site
 * Both reset at midnight New York time.
 *
 * Routes
 *   GET  /quota  -> { left, limit, open }
 *   POST /chat   -> NDJSON stream: {"t":"text"} lines, then {"done":true,"left":n}
 *                   or {"error":"message"}
 *
 * With no ANTHROPIC_API_KEY secret set it runs in mock mode (canned replies),
 * so the page can be tested end to end for free.
 */
import Anthropic from '@anthropic-ai/sdk';
import { DurableObject } from 'cloudflare:workers';
import { SYSTEM_PROMPT } from './prompt';

export interface Env {
  LIMITER: DurableObjectNamespace<Limiter>;
  AI: Ai;
  /** "workers-ai" (free Cloudflare models) or "anthropic" (Claude, needs ANTHROPIC_API_KEY) */
  PROVIDER: string;
  WORKERS_AI_MODEL: string;
  ANTHROPIC_API_KEY?: string;
  IP_SALT?: string;
  MODEL: string;
  PER_USER_DAILY: string;
  GLOBAL_DAILY_CAP: string;
  ALLOWED_ORIGINS: string;
}

const MAX_TURNS = 12;          // messages of history sent to the model
const MAX_USER_CHARS = 1500;   // per question
const MAX_ASSISTANT_CHARS = 6000;

// ---------- rate limiter (one Durable Object instance for the whole site) ----------

type Verdict = { ok: true; left: number } | { ok: false; reason: 'user' | 'global'; left: number };

export class Limiter extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS counts (day TEXT NOT NULL, k TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, k))');
  }

  private count(day: string, k: string): number {
    const row = this.sql.exec<{ n: number }>('SELECT n FROM counts WHERE day = ? AND k = ?', day, k).toArray()[0];
    return row ? row.n : 0;
  }

  private bump(day: string, k: string, by: number): void {
    this.sql.exec(
      'INSERT INTO counts (day, k, n) VALUES (?, ?, ?) ON CONFLICT (day, k) DO UPDATE SET n = MAX(0, n + excluded.n)',
      day, k, by,
    );
  }

  peek(day: string, user: string, perUser: number, globalCap: number): { left: number; open: boolean } {
    return {
      left: Math.max(0, perUser - this.count(day, user)),
      open: this.count(day, '*') < globalCap,
    };
  }

  /** Atomic: a Durable Object handles one call at a time. */
  consume(day: string, user: string, perUser: number, globalCap: number): Verdict {
    this.sql.exec('DELETE FROM counts WHERE day < ?', day); // forget earlier days
    const used = this.count(day, user);
    if (used >= perUser) return { ok: false, reason: 'user', left: 0 };
    if (this.count(day, '*') >= globalCap) return { ok: false, reason: 'global', left: perUser - used };
    this.bump(day, user, 1);
    this.bump(day, '*', 1);
    return { ok: true, left: perUser - used - 1 };
  }

  /** Give a question back when the model call failed before answering. */
  refund(day: string, user: string): void {
    this.bump(day, user, -1);
    this.bump(day, '*', -1);
  }
}

// ---------- helpers ----------

/** Today's date in New York, e.g. "2026-11-16". Limits roll over at midnight there. */
const nyDay = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function visitorKey(req: Request, env: Env): Promise<string> {
  const ip = req.headers.get('cf-connecting-ip') ?? 'local';
  const data = new TextEncoder().encode(`${env.IP_SALT ?? 'trilogy-ai-chat'}|${ip}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...hash.slice(0, 12)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] ?? '',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function originAllowed(req: Request, env: Env): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  return corsHeaders(req, env)['Access-Control-Allow-Origin'] === origin;
}

const json = (body: unknown, status: number, headers: Record<string, string>): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json' } });

type Turn = { role: 'user' | 'assistant'; content: string };

/** Validate the browser-supplied history; return null if it is malformed. */
function cleanHistory(raw: unknown): Turn[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 40) return null;
  const turns: Turn[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') return null;
    const { role, content } = m as Record<string, unknown>;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null;
    const text = content.trim();
    if (!text) return null;
    if (role === 'user' && text.length > MAX_USER_CHARS) return null;
    turns.push({ role, content: text.slice(0, MAX_ASSISTANT_CHARS) });
  }
  // roles must alternate, starting and ending with the user
  for (let i = 0; i < turns.length; i++) if (turns[i].role !== (i % 2 === 0 ? 'user' : 'assistant')) return null;
  if (turns[turns.length - 1].role !== 'user') return null;
  let recent = turns.slice(-MAX_TURNS);
  if (recent[0].role !== 'user') recent = recent.slice(1);
  return recent;
}

const REFUSAL_TEXT = "I can't help with that one. Try asking about a setup, a trading term, or how to size a position.";

const MOCK_REPLY = `**Mock mode:** the backend has no API key yet, so this is a canned reply.

Once the key is added, real answers appear here. For example, position size works like this:

1. Decide the dollars you'll risk, say **$50**.
2. Measure entry minus stop: $3.20 - $3.05 = **$0.15**.
3. Divide: $50 / $0.15 = **333 shares**.

Education only, not investment advice.`;

// ---------- Cloudflare Workers AI (free daily allowance) ----------

/**
 * Stream a reply from Workers AI. The binding returns server-sent events; each
 * `data:` line is JSON. Older models put the text in `response`, OpenAI-style
 * ones in `choices[0].delta.content`, so both are read. Throws if the model
 * errors before streaming (e.g. the free daily allowance is used up).
 */
async function streamWorkersAi(env: Env, history: Turn[], write: (t: string) => Promise<void>): Promise<void> {
  const result = await env.AI.run(env.WORKERS_AI_MODEL as Parameters<Ai['run']>[0], {
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
    max_tokens: 1200,
    stream: true,
  } as never) as unknown;
  if (!(result instanceof ReadableStream)) {
    const r = result as { response?: string; choices?: { message?: { content?: string } }[] };
    await write(r.response ?? r.choices?.[0]?.message?.content ?? '');
    return;
  }
  const reader = (result as ReadableStream<Uint8Array>).pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  let wrote = false;
  const sample: string[] = []; // first raw lines, logged if nothing usable came back
  let thinking = false; // hide <think>...</think> if a reasoning model emits it
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (line && sample.length < 5) sample.push(line.slice(0, 300));
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let chunk: { response?: unknown; choices?: { delta?: { content?: unknown } }[] };
      try { chunk = JSON.parse(data); } catch { continue; }
      let text = typeof chunk.response === 'string' ? chunk.response
        : typeof chunk.choices?.[0]?.delta?.content === 'string' ? chunk.choices[0].delta.content as string : '';
      if (text.includes('<think>')) { thinking = true; text = text.split('<think>')[0]; }
      if (thinking) {
        if (!text.includes('</think>')) continue;
        thinking = false; text = text.split('</think>').pop() ?? '';
      }
      if (text) { await write(text); wrote = true; }
    }
  }
  if (!wrote) {
    console.error('workers-ai returned no text', JSON.stringify(sample), buf.slice(0, 300));
    throw new Error('empty reply'); // caller refunds the question and tells the visitor to retry
  }
}

// ---------- request handling ----------

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const cors = corsHeaders(req, env);
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const perUser = Number(env.PER_USER_DAILY) || 20;
    const globalCap = Number(env.GLOBAL_DAILY_CAP) || 1000;
    const limiter = env.LIMITER.get(env.LIMITER.idFromName('site'));
    const day = nyDay();

    if (url.pathname === '/quota' && req.method === 'GET') {
      const user = await visitorKey(req, env);
      const { left, open } = await limiter.peek(day, user, perUser, globalCap);
      return json({ left, limit: perUser, open }, 200, { ...cors, 'cache-control': 'no-store' });
    }

    if (url.pathname !== '/chat' || req.method !== 'POST') return json({ error: 'Not found' }, 404, cors);
    if (!originAllowed(req, env)) return json({ error: 'Origin not allowed' }, 403, cors);

    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400, cors); }
    const history = cleanHistory((body as { messages?: unknown })?.messages);
    if (!history) return json({ error: "That question couldn't be sent. Keep it under 1,500 characters and try again." }, 400, cors);

    const user = await visitorKey(req, env);
    const verdict = await limiter.consume(day, user, perUser, globalCap);
    if (!verdict.ok) {
      const error = verdict.reason === 'user'
        ? `You've used all ${perUser} questions for today. They reset at midnight New York time.`
        : 'Trilogy Ai Chat is at capacity for today. Please come back tomorrow.';
      return json({ error, left: verdict.left }, 429, cors);
    }

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    const send = (obj: unknown) => writer.write(enc.encode(JSON.stringify(obj) + '\n'));

    ctx.waitUntil((async () => {
      let wroteText = false;
      try {
        const write = async (t: string) => { if (t) { await send({ t }); wroteText = true; } };
        if (env.PROVIDER === 'workers-ai') {
          await streamWorkersAi(env, history, write);
        } else if (!env.ANTHROPIC_API_KEY) {
          for (const word of MOCK_REPLY.split(/(?<=\s)/)) {
            await write(word);
            await new Promise(r => setTimeout(r, 15));
          }
        } else {
          const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1 });
          const stream = client.messages.stream({
            model: env.MODEL,
            max_tokens: 4000,
            output_config: { effort: 'low' },
            system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
            messages: history,
          });
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              await send({ t: event.delta.text });
              wroteText = true;
            }
          }
          const final = await stream.finalMessage();
          if (final.stop_reason === 'refusal' && !wroteText) {
            await send({ t: REFUSAL_TEXT });
            wroteText = true;
          }
        }
        await send({ done: true, left: verdict.left });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('chat failed', message);
        if (!wroteText) await limiter.refund(day, user);
        // Workers AI refuses once the free daily neuron allowance is used up (it resets 00:00 UTC)
        const outOfFreeAi = env.PROVIDER === 'workers-ai' && /neuron|allocation|quota|limit|4006|429/i.test(message);
        await send({
          error: outOfFreeAi
            ? "Trilogy Ai Chat has used today's free AI capacity. It refills at 7 pm New York time. That question was not counted."
            : 'Something went wrong on our side. That question was not counted. Please try again.',
          left: wroteText ? verdict.left : verdict.left + 1,
        });
      } finally {
        await writer.close();
      }
    })());

    return new Response(readable, {
      headers: { ...cors, 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
    });
  },
} satisfies ExportedHandler<Env>;
