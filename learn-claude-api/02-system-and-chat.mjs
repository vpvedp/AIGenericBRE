// LESSON 2 — System prompt + a conversation
// Run:  node --env-file=.env.local learn-claude-api/02-system-and-chat.mjs
//
// New ideas:
//  - "system": instructions that shape EVERY reply (role, tone, rules).
//  - Claude has no memory between calls. To continue a chat, you send the
//    whole conversation again: user, assistant, user, ...

async function ask(messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      system: "You are a senior credit risk analyst at an Indian NBFC. Answer in 2-3 short lines. Use ₹ and Indian number formats.",
      messages,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.content[0].text;
}

const conversation = [
  { role: "user", content: "What is a safe DTI ratio for a personal loan?" },
];

const reply1 = await ask(conversation);
console.log("Q1:", conversation[0].content, "\nA1:", reply1, "\n");

// Add Claude's answer + your follow-up, then send EVERYTHING again
conversation.push({ role: "assistant", content: reply1 });
conversation.push({ role: "user", content: "And for someone earning 40k a month?" });

const reply2 = await ask(conversation);
console.log("Q2:", conversation[2].content, "\nA2:", reply2);

// TRY: change the system prompt to "Answer in Hinglish" and run again.
