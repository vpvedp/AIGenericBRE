import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/require-session";
import { getReadyDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// GET  /api/rules → every saved rule, oldest first ({ enabled:false } without a database)
// PUT  /api/rules → { upserts: Rule[], deletes: string[] } — save changed rules, remove deleted ones
//
// The browser keeps working with its own store (src/lib/store.ts); the
// RuleSync component loads rules from here at sign-in and sends every change
// back, so all devices and browsers see the same rules.
// Rules are stored whole as JSONB. If two people edit the same rule at the
// same moment, the last save wins.

const MAX_BATCH = 100;
const MAX_BODY_BYTES = 2_000_000;

const SaveBody = z.object({
  upserts: z
    .array(z.object({ id: z.string().min(1).max(100) }).passthrough())
    .max(MAX_BATCH)
    .default([]),
  deletes: z.array(z.string().min(1).max(100)).max(MAX_BATCH).default([]),
});

type Fail = { ok: false; error: string };
const fail = (error: string, status: number) => NextResponse.json<Fail>({ ok: false, error }, { status });

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return fail("Sign in required.", 401);

  try {
    const db = await getReadyDb();
    if (!db) return NextResponse.json({ ok: true, enabled: false, rules: [] });
    const rows = await db("SELECT data FROM rules ORDER BY seq");
    return NextResponse.json({ ok: true, enabled: true, rules: rows.map((r) => r.data) });
  } catch (e) {
    console.error("[rules] load failed:", e instanceof Error ? e.message : e);
    return fail("Couldn't load rules from the database.", 503);
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return fail("Sign in required.", 401);

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return fail("Too much data in one save.", 413);
  const parsed = SaveBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid rules data.", 400);
  const { deletes } = parsed.data;
  // The same id twice in one batch would make Postgres reject the whole save — keep the last copy.
  const upserts = [...new Map(parsed.data.upserts.map((r) => [r.id, r])).values()];

  const limit = rateLimit(`rules:user:${session.userId}`, 120, 60_000);
  if (!limit.ok) return fail(`Too many saves — try again in ${limit.retryAfterSec}s.`, 429);

  const started = Date.now();
  try {
    const db = await getReadyDb();
    if (!db) return fail("No database configured (DATABASE_URL).", 503);

    if (upserts.length > 0) {
      // One statement for the whole batch: each JSON object becomes a row.
      await db(
        `INSERT INTO rules (id, data, updated_by)
         SELECT r->>'id', r, $2 FROM jsonb_array_elements($1::jsonb) AS r
         ON CONFLICT (id) DO UPDATE
           SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [JSON.stringify(upserts), session.userId]
      );
    }
    if (deletes.length > 0) {
      await db("DELETE FROM rules WHERE id = ANY($1::text[])", [deletes]);
    }
    console.info(`[rules] user=${session.userId} saved=${upserts.length} deleted=${deletes.length} ms=${Date.now() - started}`);
    return NextResponse.json({ ok: true, saved: upserts.length, deleted: deletes.length });
  } catch (e) {
    console.error("[rules] save failed:", e instanceof Error ? e.message : e);
    return fail("Couldn't save rules to the database.", 503);
  }
}
