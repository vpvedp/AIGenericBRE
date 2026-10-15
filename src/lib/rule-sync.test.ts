import { describe, it, expect } from "vitest";
import { chunk, diffRules, ensureUniqueIds, PendingChanges } from "./rule-sync";
import { ALL_RULES } from "./mock-data";
import type { BusinessRule } from "./types";

const r = (id: string, name = id) => ({ id, name }) as unknown as BusinessRule;

describe("diffRules", () => {
  it("finds added, edited and deleted rules — and ignores untouched ones", () => {
    const a = r("A"), b = r("B"), c = r("C");
    const editedB = { ...b, name: "B2" } as BusinessRule;
    const d = r("D");
    const { upserts, deletes } = diffRules([a, b, c], [d, a, editedB]);
    expect(upserts).toEqual([d, editedB]);
    expect(deletes).toEqual(["C"]);
  });

  it("nothing changed → nothing to send", () => {
    const list = [r("A"), r("B")];
    expect(diffRules(list, [...list])).toEqual({ upserts: [], deletes: [] });
  });
});

describe("PendingChanges", () => {
  it("keeps only the latest change per rule", () => {
    const p = new PendingChanges();
    p.add({ upserts: [r("A", "v1")], deletes: [] });
    p.add({ upserts: [r("A", "v2")], deletes: ["B"] });
    const { upserts, deletes } = p.take(100);
    expect(upserts.map((x) => x.name)).toEqual(["v2"]);
    expect(deletes).toEqual(["B"]);
  });

  it("a rule edited again while saving stays queued", () => {
    const p = new PendingChanges();
    p.add({ upserts: [r("A", "v1")], deletes: [] });
    const sent = p.take(100);
    p.add({ upserts: [r("A", "v2")], deletes: [] }); // edited during the request
    p.confirm(sent.batch);
    expect(p.size).toBe(1);
    expect(p.take(100).upserts[0].name).toBe("v2");
  });

  it("sends in batches", () => {
    const p = new PendingChanges();
    p.add({ upserts: Array.from({ length: 250 }, (_, i) => r(`R${i}`)), deletes: [] });
    const first = p.take(100);
    expect(first.upserts).toHaveLength(100);
    p.confirm(first.batch);
    expect(p.size).toBe(150);
  });
});

it("chunk splits a list", () => {
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
});

describe("ensureUniqueIds", () => {
  it("first rule keeps its id, later copies get -2, -3 (skipping ids already taken)", () => {
    const { rules, renamed } = ensureUniqueIds([r("A", "one"), r("A", "two"), r("A-2", "taken"), r("A", "three")]);
    expect(rules.map((x) => x.id)).toEqual(["A", "A-3", "A-2", "A-4"]);
    expect(renamed.map((x) => x.name)).toEqual(["two", "three"]);
  });

  it("leaves a clean list untouched (same array)", () => {
    const list = [r("A"), r("B")];
    expect(ensureUniqueIds(list).rules).toBe(list);
  });

  it("fixes the sample data: no rule is lost, every id is unique", () => {
    const { rules } = ensureUniqueIds(ALL_RULES);
    expect(rules).toHaveLength(ALL_RULES.length);
    expect(new Set(rules.map((x) => x.id)).size).toBe(ALL_RULES.length);
  });
});
