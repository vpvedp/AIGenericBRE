"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { chunk, diffRules, ensureUniqueIds, PendingChanges } from "@/lib/rule-sync";
import type { BusinessRule } from "@/lib/types";

// Keeps the browser's rules in step with the database (via /api/rules).
//
// 1. After sign-in: load the rules from the server and show them.
//    First time ever (empty database)? Upload this browser's rules as the start.
// 2. After that: every change to the rules (add, edit, delete, approve, …) is
//    queued and sent ~1 second later, in batches.
// Without DATABASE_URL on the server this does nothing — rules stay in the
// browser like before.

const SAVE_DELAY_MS = 1000;
const BATCH = 100;

export function RuleSync() {
  const hasHydrated = useAppStore((s) => s.hasHydrated);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated) return;

    let stopped = false;
    let unsubscribe: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let saving = false;
    let warned = false;
    const pending = new PendingChanges();

    async function send(upserts: BusinessRule[], deletes: string[]) {
      const res = await fetch("/api/rules", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ upserts, deletes }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    }

    async function flush() {
      timer = null;
      if (saving || stopped) return;
      saving = true;
      try {
        while (pending.size > 0 && !stopped) {
          const { upserts, deletes, batch } = pending.take(BATCH);
          await send(upserts, deletes);
          pending.confirm(batch);
        }
        warned = false;
      } catch (e) {
        // Keep the changes queued; they go out with the next change.
        if (!warned) {
          warned = true;
          toast.error("Couldn't save rules to the database", {
            description: `${e instanceof Error ? e.message : "Network error"} — your changes are kept in this browser and retried with your next change.`,
          });
        }
      } finally {
        saving = false;
      }
    }

    // Closing the tab within the 1-second delay: send what's left right away.
    // `keepalive` lets the request finish after the page is gone (small batches only).
    function onPageHide() {
      if (pending.size === 0) return;
      const { upserts, deletes } = pending.take(BATCH);
      const body = JSON.stringify({ upserts, deletes });
      if (body.length < 60_000) {
        fetch("/api/rules", { method: "PUT", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
      }
    }
    window.addEventListener("pagehide", onPageHide);

    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DELAY_MS);
    }

    (async () => {
      let data: { ok: boolean; enabled?: boolean; rules?: BusinessRule[] };
      try {
        data = await (await fetch("/api/rules", { cache: "no-store" })).json();
      } catch {
        return; // offline: stay on browser rules
      }
      if (stopped || !data.ok || !data.enabled) return;

      const serverRules = data.rules ?? [];
      if (serverRules.length > 0) {
        useAppStore.setState({ rules: serverRules });
      } else {
        // Empty database: this browser's rules become the starting set.
        // First make sure no two rules share an id (the sample data has some).
        const { rules, renamed } = ensureUniqueIds(useAppStore.getState().rules);
        if (renamed.length > 0) {
          useAppStore.setState({ rules });
          console.info(`[rule-sync] gave ${renamed.length} rules a unique id:`, renamed);
        }
        try {
          for (const part of chunk(rules, BATCH)) await send(part, []);
        } catch (e) {
          console.error("[rule-sync] first upload failed:", e);
          return;
        }
      }
      if (stopped) return;

      // From now on, send every change.
      unsubscribe = useAppStore.subscribe((state, prev) => {
        if (state.rules === prev.rules) return;
        const change = diffRules(prev.rules, state.rules);
        if (change.upserts.length === 0 && change.deletes.length === 0) return;
        pending.add(change);
        schedule();
      });
    })();

    return () => {
      stopped = true;
      unsubscribe?.();
      window.removeEventListener("pagehide", onPageHide);
      if (timer) clearTimeout(timer);
    };
  }, [hasHydrated, isAuthenticated]);

  return null;
}
