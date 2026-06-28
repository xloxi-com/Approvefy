import {
  APP_EMBED_BLOCK_HANDLE,
  blockTypeMatchesApprovefyBlock,
} from "./theme-extension-setup-status";
import {
  getMainThemeId,
  readThemeFile,
  upsertThemeFileByFilename,
} from "./theme-registration-template.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const SETTINGS_DATA_FILE = "config/settings_data.json";
const APP_EMBED_BLOCK_ID = "approvefy_app_embed";
const DEFAULT_EXTENSION_UID = "3652577f-2032-d1e3-5a01-bb879c40fe5c31a53853";

function stripJsonComments(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").trim();
}

function appEmbedBlockType(): string {
  const apiKey = (process.env.SHOPIFY_API_KEY || "").trim();
  const extensionUid =
    (process.env.SHOPIFY_REGISTRATION_EXTENSION_UID || "").trim() ||
    DEFAULT_EXTENSION_UID;
  if (apiKey && extensionUid) {
    return `shopify://apps/${apiKey}/blocks/${APP_EMBED_BLOCK_HANDLE}/${extensionUid}`;
  }
  return `shopify://apps/registration-form/blocks/${APP_EMBED_BLOCK_HANDLE}`;
}

function appEmbedBlockPayload(): {
  type: string;
  disabled: boolean;
  settings: {
    enable_custom_registration: boolean;
    pending_message: string;
    pending_message_fr: string;
    form_id: string;
  };
} {
  return {
    type: appEmbedBlockType(),
    disabled: false,
    settings: {
      enable_custom_registration: true,
      pending_message:
        "Thank you for registering! Your account is pending approval. You will receive an email once approved.",
      pending_message_fr:
        "Merci pour votre inscription ! Votre compte est en attente d'approbation. Vous recevrez un e-mail une fois approuvé.",
      form_id: "",
    },
  };
}

function readSettingsBlocks(settingsData: Record<string, unknown>): Record<string, unknown> | null {
  const current = settingsData.current as Record<string, unknown> | undefined;
  if (current?.blocks && typeof current.blocks === "object") {
    return current.blocks as Record<string, unknown>;
  }
  if (settingsData.blocks && typeof settingsData.blocks === "object") {
    return settingsData.blocks as Record<string, unknown>;
  }
  return null;
}

function settingsBlocksRoot(
  settingsData: Record<string, unknown>,
): Record<string, unknown> {
  if (!settingsData.current || typeof settingsData.current !== "object") {
    settingsData.current = {};
  }
  const current = settingsData.current as Record<string, unknown>;
  if (!current.blocks || typeof current.blocks !== "object") {
    current.blocks = {};
  }
  return current.blocks as Record<string, unknown>;
}

function hasActiveAppEmbedInSettings(settingsData: Record<string, unknown> | null): boolean {
  if (!settingsData) return false;
  const blocks = readSettingsBlocks(settingsData);
  if (!blocks) return false;
  for (const block of Object.values(blocks)) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (
      blockTypeMatchesApprovefyBlock(b.type, APP_EMBED_BLOCK_HANDLE) &&
      b.disabled !== true
    ) {
      return true;
    }
  }
  return false;
}

function mergeAppEmbedIntoSettingsData(settingsRaw: string): string | null {
  try {
    const parsed = JSON.parse(stripJsonComments(settingsRaw)) as Record<string, unknown>;
    const blocks = settingsBlocksRoot(parsed);
    const payload = appEmbedBlockPayload();

    let existingKey: string | null = null;
    for (const [key, block] of Object.entries(blocks)) {
      if (!block || typeof block !== "object") continue;
      if (blockTypeMatchesApprovefyBlock((block as Record<string, unknown>).type, APP_EMBED_BLOCK_HANDLE)) {
        existingKey = key;
        break;
      }
    }

    if (existingKey) {
      const existing = blocks[existingKey] as Record<string, unknown>;
      blocks[existingKey] = {
        ...existing,
        ...payload,
        settings: {
          ...(typeof existing.settings === "object" && existing.settings
            ? (existing.settings as Record<string, unknown>)
            : {}),
          ...payload.settings,
        },
      };
    } else {
      blocks[APP_EMBED_BLOCK_ID] = payload;
    }

    return JSON.stringify(parsed, null, 2);
  } catch (error) {
    console.warn("[ThemeAppEmbed] mergeAppEmbedIntoSettingsData failed:", error);
    return null;
  }
}

export type EnsureAppEmbedResult = {
  enabled: boolean;
  writeFailed: boolean;
};

/**
 * Enables the Approvefy app embed in config/settings_data.json on the live theme.
 * Requires write_themes (and theme file exemption for App Store apps).
 */
export async function ensureAppEmbedEnabled(
  admin: AdminGraphqlClient,
): Promise<EnsureAppEmbedResult> {
  const fallback: EnsureAppEmbedResult = { enabled: false, writeFailed: true };
  try {
    const themeId = await getMainThemeId(admin);
    if (!themeId) return fallback;

    const existingRaw = await readThemeFile(admin, themeId, SETTINGS_DATA_FILE);
    if (!existingRaw?.trim()) {
      console.warn("[ThemeAppEmbed] settings_data.json not found or empty");
      return fallback;
    }

    const parsed = JSON.parse(stripJsonComments(existingRaw)) as Record<string, unknown>;
    if (hasActiveAppEmbedInSettings(parsed)) {
      return { enabled: true, writeFailed: false };
    }

    const merged = mergeAppEmbedIntoSettingsData(existingRaw);
    if (!merged) return fallback;

    const upsert = await upsertThemeFileByFilename(admin, themeId, SETTINGS_DATA_FILE, merged);
    if (!upsert.ok) {
      return fallback;
    }

    const written = await readThemeFile(admin, themeId, SETTINGS_DATA_FILE);
    if (!written?.trim()) {
      return fallback;
    }
    const verified = JSON.parse(stripJsonComments(written)) as Record<string, unknown>;
    const enabled = hasActiveAppEmbedInSettings(verified);
    return { enabled, writeFailed: !enabled };
  } catch (error) {
    console.warn("[ThemeAppEmbed] ensureAppEmbedEnabled failed:", error);
    return fallback;
  }
}

export function buildAppEmbedThemeEditorUrl(shop: string): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
  const apiKey = (process.env.SHOPIFY_API_KEY || "").trim();
  const params = ["context=apps"];
  if (apiKey.length > 0) {
    params.push(`activateAppId=${encodeURIComponent(`${apiKey}/${APP_EMBED_BLOCK_HANDLE}`)}`);
  }
  return `https://admin.shopify.com/store/${storeHandle}/themes/current/editor?${params.join("&")}`;
}
