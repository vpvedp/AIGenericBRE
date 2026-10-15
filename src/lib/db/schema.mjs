// Database tables, shared by the app (src/lib/db/index.ts) and the command-line
// scripts (scripts/db-user.mjs). Plain .mjs so both TypeScript and Node can import it.
//
// Every statement is idempotent ("IF NOT EXISTS"), so it is safe to run on
// every cold start — that is how the tables get created the first time.

export const SCHEMA_SQL = [
  // Sign-in accounts. Passwords are stored only as scrypt hashes (same format
  // as APP_USERS), never as plain text.
  `CREATE TABLE IF NOT EXISTS app_users (
     employee_id  TEXT PRIMARY KEY,
     salt         TEXT NOT NULL,
     hash         TEXT NOT NULL,
     display_name TEXT,
     active       BOOLEAN NOT NULL DEFAULT TRUE,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  // Business rules. The whole rule object is kept as JSONB, exactly as the
  // Rule Builder produces it, so the UI and the engine need no changes.
  // `seq` keeps the original order when many rules are saved at once.
  `CREATE TABLE IF NOT EXISTS rules (
     id         TEXT PRIMARY KEY,
     data       JSONB NOT NULL,
     seq        BIGSERIAL,
     updated_by TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
];
