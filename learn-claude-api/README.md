# Learn the Claude API — 4 lessons

Personal learning scripts. Each lesson builds on the last. Plain Node `fetch`, no SDK, so you see exactly what goes over the wire.

## No API key? Use Ollama (free)

Install Ollama from https://ollama.com, run `ollama pull qwen2.5:3b`, then start with lesson 5.
Lessons 1–4 need a Claude API key.

## Setup for lessons 1–4 (once)

1. Get an API key at https://platform.claude.com (new accounts get a small free credit).
2. In the project root, create `.env.local`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
   `.env*` is already in `.gitignore`, so the key is never committed.
3. Run from the project root (Node 20.6+):
   ```
   node --env-file=.env.local learn-claude-api/01-first-call.mjs
   ```

## Lessons

| # | File | You learn |
|---|------|-----------|
| 1 | `01-first-call.mjs` | The one endpoint, headers, reading the reply, token usage |
| 2 | `02-system-and-chat.mjs` | System prompts; multi-turn chat (you resend history) |
| 3 | `03-structured-output.mjs` | Forcing JSON with a tool — the pattern behind "Describe with AI" |
| 4 | `04-streaming.mjs` | Streaming text word by word for chat UIs |
| 5 | `05-ollama-local.mjs` | **Free & local:** the same ideas with Ollama, no API key |

After lesson 3, open `src/app/api/ai-rule/route.ts` — you'll recognise every part.

## Cost

Each run costs a fraction of a rupee on Haiku. Check `usage` in lesson 1's output and the
Console's Usage page. Pricing: https://platform.claude.com/docs/en/about-claude/pricing

## Next

- Official TypeScript SDK (`npm install @anthropic-ai/sdk`) does the same thing with less code.
- Docs: https://platform.claude.com/docs/en/get-started
