"use client";

// Browser-side helpers for the server session. The cookie itself is httpOnly,
// so the browser can't read it — it can only ask the server.

export async function signIn(employeeId: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ employeeId, password }),
    });
    const data = await res.json();
    return data.ok ? { ok: true } : { ok: false, error: data.error ?? "Sign-in failed." };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection." };
  }
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}

export async function hasServerSession(): Promise<boolean> {
  try {
    return (await fetch("/api/auth/session", { cache: "no-store" })).ok;
  } catch {
    return false;
  }
}
