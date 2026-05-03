#!/usr/bin/env node
/**
 * Runs `shopify app config link` and optionally injects `--client-id` from SHOPIFY_CLIENT_ID.
 *
 * Before running: shopify auth login (Partners account that owns the app.)
 *
 * Examples:
 *   npm run config:link
 *   npm run config:link:approvefy
 *   $env:SHOPIFY_CLIENT_ID="YOUR_CLIENT_ID"; npm run config:link:approvefy
 *   npm run config:link -- --client-id YOUR_CLIENT_ID -c approvefy
 */
const { spawnSync } = require("node:child_process");

const userArgs = process.argv.slice(2);

function includesClientIdFlag(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--client-id" || a.startsWith("--client-id=")) {
      return true;
    }
  }
  return false;
}

const fromEnv = process.env.SHOPIFY_CLIENT_ID;
const args = ["app", "config", "link", ...userArgs];
if (fromEnv && !includesClientIdFlag(userArgs)) {
  args.push("--client-id", fromEnv);
}

const result = spawnSync("shopify", args, {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status === null ? 1 : result.status);
