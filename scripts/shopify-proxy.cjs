#!/usr/bin/env node
/**
 * Drop-in shim for Shopify CLI (`shopify`). For `shopify app dev`, injects `--client-id`
 * from `.env` (SHOPIFY_API_KEY or SHOPIFY_CLIENT_ID) when not already supplied.
 *
 * Use from project root:
 *   npm run shopify -- app dev
 *   .\shopify.cmd app dev --theme-app-extension-port 9295
 */
"use strict";

require("./shopify-env-from-dotfile.cjs").loadDotEnvSafe();

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { clientIdExtraArgs } = require("./shopify-cli-client-args.cjs");

const argv = process.argv.slice(2);

function resolveGlobalShopifyExecutable() {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA?.trim();
    if (appData) {
      const globalCmd = path.join(appData, "npm", "shopify.cmd");
      if (fs.existsSync(globalCmd)) return globalCmd;
    }
  }
  return "shopify";
}

function reshapeForAppDev() {
  if (argv[0] !== "app" || argv[1] !== "dev") {
    return argv;
  }
  const tail = argv.slice(2);
  return ["app", "dev", ...clientIdExtraArgs(tail), ...tail];
}

const finalArgv = reshapeForAppDev();

const result = spawnSync(resolveGlobalShopifyExecutable(), finalArgv, {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status === null ? 1 : result.status);
