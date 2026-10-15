import { neon } from "@neondatabase/serverless";
import { SCHEMA_SQL } from "./schema.mjs";

// One small function the rest of the app uses to talk to Postgres:
//
//   const rows = await db("SELECT * FROM rules WHERE id = $1", [id]);
//
// Always use $1, $2 … placeholders for values — never paste values into the
// SQL text (that is how SQL injection happens).
//
// Production / Vercel: DATABASE_URL points at Neon (free serverless Postgres),
// reached over HTTPS — no connection pool to manage on serverless.
// No DATABASE_URL: the app keeps working the old way (rules in the browser,
// users from APP_USERS).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type Db = (text: string, params?: unknown[]) => Promise<Row[]>;

let testDb: Db | null | undefined; // tests swap in an in-memory Postgres
let cached: { url: string; db: Db } | null = null;
const schemaReady = new WeakMap<Db, Promise<void>>();

export function setDbForTests(db: Db | null | undefined) {
  testDb = db;
}

export function isDbConfigured(env = process.env): boolean {
  return testDb !== undefined ? testDb !== null : Boolean(env.DATABASE_URL);
}

function getDb(): Db | null {
  if (testDb !== undefined) return testDb;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (cached?.url !== url) {
    const sql = neon(url);
    cached = { url, db: (text, params = []) => sql.query(text, params) as Promise<Row[]> };
  }
  return cached.db;
}

/** The database, with tables created on first use — or null when not configured. */
export async function getReadyDb(): Promise<Db | null> {
  const db = getDb();
  if (!db) return null;
  let ready = schemaReady.get(db);
  if (!ready) {
    ready = (async () => {
      for (const statement of SCHEMA_SQL) await db(statement);
    })();
    // A failed attempt (e.g. database asleep) is retried on the next request.
    ready.catch(() => schemaReady.delete(db));
    schemaReady.set(db, ready);
  }
  await ready;
  return db;
}
