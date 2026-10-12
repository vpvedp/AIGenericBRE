// LESSON 5 — Same idea, but FREE and local with Ollama
// Run:  node learn-claude-api/05-ollama-local.mjs
// Needs: Ollama installed and running, and a model pulled:  ollama pull qwen2.5:3b
//
// Ollama runs an AI model on YOUR computer at http://localhost:11434.
// No API key, no cost, no internet needed after the model is downloaded.
// Compare with lesson 1 & 3 — the shape is almost the same:
//   Claude:  POST api.anthropic.com/v1/messages  → data.content[0].text
//   Ollama:  POST localhost:11434/api/chat       → data.message.content

const MODEL = "qwen2.5:3b";

// Part A — plain chat
let res = await fetch("http://localhost:11434/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    model: MODEL,
    stream: false, // get one complete answer instead of pieces
    messages: [
      { role: "system", content: "You are a credit risk analyst. Answer in 2 short lines." },
      { role: "user", content: "What is a safe DTI ratio for a personal loan?" },
    ],
  }),
}).catch(() => null);

if (!res) {
  console.error("Ollama isn't running. Open the Ollama app, or run: ollama serve");
  process.exit(1);
}
let data = await res.json();
if (!res.ok) { console.error(data); process.exit(1); } // e.g. model not pulled
console.log("Answer:\n" + data.message.content + "\n");

// Part B — structured JSON (like lesson 3). Ollama takes the JSON schema in "format".
res = await fetch("http://localhost:11434/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    model: MODEL,
    stream: false,
    options: { temperature: 0 }, // 0 = most predictable, best for structured data
    format: {
      type: "object",
      properties: {
        field:    { type: "string", enum: ["applicant_age", "credit_score", "monthly_income"] },
        operator: { type: "string", enum: ["<", "<=", ">", ">=", "="] },
        value:    { type: "number" },
        action:   { type: "string", enum: ["Approve", "Reject", "Flag for Review"] },
      },
      required: ["field", "operator", "value", "action"],
    },
    messages: [{ role: "user", content: "Reject the application if credit score is below 650" }],
  }),
});
data = await res.json();

// The JSON comes back as a STRING, so parse it (Claude's tool_use gave an object).
console.log("Structured rule:", JSON.parse(data.message.content));

// TRY: change MODEL to "llama3.2:3b" (after pulling it) and compare the answers.
// TRY: write the rule in Hinglish: "credit score 650 se kam ho to reject karo".
