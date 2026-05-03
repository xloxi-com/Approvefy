#!/usr/bin/env node
/**
 * Run the Remix/React Router stack on localhost WITHOUT `shopify app dev`.
 * Use this when Shopify CLI fails with "No app with client ID … found" (Partners auth / permission).
 *
 * Embedded admin + OAuth still need SHOPIFY_API_KEY, SHOPIFY_API_SECRET, and matching URLs in Shopify Partners.
 * Full tunnel + theme extension preview: fix login (`shopify auth login`) then run `npm run dev` or `shopify app dev`.
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const port = process.env.PORT || "8099";
const hostUrl = process.env.SHOPIFY_APP_URL || `http://127.0.0.1:${port}`;

const env = {
  ...process.env,
  PORT: port,
  SHOPIFY_APP_URL: hostUrl,
};

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    env,
  });
  if (result.status !== 0 && result.status != null) {
    process.exit(result.status);
  }
}

const root = path.join(__dirname, "..");
run(process.execPath, [path.join(root, "scripts", "prisma-generate-safe.cjs")]);
run("npx", ["prisma", "migrate", "deploy"]);
run("npm", ["exec", "react-router", "dev"]);
