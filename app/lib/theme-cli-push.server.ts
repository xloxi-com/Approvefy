import { spawn } from "node:child_process";
import path from "node:path";

const REGISTRATION_TEMPLATE_ONLY = "templates/page.customer-registration.json";
const REGISTRATION_THEME_PATH = path.join(process.cwd(), "theme", "approvefy-registration");

/** Shopify CLI theme push (Partners login) — works in local dev when `shopify app dev` is authenticated. */
export function canUseThemeCliPush(): boolean {
  if (process.env.APPROVEFY_THEME_CLI_PUSH === "false") return false;
  if (process.env.APPROVEFY_THEME_CLI_PUSH === "true") return true;

  const appUrl = (process.env.SHOPIFY_APP_URL || process.env.HOST || "").toLowerCase();
  return (
    process.env.NODE_ENV !== "production" ||
    appUrl.includes("localhost") ||
    appUrl.includes("127.0.0.1") ||
    appUrl.includes("trycloudflare.com") ||
    appUrl.includes("ngrok")
  );
}

export async function pushRegistrationTemplateViaCli(
  shop: string,
  themeNumericId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!canUseThemeCliPush()) {
    return { ok: false, error: "Theme CLI push is disabled in production" };
  }
  if (!themeNumericId?.trim()) {
    return { ok: false, error: "Missing theme id" };
  }

  const store = shop.replace(/\.myshopify\.com$/i, "");
  const storeHost = `${store}.myshopify.com`;

  return new Promise((resolve) => {
    const args = [
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

    const child = spawn("shopify", args, {
      shell: true,
      windowsHide: true,
      env: process.env,
    });

    let output = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      output += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      output += String(chunk);
    });

    child.on("error", (err) => {
      resolve({ ok: false, error: err.message });
    });

    child.on("close", (code) => {
      if (code === 0 && /success|upload complete|was pushed successfully/i.test(output)) {
        resolve({ ok: true });
        return;
      }
      resolve({
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
