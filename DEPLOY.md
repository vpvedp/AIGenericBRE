# Deploying AIGenericBRE to Vercel

About 10 minutes. You need: the code pushed to `github.com/vpvedp/AIGenericBRE`, and a free Vercel account.

## 1. Create your secrets (on your laptop)

```bash
node scripts/create-secret.mjs                       # → SESSION_SECRET
node scripts/create-user.mjs EMP001 "a-strong-password"   # → APP_USERS line
```

Several users: run `create-user.mjs` once per person and join the lines with `;`.

## 2. Import the project

1. Go to **vercel.com → Add New → Project** and sign in with GitHub (as **vpvedp**).
2. Pick **AIGenericBRE** → **Import**. Framework is detected as **Next.js**; keep the defaults.
3. Branch: set **Production Branch** to `ai_genric_bi` (Settings → Git) if `main` isn't your working branch.

## 3. Environment variables (Settings → Environment Variables)

| Name | Value | Required |
|------|-------|----------|
| `SESSION_SECRET` | output of `create-secret.mjs` | yes — without it nobody can sign in |
| `APP_USERS` | output of `create-user.mjs` | yes — without it nobody can sign in |
| `GROQ_API_KEY` | your Groq key (`gsk_...`) | yes, for "Describe with AI" |
| `AI_MODEL` | `openai/gpt-oss-120b` | optional (this is the default) |
| `AI_RATE_PER_MIN` | `10` | optional — AI requests per user per minute |
| `AI_DAILY_LIMIT` | `300` | optional — AI requests per day for the whole app |

Then **Deployments → Redeploy** so the variables take effect.

## 4. Check it

- Open your `https://<project>.vercel.app` link → you should land on **/login**.
- Sign in with the ID/password from step 1 → Rule Builder → **Describe with AI**.
- Logs: Vercel → your project → **Logs**. Look for `[auth] sign-in` and `[ai-rule] user=... outcome=ok`.

## Good to know

- **Never** put keys in code or commit `.env.local` (`.gitignore` already blocks `.env*`).
- **Rules are still saved in each browser** (localStorage), not on the server. Moving them to Postgres is the next step.
- **Rate limits live in server memory.** On Vercel each instance counts separately and resets on restart. Fine for a portfolio demo; for real traffic use a shared store such as Upstash Redis (`src/lib/rate-limit.ts` keeps the same function).
- `/api/decision` (the engine's demo API) is public on purpose — it uses no AI key. Everything else needs sign-in.
- Demo Mode on the login page only works locally (no `APP_USERS`). On Vercel, users sign in with a real password.
