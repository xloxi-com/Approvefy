#!/usr/bin/env node
const { execSync } = require("node:child_process");

// Vercel runs `prisma generate` once in vercel-build — skip duplicate postinstall work.
if (process.env.VERCEL === "1") {
  process.exit(0);
}

try {
  const stdio = process.env.VERCEL === "1" ? "inherit" : ["ignore", "pipe", "pipe"];
  execSync("npx prisma generate", { stdio });
} catch (error) {
  const stdout = error && error.stdout ? String(error.stdout) : "";
  const stderr = error && error.stderr ? String(error.stderr) : "";
  const message = error instanceof Error ? error.message : "";
  const combined = `${stdout}\n${stderr}\n${message}`;

  if (!combined.includes("EPERM")) {
    process.stderr.write(combined);
  }
  // Ignore locked engine errors on Windows; existing client can still be used.
}
