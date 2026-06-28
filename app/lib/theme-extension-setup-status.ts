/** Block / embed filenames from extensions/registration-form/blocks/*.liquid */
export const APP_EMBED_BLOCK_HANDLE = "app-embed";
export const REGISTRATION_FORM_BLOCK_HANDLE = "registration-form";
export const THEME_EXTENSION_HANDLE = "registration-form";

export type ThemeExtensionSetupFlags = {
  appEmbedEnabled: boolean;
  registrationFormBlockOnPage: boolean;
};

function normalizeHandle(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function activationIsActive(status: unknown): boolean {
  return status === "active";
}

function embedTarget(target: unknown): boolean {
  return target === "body" || target === "head" || target === "compliance_head";
}

/**
 * Parse `shopify.app.extensions()` (App Home App API) for theme setup steps.
 * Theme app extension activation data reflects the published theme.
 */
export function parseThemeExtensionSetupStatus(extensions: unknown[]): ThemeExtensionSetupFlags {
  const result: ThemeExtensionSetupFlags = {
    appEmbedEnabled: false,
    registrationFormBlockOnPage: false,
  };

  for (const ext of extensions) {
    if (!ext || typeof ext !== "object") continue;
    const extension = ext as Record<string, unknown>;
    if (extension.type !== "theme_app_extension") continue;

    const activations = extension.activations;
    if (!Array.isArray(activations)) continue;

    for (const activation of activations) {
      if (!activation || typeof activation !== "object") continue;
      const act = activation as Record<string, unknown>;
      if (!activationIsActive(act.status)) continue;

      const handle = normalizeHandle(act.handle);
      const target = act.target;

      if (embedTarget(target) && (handle === APP_EMBED_BLOCK_HANDLE || handle.endsWith("app-embed"))) {
        result.appEmbedEnabled = true;
        continue;
      }

      if (
        target === "section" &&
        (handle === REGISTRATION_FORM_BLOCK_HANDLE || handle.endsWith("registration-form"))
      ) {
        result.registrationFormBlockOnPage = true;
      }
    }
  }

  return result;
}

export function blockTypeMatchesApprovefyBlock(type: unknown, blockHandle: string): boolean {
  if (typeof type !== "string") return false;
  const t = type.toLowerCase();
  const handle = blockHandle.toLowerCase();
  const ext = THEME_EXTENSION_HANDLE.toLowerCase();

  if (t.includes(`apps/${ext}/blocks/${handle}`)) return true;

  const apiKey = (typeof process !== "undefined" ? process.env.SHOPIFY_API_KEY : "") || "";
  if (apiKey && t.includes(`apps/${apiKey.toLowerCase()}/blocks/${handle}`)) return true;

  if (t.startsWith("shopify://apps/") && t.includes(`/blocks/${handle}`)) return true;

  return false;
}
