// Manage sign-in users stored in Postgres (the app_users table).
//
//   node scripts/db-user.mjs add EMP002 "a-strong-password" "Kavita Rao"
//   node scripts/db-user.mjs list
//   node scripts/db-user.mjs disable EMP002      (can't sign in any more)
//   node scripts/db-user.mjs enable EMP002
//
// Uses DATABASE_URL from your environment or from .env.local. Users added here
// can sign in immediately — no redeploy needed (unlike APP_USERS).

import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { addUser, ensureSchema, listUsers, setActive } from "../src/lib/db/user-admin.mjs";

function loadEnvLocal() {
  if (process.env.DATABASE_URL || !fs.existsSync(".env.local")) return;
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
    if (m) process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, "");
  }
}

loadEnvLocal();
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local (copy it from Neon or Vercel → Storage).");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const db = (text, params = []) => sql.query(text, params);
const [command, id, password, ...nameParts] = process.argv.slice(2);

try {
  await ensureSchema(db);
  if (command === "add") {
    const saved = await addUser(db, id, password, nameParts.join(" ") || null);
    console.log(`Saved ${saved}. They can sign in now with that password.`);
  } else if (command === "list") {
    const users = await listUsers(db);
    if (users.length === 0) console.log("No users in the database yet.");
    for (const u of users) console.log(`${u.employee_id.padEnd(12)} ${u.active ? "active  " : "DISABLED"} ${u.display_name ?? ""}`);
  } else if (command === "disable" || command === "enable") {
    const found = await setActive(db, id, command === "enable");
    console.log(found ? `${id.toUpperCase()} ${command}d.` : `No user ${id}.`);
  } else {
    console.error('Usage:\n  node scripts/db-user.mjs add <ID> "<password>" [name]\n  node scripts/db-user.mjs list\n  node scripts/db-user.mjs disable|enable <ID>');
    process.exit(1);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
