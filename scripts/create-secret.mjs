// Prints a random SESSION_SECRET (64 hex characters). Run once per environment:
//   node scripts/create-secret.mjs
import { randomBytes } from "node:crypto";
console.log(randomBytes(32).toString("hex"));
