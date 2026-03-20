#!/usr/bin/env node
// Wrapper so theme app extension uses port 9294 (avoids EADDRINUSE when 9293 is in use)
const { spawn, execSync } = require("child_process");

// Run prisma generate first (before any process locks the file - fixes EPERM on Windows)
try {
  execSync("npx prisma generate", { stdio: "inherit" });
} catch (_) {
  // Continue - client might already exist
}

const proc = spawn(
  "shopify",
  ["app", "dev", "--theme-app-extension-port", "9295"],
  { stdio: "inherit", shell: true }
);

proc.on("exit", (code) => process.exit(code ?? 0));
