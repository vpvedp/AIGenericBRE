// Scores the AI on the TEST sentences it has never seen.
//
// 1. Start Ollama (the app) and your app:  npm run dev
// 2. Run:  node ai-training/evaluate.mjs
//    Options:  --file train.jsonl   (score another file)
//              --url http://localhost:3000   (app address)
//              --limit 5           (only the first N, for a quick check)
//              --wait 20 --retries 6   (rate-limit handling for free tiers)
//
// It calls YOUR app's /api/ai-rule (the same path the popup uses), so it
// tests the prompt + few-shot examples + sanitizeDraft together.
// Results are saved to ai-training/results-<time>.json for comparing runs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const FILE = arg("file", "test.jsonl");
const URL = arg("url", "http://localhost:3000");
const LIMIT = Number(arg("limit", "0"));
const WAIT_S = Number(arg("wait", "20"));   // seconds to wait after a rate-limit error
const RETRIES = Number(arg("retries", "6"));

const FIELDS = JSON.parse(fs.readFileSync(path.join(HERE, "fields.json"), "utf8"));
let rows = fs.readFileSync(path.join(HERE, FILE), "utf8").trim().split("\n").map((l) => JSON.parse(l));
if (LIMIT) rows = rows.slice(0, LIMIT);

// "650", "650.0" and 650 are the same value; "Home Loan" vs "home loan" too.
const norm = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  return s !== "" && !Number.isNaN(Number(s)) ? String(Number(s)) : s.split(",").map((x) => x.trim()).sort().join(",");
};
const leafKey = (c) => [c.field, c.operator, norm(c.value), c.operator === "between" ? norm(c.value2) : ""].join("|");
// A group compares by its logic + its (unordered) members, e.g. "AND(a|b)".
const condKey = (c) =>
  Array.isArray(c.conditions)
    ? `${c.conditions.length > 1 ? c.logic : ""}(${c.conditions.map(condKey).sort().join(" ; ")})`
    : leafKey(c);
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

function score(expected, got) {
  const problems = [];
  const expC = expected.conditions.map(condKey);
  const gotC = (got?.conditions ?? []).map(condKey);
  if (!sameSet(expC, gotC)) problems.push(`conditions: expected [${expC.join(" ; ")}] got [${gotC.join(" ; ")}]`);
  if (expected.conditions.length > 1 && got?.logic !== expected.logic) problems.push(`logic: expected ${expected.logic} got ${got?.logic}`);
  // Tiered values: compare the field, source and every range, not just the action name.
  const actKey = (a) =>
    a.type === "Bracket Lookup"
      ? `Bracket(${a.outputField}<-${a.bracketField}:${(a.brackets ?? []).map((b) => `${Number(b.min)}-${Number(b.max)}=${norm(b.outputValue)}`).sort().join(",")})`
      : a.type;
  const expA = expected.actions.map(actKey), gotA = (got?.actions ?? []).map(actKey);
  if (!sameSet(expA, gotA)) problems.push(`THEN: expected [${expA}] got [${gotA}]`);
  const expE = expected.elseActions.map((a) => a.type), gotE = (got?.elseActions ?? []).map((a) => a.type);
  if (!sameSet(expE, gotE)) problems.push(`ELSE: expected [${expE}] got [${gotE}]`);
  return problems;
}

console.log(`Scoring ${rows.length} examples from ${FILE} against ${URL}/api/ai-rule ...\n`);
const results = [];
for (const [i, ex] of rows.entries()) {
  let data, status, ms;
  // Free tiers (e.g. Groq) allow only a few requests per minute. When the
  // limit is hit, wait and retry instead of counting it as a failure.
  for (let attempt = 1; ; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${URL}/api/ai-rule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: ex.text, domain: ex.domain, fields: FIELDS[ex.domain] }),
      });
      status = res.status;
      data = await res.json();
    } catch {
      console.error(`Can't reach ${URL}. Is "npm run dev" running?`);
      process.exit(1);
    }
    ms = Date.now() - t0;
    const rateLimited = !data.ok && /limit reached|rate limit/i.test(data.error ?? "");
    if (!rateLimited || attempt > RETRIES) break;
    process.stdout.write(`        (rate limit — waiting ${WAIT_S}s, retry ${attempt}/${RETRIES})\n`);
    await new Promise((r) => setTimeout(r, WAIT_S * 1000));
  }

  // For unmappable sentences the correct behaviour is a REFUSAL — the app
  // answers 422. Any other error (rate limit, bad key, network) is a failure.
  const unmappable = ex.tags.includes("unmappable");
  let problems;
  if (!data.ok) problems = unmappable && status === 422 ? [] : [`error: ${data.error}`];
  else problems = unmappable ? ["should have refused, but returned a rule"] : score(ex.expected, data.draft);

  const pass = problems.length === 0;
  results.push({ id: ex.id, tag: ex.tags[0], text: ex.text, pass, problems, ms, got: data.draft ?? data.error });
  console.log(`${pass ? "PASS" : "FAIL"}  ${String(i + 1).padStart(2)}/${rows.length}  ${(ms / 1000).toFixed(1)}s  [${ex.tags[0]}] ${ex.text}`);
  for (const p of problems) console.log(`        - ${p}`);
}

// ---- summary --------------------------------------------------------------
const passed = results.filter((r) => r.pass).length;
console.log(`\nScore: ${passed}/${results.length} = ${Math.round((passed / results.length) * 100)}%`);
const tags = [...new Set(results.map((r) => r.tag))].sort();
console.log("\nBy category:");
for (const t of tags) {
  const g = results.filter((r) => r.tag === t);
  console.log(`  ${t.padEnd(14)} ${g.filter((r) => r.pass).length}/${g.length}`);
}
const avg = results.reduce((s, r) => s + r.ms, 0) / results.length;
console.log(`\nAverage time per rule: ${(avg / 1000).toFixed(1)}s`);

const out = path.join(HERE, `results-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(out, JSON.stringify({ file: FILE, passed, total: results.length, results }, null, 2));
console.log(`Saved details to ${path.relative(process.cwd(), out)}`);
