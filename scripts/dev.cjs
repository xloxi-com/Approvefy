#!/usr/bin/env node
// `npm run dev:shopify` — requires Shopify Partners CLI access.
// If `.env` SHOPIFY_API_KEY (or SHOPIFY_CLIENT_ID) is an app YOUR login owns, it overrides stale shopify.app*.toml client_id.
// For localhost without tunnel: `npm run dev`
// Wrapper shifts theme extension dev server to port 9295 when default clashes.
const { spawn, execSync } = require("child_process");
const { clientIdExtraArgs } = require("./shopify-cli-client-args.cjs");

// Run prisma generate first (before any process locks the file - fixes EPERM on Windows)
try {
  execSync("npx prisma generate", { stdio: "inherit" });
} catch (_) {
  // Continue - client might already exist
}

const cliTail = clientIdExtraArgs([]);

const proc = spawn(
  "shopify",
  [
    "app",
    "dev",
    ...cliTail,
    "--store",
    "test-kqnmlfaz.myshopify.com",
    "--theme-app-extension-port",
    "9295",
  ],
  { stdio: "inherit", shell: true }
);

proc.on("exit", (code) => process.exit(code ?? 0));
