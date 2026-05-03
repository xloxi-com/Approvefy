"use strict";

const fs = require("node:fs");
const path = require("node:path");

let loaded = false;

/**
 * Lightweight `.env` reader (no `dotenv` package). Values only applied if missing from process.env.
 */
function loadDotEnvSafe() {
  if (loaded) {
    return;
  }
  loaded = true;

  try {
    const dotenvPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(dotenvPath)) {
      return;
    }
    const raw = fs.readFileSync(dotenvPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq <= 0) {
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        continue;
      }
      if (process.env[key] !== undefined) {
        continue;
      }
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // Ignore unreadable `.env`; CLI may still succeed from shell env vars.
  }
}

module.exports = { loadDotEnvSafe };
