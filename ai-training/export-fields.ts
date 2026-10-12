// Writes fields.json (fields per industry) from the app's Field Catalog.
// Run again whenever you add or rename fields:  npx tsx ai-training/export-fields.ts
import fs from "node:fs";
import { DEFAULT_FIELD_CATALOG } from "../src/lib/fields";

const out: Record<string, object[]> = {};
for (const f of DEFAULT_FIELD_CATALOG) {
  const spec = { key: f.key, label: f.label, type: f.type, ...(f.options ? { options: f.options } : {}), ...(f.unit ? { unit: f.unit } : {}) };
  (out[f.domain] ??= []).push(spec);
}
const byDomain = Object.fromEntries(
  Object.keys(out).filter((d) => d !== "Common").map((d) => [d, [...out[d], ...out.Common]])
);
fs.writeFileSync(new URL("./fields.json", import.meta.url), JSON.stringify(byDomain, null, 2));
console.log("fields.json written:", Object.entries(byDomain).map(([d, f]) => `${d} ${f.length}`).join(", "));
