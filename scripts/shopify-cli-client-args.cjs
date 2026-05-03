/**
 * Shopify Custom / public apps: **Client ID equals API Key** in Partners.
 * Passing `--client-id` from `.env` lets CLI use an app YOUR `shopify auth login`
 * session can access, overriding a stale client_id inside shopify.app*.toml.
 */
"use strict";

require("./shopify-env-from-dotfile.cjs").loadDotEnvSafe();

/**
 * @param {string[]} argv tail args (often process.argv.slice(2))
 */
function argvHasClientId(argv) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--client-id" || a.startsWith("--client-id=")) {
      return true;
    }
  }
  return false;
}

function clientIdExtraArgs(argv) {
  if (argvHasClientId(argv)) {
    return [];
  }
  const id = (process.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_API_KEY || "").trim();
  return id ? ["--client-id", id] : [];
}

module.exports = { argvHasClientId, clientIdExtraArgs };
