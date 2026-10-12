// Lists the chat models YOUR Groq key can use right now.
// Run from the project folder:  node --env-file=.env.local ai-training/list-groq-models.mjs
// Then copy one id into .env.local as:  AI_MODEL=<id>

const key = process.env.GROQ_API_KEY;
if (!key) {
  console.error("GROQ_API_KEY not found. Run with: node --env-file=.env.local ai-training/list-groq-models.mjs");
  process.exit(1);
}

const res = await fetch("https://api.groq.com/openai/v1/models", { headers: { authorization: `Bearer ${key}` } });
const data = await res.json();
if (!res.ok) {
  console.error("Groq error", res.status, data?.error?.message ?? data);
  process.exit(1);
}

// Skip speech/audio/guard models — we need text chat models.
const skip = /whisper|tts|guard|playai|orpheus|distil/i;
const models = data.data.filter((m) => m.active !== false && !skip.test(m.id)).sort((a, b) => a.id.localeCompare(b.id));
console.log("Chat models available to your key:\n");
for (const m of models) console.log(`  ${m.id.padEnd(45)} ${m.owned_by ?? ""}`);
console.log(`\nPick one and add to .env.local:  AI_MODEL=${models[0]?.id ?? "<model-id>"}`);
console.log("Tip: prefer a larger model (70b / 120b / gpt-oss) for better rules.");
