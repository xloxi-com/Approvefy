#!/usr/bin/env node
/** Same as `shopify app dev` but injects `--client-id` from SHOPIFY_CLIENT_ID / SHOPIFY_API_KEY when omitted. */
const { spawn } = require("child_process");
const { clientIdExtraArgs } = require("./shopify-cli-client-args.cjs");

const userArgs = process.argv.slice(2);
const args = ["app", "dev", ...clientIdExtraArgs(userArgs), ...userArgs];

const proc = spawn("shopify", args, {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

proc.on("exit", (code) => process.exit(code ?? 0));
