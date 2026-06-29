import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const REGISTRATION_TEMPLATE_ONLY = "templates/page.customer-registration.json";
const REGISTRATION_THEME_PATH = path.join(process.cwd(), "theme", "approvefy-registration");

/** Shopify CLI theme push — works in local dev when `shopify` CLI is installed and authenticated. */
export function canUseThemeCliPush(): boolean {
  if (process.env.APPROVEFY_THEME_CLI_PUSH === "false") return false;
  if (process.env.APPROVEFY_THEME_CLI_PUSH === "true") return true;

  // Serverless cannot spawn Shopify CLI.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return false;

  // `shopify app dev` (see .env SHOPIFY_FLAG_THEME_APP_EXTENSION_PORT).
  if (process.env.SHOPIFY_FLAG_THEME_APP_EXTENSION_PORT?.trim()) return true;

  // Local machine with Shopify CLI installed — works even when SHOPIFY_APP_URL points at production.
  if (resolveShopifyCliBin()) return true;

  const appUrl = (process.env.SHOPIFY_APP_URL || process.env.HOST || "").toLowerCase();
  return (
    process.env.NODE_ENV !== "production" ||
    appUrl.includes("localhost") ||
    appUrl.includes("127.0.0.1") ||
    appUrl.includes("trycloudflare.com") ||
    appUrl.includes("ngrok")
  );
}

const CLI_PUSH_TIMEOUT_MS = 60_000;
const CLI_PUSH_QUICK_TIMEOUT_MS = 45_000;

export { CLI_PUSH_TIMEOUT_MS, CLI_PUSH_QUICK_TIMEOUT_MS };

/** Resolve @shopify/cli/bin/run.js — spawn via Node (Windows-safe; raw `shopify` / npm often hang). */
export function resolveShopifyCliBin(): string | null {
  const fromEnv = process.env.APPROVEFY_SHOPIFY_CLI_BIN?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const candidates: string[] = [
    path.join(process.cwd(), "node_modules", "@shopify", "cli", "bin", "run.js"),
  ];

  if (process.platform === "win32") {
    const appData = process.env.APPDATA?.trim();
    if (appData) {
      candidates.push(path.join(appData, "npm", "node_modules", "@shopify", "cli", "bin", "run.js"));
    }
  } else {
    candidates.push("/usr/local/lib/node_modules/@shopify/cli/bin/run.js");
    const home = process.env.HOME?.trim();
    if (home) {
      candidates.push(path.join(home, ".npm-global", "lib", "node_modules", "@shopify", "cli", "bin", "run.js"));
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Resolve how to invoke Shopify CLI for theme push (global CLI → local @shopify/cli — never project shopify.cmd shim). */
export function resolveShopifyThemePushCommand(): {
  executable: string;
  baseArgs: string[];
  useShell: boolean;
} {
  const cliBin = resolveShopifyCliBin();
  if (cliBin) {
    return { executable: process.execPath, baseArgs: [cliBin], useShell: false };
  }

  if (process.platform === "win32") {
    const appData = process.env.APPDATA?.trim();
    if (appData) {
      const globalShopifyCmd = path.join(appData, "npm", "shopify.cmd");
      if (fs.existsSync(globalShopifyCmd)) {
        return { executable: globalShopifyCmd, baseArgs: [], useShell: true };
      }
    }
  }

  return { executable: "shopify", baseArgs: [], useShell: true };
}

export async function pushRegistrationTemplateViaCli(
  shop: string,
  themeNumericId: string,
  opts?: { timeoutMs?: number },
): Promise<{ ok: boolean; error?: string }> {
  if (!canUseThemeCliPush()) {
    return { ok: false, error: "Theme CLI push is disabled in production" };
  }
  if (!themeNumericId?.trim()) {
    return { ok: false, error: "Missing theme id" };
  }

  const cliBin = resolveShopifyCliBin();
  const invoker = resolveShopifyThemePushCommand();
  if (!invoker.useShell && !cliBin) {
    return {
      ok: false,
      error: "Shopify CLI not found — install @shopify/cli globally or set APPROVEFY_SHOPIFY_CLI_BIN",
    };
  }

  const store = shop.replace(/\.myshopify\.com$/i, "");
  const storeHost = `${store}.myshopify.com`;
  const timeoutMs = opts?.timeoutMs ?? CLI_PUSH_TIMEOUT_MS;

  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    const pushArgs = [
      ...invoker.baseArgs,
      "theme",
      "push",
      "--store",
      storeHost,
      "--theme",
      themeNumericId,
      "--allow-live",
      "--only",
      REGISTRATION_TEMPLATE_ONLY,
      "--path",
      REGISTRATION_THEME_PATH,
      "--force",
    ];

    const child = spawn(invoker.executable, pushArgs, {
      cwd: process.cwd(),
      windowsHide: true,
      shell: invoker.useShell,
      env: {
        ...process.env,
        CI: "1",
        NO_COLOR: "1",
        FORCE_COLOR: "0",
      },
    });

    let output = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      output += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      output += String(chunk);
    });

    timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      finish({
        ok: false,
        error: `shopify theme push timed out after ${Math.round(timeoutMs / 1000)}s`,
      });
    }, timeoutMs);

    child.on("error", (err) => {
      finish({ ok: false, error: err.message });
    });

    child.on("close", (code) => {
      if (code === 0) {
        finish({ ok: true });
        return;
      }
      finish({
        ok: false,
        error: output.trim() || `shopify theme push exited with code ${code ?? "unknown"}`,
      });
    });
  });
}

export function themeNumericIdFromGid(themeGid: string | null | undefined): string | null {
  if (!themeGid) return null;
  const match = themeGid.match(/OnlineStoreTheme\/(\d+)/i);
  return match?.[1] ?? null;
}
