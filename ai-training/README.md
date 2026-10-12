# Teaching the local AI your rule language

Ollama **runs** models; it doesn't train them. The models already know English.
What they don't know is *your* rule format and *your* field names. So we teach
them in three practical steps, from cheapest to most expensive.

| Step | What | Cost | Status |
|------|------|------|--------|
| 1. Dataset | 117 English sentences, each with the correct rule JSON | free | ✅ done |
| 2. Few-shot | Show the model ~6 solved examples inside every prompt | free, instant | ✅ wired into the app |
| 3. Measure | Score the model on 25 test sentences it has never seen | free | ✅ `evaluate.mjs` |
| 4. Fine-tune | Actually change the model's weights using the dataset | needs a GPU | 🔜 later (`finetune-chat.jsonl` is ready) |

## Files

| File | What it is |
|------|------------|
| `fields.json` | Your Field Catalog per industry (from `src/lib/fields.ts`) |
| `generate-dataset.py` | Builds the dataset from the real fields. Answers are correct by construction |
| `rules-dataset.jsonl` | All 117 examples |
| `train.jsonl` / `test.jsonl` | 92 / 25 split, stratified so every category is in the test |
| `finetune-chat.jsonl` | Train split in chat format (system/user/assistant) for future fine-tuning |
| `evaluate.mjs` | Sends every test sentence to your app and scores the answers |
| `scenario-tests.ts` | 13 complex rules run through the real engine with test applicants — no AI needed |
| `export-fields.ts` | Refreshes `fields.json` after you change the Field Catalog |
| `../src/lib/ai-rule-examples.ts` | Auto-generated few-shot examples the app uses |

## What the dataset covers (15 categories)

`numeric` (below / under / at least / exceeds…), `indian-amount` (5 lakh, 1 crore, 50k, ₹1,00,000),
`enum`, `enum-in` (X or Y), `boolean` (is a smoker / KYC not verified), `between`,
`two-and`, `two-or`, `mixed` (enum + number), `else` (…otherwise reject),
`grouped` (A, or B and C), `nested` (brackets inside brackets), `tiered` (rate 8.5% / 9.5% / 11% by score — Bracket Lookup),
`tricky-wording` (neither…nor, unless),
`unmappable` (fields that don't exist — the model must refuse, not invent).

## Check the engine side (no AI, instant)

```bash
npx tsx ai-training/scenario-tests.ts   # expect 13/13
```

## How to use it

```bash
# 1. Make sure Ollama is running and the model is pulled
ollama pull qwen2.5:3b

# 2. Start your app
npm run dev

# 3. In a second terminal, score the model
node ai-training/evaluate.mjs            # 25 test sentences (waits automatically on free-tier rate limits)
node ai-training/evaluate.mjs --limit 5  # quick check
```

## Experiments to try (this is the real learning)

Run `evaluate.mjs` after each change and write down the score:

1. **Few-shot ON vs OFF** — add `AI_FEW_SHOT=off` to `.env.local`, restart, score. Remove it, score again.
2. **Bigger model** — `ollama pull qwen2.5:7b`, set `OLLAMA_MODEL=qwen2.5:7b`, score.
3. **Different model family** — try `llama3.2:3b`.
4. **Improve the prompt** — edit `systemPrompt()` in `src/app/api/ai-rule/route.ts` to fix the
   category that fails most, then score again.
5. **Add your own sentences** — add phrasings your team really uses to `generate-dataset.py`,
   run `python ai-training/generate-dataset.py`, score.

Never copy test sentences into the prompt or examples — then the score lies.

## Regenerate everything

```bash
npx tsx ai-training/export-fields.ts      # after Field Catalog changes
python ai-training/generate-dataset.py    # rebuilds dataset + few-shot examples
```
