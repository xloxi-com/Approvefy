import { REGISTRATION_PAGE_HANDLE } from "./registration-page.constants";
import {
  APP_EMBED_BLOCK_HANDLE,
  blockTypeMatchesApprovefyBlock,
  REGISTRATION_FORM_BLOCK_HANDLE,
} from "./theme-extension-setup-status";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type ThemeSetupStatus = {
  appEmbedEnabled: boolean;
  registrationFormBlockOnPage: boolean;
  /** Registration Form block is on templates/page.json (Default page) — wrong placement */
  registrationFormOnDefaultPage: boolean;
  /** templates/page.customer-registration.json exists on the published theme */
  registrationPageTemplateExists: boolean;
  /** Published (MAIN) theme GID — use for theme editor deep links */
  mainThemeId: string | null;
  themeCheckAvailable: boolean;
};

function stripJsonComments(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").trim();
}

function decodeThemeFileBody(body: { content?: string; contentBase64?: string } | undefined): string {
  if (!body) return "";
  if (typeof body.content === "string" && body.content.length > 0) {
    return body.content;
  }
  if (typeof body.contentBase64 === "string" && body.contentBase64.length > 0) {
    try {
      return Buffer.from(body.contentBase64, "base64").toString("utf8");
    } catch {
      return "";
    }
  }
  return "";
}

function parseThemeJson(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw || !raw.trim()) return null;
  try {
    return JSON.parse(stripJsonComments(raw)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function collectMatchingBlocks(
  node: unknown,
  blockHandle: string,
  found: Array<{ disabled?: boolean }>,
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectMatchingBlocks(item, blockHandle, found);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (blockTypeMatchesApprovefyBlock(obj.type, blockHandle)) {
    found.push({ disabled: obj.disabled as boolean | undefined });
  }
  for (const value of Object.values(obj)) {
    collectMatchingBlocks(value, blockHandle, found);
  }
}

function hasActiveBlockInJson(json: Record<string, unknown> | null, blockHandle: string): boolean {
  if (!json) return false;
  const found: Array<{ disabled?: boolean }> = [];
  collectMatchingBlocks(json, blockHandle, found);
  return found.some((b) => b.disabled !== true);
}

function settingsBlocks(settingsData: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!settingsData) return null;
  const current = settingsData.current as Record<string, unknown> | undefined;
  if (current?.blocks && typeof current.blocks === "object") {
    return current.blocks as Record<string, unknown>;
  }
  if (settingsData.blocks && typeof settingsData.blocks === "object") {
    return settingsData.blocks as Record<string, unknown>;
  }
  return null;
}

function hasActiveAppEmbed(settingsData: Record<string, unknown> | null): boolean {
  const blocks = settingsBlocks(settingsData);
  if (!blocks) return false;
  for (const block of Object.values(blocks)) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (blockTypeMatchesApprovefyBlock(b.type, APP_EMBED_BLOCK_HANDLE) && b.disabled !== true) {
      return true;
    }
  }
  return false;
}

const MAIN_THEME_SETUP_FILES_QUERY = `#graphql
  query ApprovefyMainThemeSetupFiles {
    themes(first: 1, roles: [MAIN]) {
      nodes {
        id
        role
        files(
          filenames: [
            "config/settings_data.json",
            "templates/page.${REGISTRATION_PAGE_HANDLE}.json",
            "templates/page.json"
          ]
          first: 3
        ) {
          nodes {
            filename
            body {
              ... on OnlineStoreThemeFileBodyText {
                content
              }
              ... on OnlineStoreThemeFileBodyBase64 {
                contentBase64
              }
            }
          }
        }
      }
    }
  }
`;

type ThemeFileNode = {
  filename?: string;
  body?: { content?: string; contentBase64?: string };
};

function readThemeFiles(fileNodes: ThemeFileNode[]) {
  let settingsData: Record<string, unknown> | null = null;
  let dedicatedPageTemplate: Record<string, unknown> | null = null;
  let defaultPageTemplate: Record<string, unknown> | null = null;

  for (const file of fileNodes) {
    const content = decodeThemeFileBody(file.body);
    const filename = file.filename ?? "";
    if (filename === "config/settings_data.json") {
      settingsData = parseThemeJson(content);
    } else if (filename === `templates/page.${REGISTRATION_PAGE_HANDLE}.json`) {
      dedicatedPageTemplate = parseThemeJson(content);
    } else if (filename === "templates/page.json") {
      defaultPageTemplate = parseThemeJson(content);
    }
  }

  return { settingsData, dedicatedPageTemplate, defaultPageTemplate };
}

/**
 * Reads the published (MAIN) theme only — draft/dev themes must not mark onboarding complete.
 * Requires read_themes. Prefer merging with shopify.app.extensions() on the client when embedded.
 */
export async function getThemeSetupStatus(admin: AdminGraphqlClient): Promise<ThemeSetupStatus> {
  const fallback: ThemeSetupStatus = {
    appEmbedEnabled: false,
    registrationFormBlockOnPage: false,
    registrationFormOnDefaultPage: false,
    registrationPageTemplateExists: false,
    mainThemeId: null,
    themeCheckAvailable: false,
  };

  try {
    const res = await admin.graphql(MAIN_THEME_SETUP_FILES_QUERY);
    const json = (await res.json()) as {
      data?: {
        themes?: {
          nodes?: Array<{
            id?: string;
            role?: string;
            files?: { nodes?: ThemeFileNode[] };
          }>;
        };
      };
      errors?: Array<{ message?: string; extensions?: { code?: string } }>;
    };

    if (json.errors?.length) {
      const denied = json.errors.some(
        (e) =>
          /access denied|required access|not authorized|scope/i.test(e.message ?? "") ||
          e.extensions?.code === "ACCESS_DENIED",
      );
      console.warn("[ThemeSetupStatus] GraphQL errors:", json.errors);
      return denied ? fallback : { ...fallback, themeCheckAvailable: true };
    }

    const themeNodes = json.data?.themes?.nodes ?? [];
    if (!themeNodes.length) {
      return { ...fallback, themeCheckAvailable: true };
    }

    let appEmbedEnabled = false;
    let registrationFormBlockOnPage = false;
    let registrationFormOnDefaultPage = false;
    let registrationPageTemplateExists = false;
    let mainThemeId: string | null = themeNodes[0]?.id ?? null;

    for (const theme of themeNodes) {
      if (theme.id && !mainThemeId) {
        mainThemeId = theme.id;
      }
      const parsed = readThemeFiles(theme.files?.nodes ?? []);
      if (hasActiveAppEmbed(parsed.settingsData)) {
        appEmbedEnabled = true;
      }
      if (parsed.dedicatedPageTemplate) {
        registrationPageTemplateExists = true;
        const dedicatedSections = parsed.dedicatedPageTemplate.sections as
          | Record<string, { type?: string; blocks?: Record<string, unknown> }>
          | undefined;
        if (dedicatedSections) {
          const appsSections = Object.fromEntries(
            Object.entries(dedicatedSections).filter(([, section]) => section?.type === "apps"),
          );
          registrationFormBlockOnPage = hasActiveBlockInJson(
            { sections: appsSections },
            REGISTRATION_FORM_BLOCK_HANDLE,
          );
        }
      }
      if (hasActiveBlockInJson(parsed.defaultPageTemplate, REGISTRATION_FORM_BLOCK_HANDLE)) {
        registrationFormOnDefaultPage = true;
      }
    }

    return {
      appEmbedEnabled,
      registrationFormBlockOnPage,
      registrationFormOnDefaultPage,
      registrationPageTemplateExists,
      mainThemeId,
      themeCheckAvailable: true,
    };
  } catch (error) {
    console.warn("[ThemeSetupStatus] Failed to read theme files:", error);
    return fallback;
  }
}
