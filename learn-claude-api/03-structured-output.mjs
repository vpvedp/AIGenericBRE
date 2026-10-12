// LESSON 3 — Getting reliable JSON (the trick behind "Describe with AI")
// Run:  node --env-file=.env.local learn-claude-api/03-structured-output.mjs
//
// Problem: if you just ask "reply in JSON", sometimes you get extra text.
// Solution: define a "tool" with a JSON schema and FORCE Claude to use it
// (tool_choice). Claude then returns data that matches your schema.
// This is exactly what src/app/api/ai-rule/route.ts does with "build_rule".

const tool = {
  name: "extract_rule",
  description: "Extract a simple business rule",
  input_schema: {
    type: "object",
    properties: {
      field:    { type: "string", enum: ["applicant_age", "credit_score", "monthly_income"] },
      operator: { type: "string", enum: ["<", "<=", ">", ">=", "="] },
      value:    { type: "number" },
      action:   { type: "string", enum: ["Approve", "Reject", "Flag for Review"] },
    },
    required: ["field", "operator", "value", "action"],
  },
};

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
    tools: [tool],
    tool_choice: { type: "tool", name: "extract_rule" }, // "you MUST use this tool"
    messages: [{ role: "user", content: "Reject the application if credit score is below 650" }],
  }),
});

const data = await res.json();
if (!res.ok) { console.error(data); process.exit(1); }

// The answer is now a "tool_use" block, and .input is already a JS object.
const block = data.content.find((b) => b.type === "tool_use");
console.log("Structured rule:", block.input);
// Expected roughly: { field: 'credit_score', operator: '<', value: 650, action: 'Reject' }

// TRY: change the sentence to "Approve if income is at least 50k" — does it map correctly?
// TRY: ask for a field not in the enum ("Reject if city is Delhi") and see what happens.
