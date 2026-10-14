import { describe, it, expect, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { createSessionToken, readSessionToken, SESSION_HOURS } from "./session";
import { checkLogin, hashPassword } from "./users";
import { rateLimit, resetRateLimits } from "../rate-limit";

describe("sessions (signed cookies)", () => {
  it("a token we created is accepted", async () => {
    const token = await createSessionToken({ userId: "EMP001" });
    expect(await readSessionToken(token)).toEqual({ userId: "EMP001" });
  });

  it("a tampered token is rejected", async () => {
    const token = await createSessionToken({ userId: "EMP001" });
    const [h, , sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ userId: "ADMIN", exp: 9999999999 })).toString("base64url");
    expect(await readSessionToken(`${h}.${forged}.${sig}`)).toBeNull();
  });

  it("an expired token is rejected", async () => {
    const longAgo = Date.now() - (SESSION_HOURS + 1) * 3600_000;
    const token = await createSessionToken({ userId: "EMP001" }, longAgo);
    expect(await readSessionToken(token)).toBeNull();
  });

  it("garbage or no token is rejected without throwing", async () => {
    expect(await readSessionToken("not-a-token")).toBeNull();
    expect(await readSessionToken(undefined)).toBeNull();
  });
});

describe("checkLogin (APP_USERS)", () => {
  const env = { NODE_ENV: "production", APP_USERS: `EMP001:${hashPassword("correct horse battery")}` } as NodeJS.ProcessEnv;

  it("accepts the right password (ID is case-insensitive)", () => {
    expect(checkLogin("emp001", "correct horse battery", env)).toMatchObject({ ok: true, userId: "EMP001", demo: false });
  });

  it("rejects a wrong password and an unknown user the same way", () => {
    expect(checkLogin("EMP001", "wrong", env)).toEqual({ ok: false, reason: "invalid" });
    expect(checkLogin("NOBODY", "correct horse battery", env)).toEqual({ ok: false, reason: "invalid" });
  });

  it("production without APP_USERS lets nobody in (fail closed)", () => {
    expect(checkLogin("EMP001", "anything", { NODE_ENV: "production" } as NodeJS.ProcessEnv)).toEqual({ ok: false, reason: "not-configured" });
  });

  it("local development without APP_USERS keeps demo mode", () => {
    expect(checkLogin("EMP001", "anything", { NODE_ENV: "development" } as NodeJS.ProcessEnv)).toMatchObject({ ok: true, demo: true });
  });

  it("scripts/create-user.mjs produces a line that checkLogin accepts", () => {
    const line = execFileSync("node", ["scripts/create-user.mjs", "emp777", "script-password-1"]).toString().split("\n")[0];
    expect(checkLogin("EMP777", "script-password-1", { NODE_ENV: "production", APP_USERS: line } as NodeJS.ProcessEnv).ok).toBe(true);
  });
});

describe("rateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit, then blocks with a retry time", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 60_000, now).ok).toBe(true);
    const blocked = rateLimit("k", 3, 60_000, now + 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(59);
  });

  it("starts fresh after the window", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) rateLimit("k", 3, 60_000, now);
    expect(rateLimit("k", 3, 60_000, now + 60_000).ok).toBe(true);
  });

  it("counts each key separately", () => {
    rateLimit("a", 1, 60_000);
    expect(rateLimit("b", 1, 60_000).ok).toBe(true);
  });
});
