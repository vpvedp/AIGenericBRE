// Quick check of the 13 complex business-rule scenarios — no AI needed.
// Run:  npx tsx ai-training/scenario-tests.ts      (or: npm test, which runs them via Vitest)
// The scenarios themselves live in scenarios.ts.

import { SCENARIOS, runScenario } from "./scenarios";

let passed = 0;
for (const sc of SCENARIOS) {
  const { problems, warnings } = runScenario(sc);
  if (problems.length === 0) passed++;
  console.log(`${problems.length === 0 ? "PASS" : "FAIL"}  ${sc.name}`);
  for (const p of problems) console.log(`        - ${p}`);
  for (const w of warnings) console.log(`        - warning: ${w}`);
}
console.log(`\n${passed}/${SCENARIOS.length} scenarios passed`);
process.exitCode = passed === SCENARIOS.length ? 0 : 1;
