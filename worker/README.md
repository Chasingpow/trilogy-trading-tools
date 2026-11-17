# Trilogy Ai Chat backend

A Cloudflare Worker that powers the chat page at `/ai-chat/` on trilogytradingtools.com.

- It holds the Anthropic API key, so the key never reaches the browser.
- Model: Claude Haiku 5.5, at about $0.0006 per question.
- Limits (in `wrangler.toml`): 10 questions per visitor per day and 1,000 for the whole site per day. Both reset at midnight New York time.
- Visitors are counted by a salted hash of their IP address. Raw IPs are never stored, and the counts for earlier days are deleted.
- Hosting fits in Cloudflare's free Workers plan. The daily counter uses a Durable Object, which is also free on that plan.

## Run locally (free, no key needed)

```bash
cd worker
npm install
npx wrangler dev --port 8787
```

With no API key, the backend runs in mock mode and returns a canned reply. Open the built site through any local server, for example `python -m http.server 5510` in the repo root. Then visit `http://localhost:5510/ai-chat/?api=http://127.0.0.1:8787`. The `?api=` override only works on localhost.

## Deploy (one time)

1. Create an Anthropic API key at console.anthropic.com. Under **Limits**, set a monthly spend limit, for example $25. That is your hard ceiling.
2. Log in to Cloudflare. A free account is enough.
   ```bash
   cd worker
   npx wrangler login
   ```
3. Add the secrets. Each command prompts you to paste the value, so the value never lands in a file.
   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put IP_SALT
   ```
   For `IP_SALT`, type any long random string.
4. Deploy:
   ```bash
   npx wrangler deploy
   ```
   It prints a URL like `https://trilogy-ai-chat.<your-subdomain>.workers.dev`.
5. Paste that URL into `AI_CHAT_ENDPOINT` in `scripts/build.mjs`. Then run `npm run build` in the repo root and commit the rebuilt pages. Until this step, the page shows "launching soon".

## Change settings later

- **Limits or model:** edit `[vars]` in `wrangler.toml`, then run `npx wrangler deploy` again.
- **What the assistant knows or says:** edit `src/prompt.ts`. Its prices mirror `plans[]` in `scripts/build.mjs`, so update them together.
- **Logs:** the Cloudflare dashboard, under Workers > trilogy-ai-chat > Logs.
