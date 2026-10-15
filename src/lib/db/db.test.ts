import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { setDbForTests, getReadyDb, type Db } from "./index";
import { addUser, setActive, listUsers } from "./user-admin.mjs";
import { authenticate, hashPassword } from "../auth/users";
import { createSessionToken, SESSION_COOKIE } from "../auth/session";
import { resetRateLimits } from "../rate-limit";
import { GET, PUT } from "@/app/api/rules/route";

// A real Postgres, in memory (PGlite), so the SQL itself is tested — not a mock.
let pg: PGlite;
let db: Db;

beforeEach(async () => {
  pg = new PGlite();
  db = async (text, params = []) => (await pg.query(text, params as unknown[])).rows as Record<string, unknown>[];
  setDbForTests(db);
  resetRateLimits();
});
afterEach(async () => {
  setDbForTests(undefined);
  await pg.close();
});

const prodEnv = (extra: Record<string, string> = {}) =>
  ({ NODE_ENV: "production", DATABASE_URL: "postgres://test", ...extra }) as unknown as NodeJS.ProcessEnv;

describe("users in the database", () => {
  it("creates the tables on first use, and again is harmless", async () => {
    await getReadyDb();
    await getReadyDb();
    const tables = await db("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1");
    expect(tables.map((t) => t.table_name)).toEqual(["app_users", "rules"]);
  });

  it("a user added with the script's code can sign in; wrong password and unknown ID can't", async () => {
    await getReadyDb();
    await addUser(db, "emp002", "kavita-pass-123", "Kavita Rao");
    expect(await authenticate("EMP002", "kavita-pass-123", prodEnv())).toEqual({ ok: true, userId: "EMP002", demo: false });
    expect(await authenticate("EMP002", "wrong-password", prodEnv())).toEqual({ ok: false, reason: "invalid" });
    expect(await authenticate("NOBODY", "kavita-pass-123", prodEnv())).toEqual({ ok: false, reason: "invalid" });
  });

  it("a disabled user is refused until enabled again; adding again changes the password", async () => {
    await getReadyDb();
    await addUser(db, "EMP003", "first-password-1");
    await setActive(db, "EMP003", false);
    expect((await authenticate("EMP003", "first-password-1", prodEnv())).ok).toBe(false);
    await setActive(db, "EMP003", true);
    expect((await authenticate("EMP003", "first-password-1", prodEnv())).ok).toBe(true);
    await addUser(db, "EMP003", "second-password-2");
    expect((await authenticate("EMP003", "first-password-1", prodEnv())).ok).toBe(false);
    expect((await authenticate("EMP003", "second-password-2", prodEnv())).ok).toBe(true);
    expect((await listUsers(db)).map((u) => u.employee_id)).toEqual(["EMP003"]);
  });

  it("rejects weak input in the admin script", async () => {
    await getReadyDb();
    await expect(addUser(db, "EMP004", "short")).rejects.toThrow(/10 characters/);
    await expect(addUser(db, "bad id!", "long-enough-pass")).rejects.toThrow(/Employee ID/);
  });

  it("APP_USERS still works next to the database (break-glass admin)", async () => {
    const env = prodEnv({ APP_USERS: `EMP001:${hashPassword("admin-password-1")}` });
    expect((await authenticate("EMP001", "admin-password-1", env)).ok).toBe(true);
  });

  it("with a database there is no demo mode, even in development", async () => {
    const env = { NODE_ENV: "development", DATABASE_URL: "x" } as unknown as NodeJS.ProcessEnv;
    expect(await authenticate("ANYONE", "anything", env)).toEqual({ ok: false, reason: "invalid" });
  });

  it("DEMO_MODE=on in development: unknown IDs get a demo login, real users still need their password", async () => {
    await getReadyDb();
    await addUser(db, "EMP002", "kavita-pass-123");
    const env = { NODE_ENV: "development", DATABASE_URL: "x", DEMO_MODE: "on" } as unknown as NodeJS.ProcessEnv;
    expect(await authenticate("KAVITA", "demo", env)).toEqual({ ok: true, userId: "KAVITA", demo: true });
    expect(await authenticate("EMP002", "wrong-password", env)).toEqual({ ok: false, reason: "invalid" });
    expect(await authenticate("EMP002", "kavita-pass-123", env)).toEqual({ ok: true, userId: "EMP002", demo: false });
  });

  it("DEMO_MODE=on is ignored in production", async () => {
    expect(await authenticate("ANYONE", "demo", prodEnv({ DEMO_MODE: "on" }))).toEqual({ ok: false, reason: "invalid" });
  });

  it("if the database is down, APP_USERS users can still sign in", async () => {
    setDbForTests(async () => {
      throw new Error("connection refused");
    });
    const env = prodEnv({ APP_USERS: `EMP001:${hashPassword("admin-password-1")}` });
    expect((await authenticate("EMP001", "admin-password-1", env)).ok).toBe(true);
    expect((await authenticate("EMP001", "wrong", env)).ok).toBe(false);
  });
});

// ---- /api/rules -----------------------------------------------------------

async function request(method: "GET" | "PUT", body?: unknown, signedIn = true) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signedIn) headers.cookie = `${SESSION_COOKIE}=${await createSessionToken({ userId: "EMP001" })}`;
  const req = new NextRequest("http://localhost/api/rules", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = method === "GET" ? await GET(req) : await PUT(req);
  return { status: res.status, data: await res.json() };
}

const rule = (id: string, name: string) => ({ id, name, status: "Draft", conditions: [{ field: "age", operator: ">", value: "21" }] });

describe("/api/rules", () => {
  it("needs sign-in", async () => {
    expect((await request("GET", undefined, false)).status).toBe(401);
    expect((await request("PUT", { upserts: [] }, false)).status).toBe(401);
  });

  it("starts empty, saves rules in order, updates and deletes", async () => {
    expect((await request("GET")).data).toEqual({ ok: true, enabled: true, rules: [] });

    await request("PUT", { upserts: [rule("R1", "First"), rule("R2", "Second"), rule("R3", "Third")] });
    let rules = (await request("GET")).data.rules;
    expect(rules.map((r: { id: string }) => r.id)).toEqual(["R1", "R2", "R3"]);
    expect(rules[0]).toEqual(rule("R1", "First")); // the whole rule comes back unchanged

    await request("PUT", { upserts: [rule("R2", "Second (edited)")], deletes: ["R3"] });
    rules = (await request("GET")).data.rules;
    expect(rules.map((r: { name: string }) => r.name)).toEqual(["First", "Second (edited)"]);

    const [row] = await db("SELECT updated_by FROM rules WHERE id = 'R2'");
    expect(row.updated_by).toBe("EMP001");
  });

  it("rejects bad data", async () => {
    expect((await request("PUT", { upserts: [{ name: "no id" }] })).status).toBe(400);
    expect((await request("PUT", { upserts: Array.from({ length: 101 }, (_, i) => rule(`R${i}`, "x")) })).status).toBe(400);
    expect((await request("PUT", "not json")).status).toBe(400);
  });

  it("the same id twice in one save keeps the last copy instead of failing", async () => {
    expect((await request("PUT", { upserts: [rule("R1", "old"), rule("R1", "new")] })).status).toBe(200);
    expect((await request("GET")).data.rules.map((x: { name: string }) => x.name)).toEqual(["new"]);
  });

  it("a value that looks like SQL is stored as plain text", async () => {
    const sneaky = rule("R'; DROP TABLE rules; --", "Robert'); DROP TABLE rules;--");
    expect((await request("PUT", { upserts: [sneaky] })).status).toBe(200);
    expect((await request("GET")).data.rules).toEqual([sneaky]);
  });

  it("without a database the browser keeps its own rules", async () => {
    setDbForTests(null);
    expect((await request("GET")).data).toEqual({ ok: true, enabled: false, rules: [] });
    expect((await request("PUT", { upserts: [rule("R1", "x")] })).status).toBe(503);
  });
});
