import { NextRequest, NextResponse } from "next/server";
import { AI_ACTION_TYPES, AI_OPERATORS, AiRuleDraft, AiRuleRequest, AiRuleResponse, sanitizeDraft, unwrapDraft } from "@/lib/ai-rule";
import { z } from "zod";
import { getSession } from "@/lib/auth/require-session";
import { rateLimit } from "@/lib/rate-limit";
import { AI_RULE_EXAMPLES, AiExampleCondition, AiExampleGroup, AiRuleExample } from "@/lib/ai-rule-examples";

// POST /api/ai-rule — plain English → draft rule for the Rule Builder.
//
// Two AI providers, picked by AI_PROVIDER in .env.local:
//   - "groq"      — free cloud AI, nothing to install. Needs GROQ_API_KEY
//                   (free at console.groq.com). Works with any OpenAI-compatible
//                   service too (OpenRouter, GitHub Models) via AI_BASE_URL.
//   - "ollama"    — free, runs on your own computer. Needs Ollama installed.
//   - "anthropic" — Claude API. Needs ANTHROPIC_API_KEY (paid).
// If AI_PROVIDER isn't set, the first key found decides: Groq → Claude → Ollama.
// Both are asked for the SAME JSON shape (RULE_SCHEMA below), and both
// results go through the same sanitizeDraft() check, so the UI doesn't care
// which one answered.

const PROVIDER = (
  process.env.AI_PROVIDER ??
  (process.env.GROQ_API_KEY ? "groq" : process.env.ANTHROPIC_API_KEY ? "anthropic" : "ollama")
).toLowerCase();
const OPENAI_COMPAT_URL = process.env.AI_BASE_URL ?? "https://api.groq.com/openai/v1";
const OPENAI_COMPAT_MODEL = process.env.AI_MODEL ?? "openai/gpt-oss-120b";
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";
const MAX_TEXT = 1000;

type ProviderResult = { ok: true; raw: AiRuleDraft } | { ok: false; error: string; status: number };

const actionSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: AI_ACTION_TYPES },
    reasonCode: { type: "string", description: "UPPER_SNAKE_CASE code, e.g. AGE_BELOW_MIN" },
    message: { type: "string", description: "Short user-facing reason" },
    outputField: { type: "string", description: "Field key — Assign Value only" },
    outputValue: { type: "string", description: "Value to assign — Assign Value only" },
    bracketField: { type: "string", description: "Bracket Lookup only — numeric field tested against the ranges" },
    brackets: {
      type: "array",
      description: "Bracket Lookup only — ranges, inclusive",
      items: {
        type: "object",
        properties: { min: { type: "number" }, max: { type: "number" }, outputValue: { type: "string" } },
        required: ["min", "max", "outputValue"],
      },
    },
  },
  required: ["type"],
};

const CONDITION_PROPS = {
  field: { type: "string", description: "Exact field key from the catalog" },
  operator: { type: "string", enum: AI_OPERATORS },
  value: { type: "string", description: "Plain number (no ₹, commas or units), option text, or comma-separated list for 'in'" },
  value2: { type: "string", description: "Upper bound — 'between' only" },
};

// An item that is either a condition or a bracketed group, nested `depth`
// levels deep. Written out explicitly (no $ref) so every provider accepts it.
function groupOrCondition(depth: number): object {
  if (depth === 0) return { type: "object", properties: CONDITION_PROPS, required: ["field", "operator", "value"] };
  return {
    type: "object",
    properties: {
      ...CONDITION_PROPS,
      logic: { type: "string", enum: ["AND", "OR"], description: "Group only — how the group's items combine" },
      conditions: { type: "array", items: groupOrCondition(depth - 1), description: "Group only" },
    },
  };
}

// The JSON shape we want back — shared by all providers.
const RULE_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Short rule name, Title Case, max 8 words" },
    logic: { type: "string", enum: ["AND", "OR"] },
    conditions: {
      type: "array",
      description: "Each item is EITHER a condition {field, operator, value} OR a group {logic, conditions:[...]}. Groups may contain groups (max 3 levels).",
      items: groupOrCondition(3),
    },
    actions: { type: "array", items: actionSchema, description: "THEN — when conditions match" },
    elseActions: { type: "array", items: actionSchema, description: "ELSE — only if the user described an otherwise case" },
    explanation: { type: "string", description: "One sentence restating the rule in plain English" },
    warnings: { type: "array", items: { type: "string" }, description: "Assumptions made or parts that could not be mapped" },
  },
  required: ["name", "logic", "conditions", "actions", "elseActions", "explanation", "warnings"],
};

function systemPrompt(domain: string, fields: AiRuleRequest["fields"]) {
  const catalog = fields
    .map((f) => {
      const extra = [f.unit && `unit ${f.unit}`, f.options?.length && `options: ${f.options.join(" | ")}`].filter(Boolean).join("; ");
      return `- ${f.key} (${f.type}) "${f.label}"${extra ? ` — ${extra}` : ""}`;
    })
    .join("\n");

  return `You convert business rules written in plain English (or Hinglish) into a structured rule for a ${domain} business rules engine.

Available fields — use ONLY these exact keys:
${catalog}

Guidelines:
- Numbers are plain digits. "50 lakh" = 5000000, "1 crore" = 10000000, "50k" = 50000. Strip ₹, commas and units.
- "below/under/less than" → "<", "at most/up to" → "<=", "above/over/more than" → ">", "at least/minimum" → ">=".
- For enum fields, the value must be one of the listed options exactly.
- "Reject/decline/deny" → Reject; "approve/accept" → Approve; "review/refer/manual check" → Flag for Review.
- Give Reject and Flag for Review a reasonCode and a short message.
- Leave elseActions empty unless the user describes what happens otherwise.
- Two or more cases that lead to the same action ("approve if A, or if B and C") become ONE rule:
  top-level logic "OR" with items [A, {"logic":"AND","conditions":[B, C]}]. Use a group only when needed.
- Mixed AND/OR always needs groups — never put AND and OR at the same level. "A and (B or C)" →
  logic "AND", items [A, {"logic":"OR","conditions":[B, C]}]. Groups can contain groups.
- "neither X nor Y" / "not one of X, Y" → two "!=" conditions joined with AND (there is no "not in").
- "unless X" means "if not X".
- Ratios like "more than half of income" → use a computed ratio field if one exists (e.g. dti_ratio > 50).
  Never compare two fields directly.
- Tiered values ("rate 8.5% for score 800+, 9.5% for 750-799") → ONE "Bracket Lookup" action with
  outputField, bracketField and inclusive ranges; no conditions needed. Use 900 as the top of credit scores.
- One rule has only ONE "then" and ONE "else". If the description has three or more different outcomes
  (e.g. reject below 600, review 600-700, approve above), build the rule for the FIRST outcome only and
  list the extra rules the user must create in warnings.
- If two branches leave a gap at a boundary ("below 4 lakh" / "above 4 lakh" leaves exactly 4 lakh
  uncovered), keep the user's words but point out the gap in warnings.
- If the description is contradictory or unclear (e.g. every branch gives the same result), make your best
  guess and say exactly what you assumed in warnings.
- If something cannot be mapped to a field, leave it out and explain in warnings. Never invent field keys.${examplesFor(fields)}`;
}

// Few-shot learning: show the model a few solved examples (from
// ai-training/train.jsonl) so it copies the exact format. Only examples whose
// fields exist in THIS industry are used, so we never hint at fields the
// model isn't allowed to use. Set AI_FEW_SHOT=off to compare without them.
function examplesFor(fields: AiRuleRequest["fields"]): string {
  if ((process.env.AI_FEW_SHOT ?? "on").toLowerCase() === "off") return "";
  const keys = new Set(fields.map((f) => f.key));
  type Item = AiExampleCondition | AiExampleGroup;
  const leaves = (items: Item[]): AiExampleCondition[] => items.flatMap((c) => ("conditions" in c ? leaves(c.conditions) : [c]));
  // Fields an example uses: its conditions plus any tiered-value fields.
  const fieldsOf = (ex: AiRuleExample) => [
    ...leaves(ex.expected.conditions).map((c) => c.field),
    ...ex.expected.actions.flatMap((a) => [a.outputField, a.bracketField]).filter((k): k is string => typeof k === "string"),
  ];
  const hasGroup = (ex: AiRuleExample) => ex.expected.conditions.some((c) => "conditions" in c);
  const priority = (ex: AiRuleExample) =>
    (hasGroup(ex) ? 2 : 0) + (ex.expected.actions.some((a) => a.type === "Bracket Lookup") ? 1 : 0);
  const usable = AI_RULE_EXAMPLES.filter((ex) => fieldsOf(ex).every((k) => keys.has(k)))
    // Hardest patterns first, so they survive the cut: brackets, then tiered values.
    .sort((a, b) => priority(b) - priority(a))
    .slice(0, 8);
  if (usable.length === 0) return "";
  return (
    "\n\nExamples (input → output JSON):\n" +
    usable.map((ex) => `Input: ${ex.text}\nOutput: ${JSON.stringify(ex.expected)}`).join("\n\n")
  );
}

// ---- Provider 1: Ollama (local, free) -----------------------------------
// Ollama's /api/chat accepts a JSON schema in `format` and returns the JSON
// as a string in message.content.
async function callOllama(system: string, text: string): Promise<ProviderResult> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: RULE_SCHEMA,
        options: { temperature: 0 }, // same input → same output; best for rules
        messages: [
          { role: "system", content: `${system}\n\nRespond ONLY with JSON matching the requested schema.` },
          { role: "user", content: text },
        ],
      }),
    });
  } catch {
    return { ok: false, status: 503, error: `Couldn't reach Ollama at ${OLLAMA_URL}. Open the Ollama app (or run "ollama serve") and try again.` };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[ai-rule] Ollama error", res.status, detail);
    if (res.status === 404 || detail.includes("not found")) {
      return { ok: false, status: 502, error: `Model "${OLLAMA_MODEL}" isn't downloaded. Run: ollama pull ${OLLAMA_MODEL}` };
    }
    return { ok: false, status: 502, error: "Ollama returned an error. Check the terminal running Ollama." };
  }

  const data = await res.json();
  try {
    return { ok: true, raw: JSON.parse(data?.message?.content ?? "") as AiRuleDraft };
  } catch {
    return { ok: false, status: 502, error: "The local model didn't return valid JSON. Try again, or use a bigger model (e.g. qwen2.5:7b)." };
  }
}

// ---- Provider 2: Groq / any OpenAI-compatible API (free tiers) -----------
// "json_object" mode guarantees valid JSON; the schema itself is described in
// the prompt, because not every free model supports strict json_schema.
async function callOpenAICompatible(system: string, text: string): Promise<ProviderResult> {
  const apiKey = process.env.GROQ_API_KEY ?? process.env.AI_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, error: "Add GROQ_API_KEY to .env.local (free key at console.groq.com) and restart the dev server." };
  }

  // Prefer "json_schema" (the model must follow RULE_SCHEMA exactly). Some
  // models only support "json_object" (any valid JSON) — fall back to that.
  const call = (responseFormat: object) =>
    fetch(`${OPENAI_COMPAT_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_COMPAT_MODEL,
        temperature: 0,
        response_format: responseFormat,
        messages: [
          { role: "system", content: `${system}\n\nRespond ONLY with a JSON object matching this JSON schema:\n${JSON.stringify(RULE_SCHEMA)}` },
          { role: "user", content: text },
        ],
      }),
    });

  let res: Response;
  try {
    res = await call({ type: "json_schema", json_schema: { name: "business_rule", schema: RULE_SCHEMA } });
    if (res.status === 400) {
      const detail = await res.clone().text();
      if (/response_format|json_schema|structured/i.test(detail)) res = await call({ type: "json_object" });
    }
  } catch {
    return { ok: false, status: 502, error: `Couldn't reach ${OPENAI_COMPAT_URL}. Check your internet connection.` };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[ai-rule] OpenAI-compatible API error", res.status, detail);
    // Show the provider's own message — it says exactly what's wrong.
    let providerMessage = "";
    try {
      providerMessage = JSON.parse(detail)?.error?.message ?? "";
    } catch {
      providerMessage = detail.slice(0, 200);
    }
    const error =
      res.status === 401 ? "The API key was rejected — check GROQ_API_KEY in .env.local (no quotes or spaces), then restart."
      : res.status === 429 ? "Free-tier limit reached — wait a minute and try again."
      : res.status === 404 || /model_not_found|does not exist|decommissioned/i.test(detail) ? `Model "${OPENAI_COMPAT_MODEL}" isn't available — set AI_MODEL in .env.local to a current model. (${providerMessage})`
      : `AI service error ${res.status}: ${providerMessage || "unknown error"}`;
    return { ok: false, status: 502, error };
  }

  const data = await res.json();
  try {
    return { ok: true, raw: JSON.parse(data?.choices?.[0]?.message?.content ?? "") as AiRuleDraft };
  } catch {
    return { ok: false, status: 502, error: "The AI didn't return valid JSON. Try again." };
  }
}

// ---- Provider 3: Claude API (paid) ----------------------------------------
// Claude is forced to answer via a tool call, so the output always matches
// RULE_SCHEMA and arrives already parsed in tool_use.input.
async function callAnthropic(system: string, text: string): Promise<ProviderResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, error: "AI_PROVIDER is anthropic but ANTHROPIC_API_KEY is missing in .env.local." };
  }

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system,
        tools: [{ name: "build_rule", description: "Return the business rule described by the user, using only the provided field keys.", input_schema: RULE_SCHEMA }],
        tool_choice: { type: "tool", name: "build_rule" },
        messages: [{ role: "user", content: text }],
      }),
    });
  } catch {
    return { ok: false, status: 502, error: "Couldn't reach the Claude API. Check your internet connection." };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[ai-rule] Anthropic error", res.status, detail);
    const error =
      res.status === 401 ? "The API key was rejected — check ANTHROPIC_API_KEY."
      : res.status === 429 ? "Rate limit reached — wait a moment and try again."
      : res.status === 400 && detail.includes("credit") ? "Your API credit balance is too low."
      : "The AI service returned an error. Try again.";
    return { ok: false, status: 502, error };
  }

  const data = await res.json();
  const toolUse = Array.isArray(data.content) ? data.content.find((b: { type: string }) => b.type === "tool_use") : undefined;
  if (!toolUse?.input) return { ok: false, status: 502, error: "The AI didn't return a rule. Try rephrasing." };
  return { ok: true, raw: toolUse.input as AiRuleDraft };
}

// What the browser may send. Anything else is rejected before it reaches the AI
// (keeps prompts small, blocks junk, and limits what can be injected).
const FIELD_TYPES = ["number", "string", "boolean", "enum", "currency", "percentage", "date", "list"] as const;
const RequestBody = z.object({
  text: z.string().trim().min(1, "Describe the rule first.").max(MAX_TEXT, `Keep the description under ${MAX_TEXT} characters.`),
  domain: z.string().trim().max(60).default(""),
  fields: z
    .array(
      z.object({
        key: z.string().regex(/^[a-zA-Z0-9_.-]{1,64}$/, "Invalid field key."),
        label: z.string().max(120),
        type: z.enum(FIELD_TYPES),
        options: z.array(z.string().max(80)).max(50).optional(),
        unit: z.string().max(20).optional(),
      })
    )
    .min(1, "No fields are available for this industry.")
    .max(200),
});

// Limits that protect the (free-tier) AI key. Override in .env.local / Vercel.
const PER_MINUTE = Number(process.env.AI_RATE_PER_MIN ?? 10); // per signed-in user
const PER_DAY = Number(process.env.AI_DAILY_LIMIT ?? 300); // whole app

export async function POST(req: NextRequest): Promise<NextResponse<AiRuleResponse>> {
  // 1) Who is asking? (src/proxy.ts checks too — this is the second check.)
  const session = await getSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });

  // 2) Is the request well-formed?
  const parsed = RequestBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request.";
    return NextResponse.json({ ok: false, error: message === "Invalid input" ? "Invalid request." : message }, { status: 400 });
  }
  const { text, domain, fields } = parsed.data;

  // 3) Within the limits? (Message wording matters: the scorer retries on "rate limit".)
  const perUser = rateLimit(`ai:user:${session.userId}`, PER_MINUTE, 60_000);
  if (!perUser.ok) {
    return NextResponse.json({ ok: false, error: `Rate limit reached — try again in ${perUser.retryAfterSec}s.` }, { status: 429 });
  }
  const perDay = rateLimit("ai:day", PER_DAY, 24 * 3600_000);
  if (!perDay.ok) {
    return NextResponse.json({ ok: false, error: "Daily AI limit reached for this app — try again tomorrow." }, { status: 429 });
  }

  const started = Date.now();
  const system = systemPrompt(domain, fields);
  const result =
    PROVIDER === "anthropic" ? await callAnthropic(system, text)
    : PROVIDER === "groq" || PROVIDER === "openai" ? await callOpenAICompatible(system, text)
    : await callOllama(system, text);
  // One log line per request: who, which AI, how long, outcome. Never log the API key.
  const log = (outcome: string) =>
    console.info(`[ai-rule] user=${session.userId} provider=${PROVIDER} ms=${Date.now() - started} outcome=${outcome}`);
  if (!result.ok) {
    log(`error:${result.status}`);
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  const draft = sanitizeDraft(unwrapDraft(result.raw), fields);
  // sanitizeDraft refuses unsafe drafts — e.g. every condition invalid (the
  // actions would then run for everyone), or a decision with no conditions.
  if (draft.refusal) {
    // Log what the model actually said, so you can see WHY in the terminal.
    console.warn("[ai-rule] Refused answer for:", text, "\n→", JSON.stringify(result.raw).slice(0, 1500));
    log("refused");
    return NextResponse.json({ ok: false, error: draft.refusal }, { status: 422 });
  }
  log(`ok warnings=${draft.warnings.length}`);
  return NextResponse.json({ ok: true, draft });
}
