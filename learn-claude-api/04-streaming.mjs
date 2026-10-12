// LESSON 4 — Streaming (text appears word by word, like ChatGPT/Claude)
// Run:  node --env-file=.env.local learn-claude-api/04-streaming.mjs
//
// Add "stream": true and the API sends small events as Claude writes.
// Useful for chat UIs so users don't stare at a spinner.

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    stream: true,
    messages: [{ role: "user", content: "Give 5 tips for writing good business rules." }],
  }),
});

if (!res.ok) { console.error(await res.text()); process.exit(1); }

// The response is Server-Sent Events: lines like  data: {...json...}
const decoder = new TextDecoder();
let buffer = "";
for await (const chunk of res.body) {
  buffer += decoder.decode(chunk, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop(); // keep any half-received line for next time
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const event = JSON.parse(line.slice(6));
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      process.stdout.write(event.delta.text); // print each piece as it arrives
    }
  }
}
console.log("\n\n(done)");
