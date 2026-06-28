#!/usr/bin/env node
/**
 * Prints .env keys that must be copied into Vercel → Settings → Environment Variables.
 * .env is gitignored — git push alone does NOT deploy secrets to production.
 */
const fs = require("node:fs");
const path = require("node:path");

const envPath = path.join(process.cwd(), ".env");
if (!fs.existsSync(envPath)) {
  console.error("No .env file found. Copy .env.example to .env first.");
  process.exit(1);
}

const REQUIRED = [
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SCOPES",
  "SHOPIFY_APP_URL",
  "DATABASE_URL",
  "DIRECT_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_UPLOAD_BUCKET",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
];

const raw = fs.readFileSync(envPath, "utf8");
const values = {};
for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  values[key] = val;
}

console.log("\n=== Vercel Environment Variables (Production + Preview) ===\n");
console.log("Git push does NOT upload .env. Add each variable in:");
console.log("  https://vercel.com → your project → Settings → Environment Variables\n");

let missing = 0;
for (const key of REQUIRED) {
  const val = values[key];
  if (!val) {
    console.log(`  [MISSING] ${key}`);
    missing++;
    continue;
  }
  const preview =
    key.includes("SECRET") || key.includes("KEY") || key.includes("URL")
      ? `${val.slice(0, 12)}… (${val.length} chars)`
      : val.length > 60
        ? `${val.slice(0, 60)}…`
        : val;
  console.log(`  [OK] ${key} = ${preview}`);
}

if (values.DATABASE_URL && !values.DATABASE_URL.includes(":6543")) {
  console.log("\n  [WARN] DATABASE_URL should use Supabase pooler port 6543 for Vercel.");
}
if (values.DATABASE_URL && !values.DATABASE_URL.includes("pgbouncer=true")) {
  console.log("\n  [WARN] DATABASE_URL should include ?pgbouncer=true for Vercel.");
}

console.log("\nAfter saving env vars in Vercel, redeploy (Deployments → Redeploy).\n");
if (missing) process.exit(1);
