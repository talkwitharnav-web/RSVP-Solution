import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const envPath = process.argv[2];
if (!envPath) {
  throw new Error("Usage: node ensure-session-secret.mjs <path-to-.env.local>");
}

const content = readFileSync(envPath, "utf8");
const existingMatch = content.match(/^SESSION_SECRET=(.*)$/m);
const existing = existingMatch?.[1].trim().replace(/^(['"])(.*)\1$/, "$2") ?? "";

if (Buffer.byteLength(existing) >= 32) {
  console.log("Session secret is configured.");
  process.exit(0);
}

const secret = randomBytes(48).toString("base64url");
const newline = content.includes("\r\n") ? "\r\n" : "\n";
const updated = existingMatch
  ? content.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${secret}`)
  : `${content}${content.length > 0 && !content.endsWith("\n") ? newline : ""}SESSION_SECRET=${secret}${newline}`;

writeFileSync(envPath, updated, "utf8");
console.log("Generated a private local session secret.");