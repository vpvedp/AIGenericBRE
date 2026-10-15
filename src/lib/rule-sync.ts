import type { BusinessRule } from "@/lib/types";

// Pure helpers for syncing the browser's rules with /api/rules. No React and
// no fetch in here, so they are easy to test (rule-sync.test.ts).

/**
 * What changed between two versions of the rules list. The store never edits a
 * rule in place — every change makes a new object — so "a different object for
 * the same id" means "this rule changed".
 */
export function diffRules(prev: BusinessRule[], next: BusinessRule[]) {
  const before = new Map(prev.map((r) => [r.id, r]));
  const nextIds = new Set(next.map((r) => r.id));
  return {
    upserts: next.filter((r) => before.get(r.id) !== r),
    deletes: prev.filter((r) => !nextIds.has(r.id)).map((r) => r.id),
  };
}

/** Changes waiting to be sent. A later change to the same rule replaces the earlier one. */
export class PendingChanges {
  private items = new Map<string, BusinessRule | null>(); // null = delete

  add(change: { upserts: BusinessRule[]; deletes: string[] }) {
    for (const r of change.upserts) this.items.set(r.id, r);
    for (const id of change.deletes) this.items.set(id, null);
  }

  get size() {
    return this.items.size;
  }

  /** The next batch to send, at most `max` items. */
  take(max: number) {
    const batch = [...this.items.entries()].slice(0, max);
    return {
      upserts: batch.filter(([, r]) => r !== null).map(([, r]) => r as BusinessRule),
      deletes: batch.filter(([, r]) => r === null).map(([id]) => id),
      batch,
    };
  }

  /** Forget what was sent — unless it changed again while the request was in flight. */
  confirm(batch: [string, BusinessRule | null][]) {
    for (const [id, value] of batch) if (this.items.get(id) === value) this.items.delete(id);
  }
}

/** Split a list into chunks (the server takes at most 100 rules per request). */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Gives every rule a unique id. The sample data reuses some ids for two
 * different rules (e.g. RL-601 is both a Lending and a Credit Cards rule);
 * a database needs one id per rule. The first rule keeps the id, later ones
 * get "-2", "-3", … Returns the same array object when nothing needed fixing.
 */
export function ensureUniqueIds(rules: BusinessRule[]) {
  const taken = new Set(rules.map((r) => r.id));
  const seen = new Set<string>();
  const renamed: { from: string; to: string; name: string }[] = [];
  const fixed = rules.map((r) => {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      return r;
    }
    let n = 2;
    while (taken.has(`${r.id}-${n}`)) n++;
    const id = `${r.id}-${n}`;
    taken.add(id);
    seen.add(id);
    renamed.push({ from: r.id, to: id, name: r.name });
    return { ...r, id };
  });
  return { rules: renamed.length > 0 ? fixed : rules, renamed };
}
