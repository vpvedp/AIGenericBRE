// LESSON 1 — Your first Claude API call
// Run:  node --env-file=.env.local learn-claude-api/01-first-call.mjs
//
// The whole API is ONE endpoint: POST https://api.anthropic.com/v1/messages
// You send messages, Claude sends back a reply. That's it.

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY, // your secret key, from .env.local
    "anthropic-version": "2023-06-01",          // API version, always send this
  },
  body: JSON.stringify({
    model: "claude-haiku-4-5", // cheapest, fastest model — good for learning
    max_tokens: 300,           // upper limit on the reply length
    messages: [
      { role: "user", content: "Explain a business rules engine in 2 lines." },
    ],
  }),
});

const data = await res.json();

if (!res.ok) {
  // Common: 401 = wrong key, 400 = bad request / low credit, 429 = too many requests
  console.error("Error", res.status, data);
  process.exit(1);
}

// The reply is a list of "content blocks". For plain text, take block.text.
console.log("Claude says:\n" + data.content[0].text);

// "usage" tells you how many tokens you paid for. Watch this to learn cost.
console.log("\nTokens used:", data.usage);
