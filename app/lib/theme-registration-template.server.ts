import {
  REGISTRATION_FORM_BLOCK_HANDLE,
  THEME_EXTENSION_HANDLE,
} from "./theme-extension-setup-status";

const REGISTRATION_PAGE_HANDLE = "customer-registration";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const REGISTRATION_PAGE_TEMPLATE = `page.${REGISTRATION_PAGE_HANDLE}`;
const REGISTRATION_PAGE_TEMPLATE_FILE = `templates/${REGISTRATION_PAGE_TEMPLATE}.json`;

function stripJsonComments(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").trim();
}

function decodeThemeFileBody(body: { content?: string; contentBase64?: string } | undefined): string {
  if (!body) return "";
  if (typeof body.content === "string" && body.content.length > 0) return body.content;
  if (typeof body.contentBase64 === "string" && body.contentBase64.length > 0) {
    try {
      return Buffer.from(body.contentBase64, "base64").toString("utf8");
    } catch {
      return "";
    }
  }
  return "";
}

const DEFAULT_REGISTRATION_EXTENSION_UID = "3652577f-2032-d1e3-5a01-bb879c40fe5c31a53853";

function registrationFormBlockType(): string {
  const apiKey = (process.env.SHOPIFY_API_KEY || "").trim();
  const extensionUid =
    (process.env.SHOPIFY_REGISTRATION_EXTENSION_UID || "").trim() ||
    DEFAULT_REGISTRATION_EXTENSION_UID;
  if (apiKey && extensionUid) {
    return `shopify://apps/${apiKey}/blocks/${REGISTRATION_FORM_BLOCK_HANDLE}/${extensionUid}`;
  }
  return `shopify://apps/${THEME_EXTENSION_HANDLE}/blocks/${REGISTRATION_FORM_BLOCK_HANDLE}`;
}

function buildRegistrationPageTemplateJson(): string {
  const blockId = "approvefy_registration_form";
  const blockType = registrationFormBlockType();
  const payload = {
    sections: {
      main: {
        type: "main-page",
        blocks: {
          [blockId]: {
            type: blockType,
            settings: {
              heading: "Create Account",
              description: "Please fill out the information below to create your account.",
              form_id: "",
            },
          },
        },
        block_order: [blockId],
        settings: {
          padding_top: 28,
          padding_bottom: 28,
        },
      },
    },
    order: ["main"],
  };
  return JSON.stringify(payload, null, 2);
}

async function getMainThemeId(admin: AdminGraphqlClient): Promise<string | null> {
  const res = await admin.graphql(`#graphql
    query ApprovefyMainThemeId {
      themes(first: 1, roles: [MAIN]) {
        nodes {
          id
        }
      }
    }
  `);
  const json = (await res.json()) as {
    data?: { themes?: { nodes?: Array<{ id?: string }> } };
    errors?: unknown;
  };
  if (json.errors) {
    console.warn("[ThemeRegistrationTemplate] themes query failed:", json.errors);
    return null;
  }
  return json.data?.themes?.nodes?.[0]?.id ?? null;
}

async function readThemeFile(
  admin: AdminGraphqlClient,
  themeId: string,
  filename: string,
): Promise<string | null> {
  const res = await admin.graphql(
    `#graphql
    query ApprovefyThemeFile($themeId: ID!, $filenames: [String!]!) {
      theme(id: $themeId) {
        files(filenames: $filenames) {
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
    }`,
    { variables: { themeId, filenames: [filename] } },
  );
  const json = (await res.json()) as {
    data?: {
      theme?: {
        files?: {
          nodes?: Array<{ filename?: string; body?: { content?: string; contentBase64?: string } }>;
        };
      };
    };
    errors?: unknown;
  };
  if (json.errors) {
    console.warn("[ThemeRegistrationTemplate] theme file read failed:", filename, json.errors);
    return null;
  }
  const node = json.data?.theme?.files?.nodes?.[0];
  return decodeThemeFileBody(node?.body) || null;
}

function templateHasRegistrationFormBlock(raw: string): boolean {
  try {
    const json = JSON.parse(stripJsonComments(raw)) as Record<string, unknown>;
    const found: unknown[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      const obj = node as Record<string, unknown>;
      if (typeof obj.type === "string" && obj.type.includes(REGISTRATION_FORM_BLOCK_HANDLE)) {
        found.push(obj);
      }
      for (const value of Object.values(obj)) walk(value);
    };
    walk(json);
    return found.length > 0;
  } catch {
    return false;
  }
}

/**
 * Creates templates/page.customer-registration.json on the live theme when permitted.
 * Requires write_themes (and Shopify theme exemption for public apps). Fails silently otherwise.
 */
export async function ensureRegistrationPageThemeTemplate(
  admin: AdminGraphqlClient,
): Promise<{ created: boolean; templateReady: boolean }> {
  const fallback = { created: false, templateReady: false };
  try {
    const themeId = await getMainThemeId(admin);
    if (!themeId) return fallback;

    const existing = await readThemeFile(admin, themeId, REGISTRATION_PAGE_TEMPLATE_FILE);
    if (existing && templateHasRegistrationFormBlock(existing)) {
      return { created: false, templateReady: true };
    }

    const templateBody = existing?.trim() ? existing : buildRegistrationPageTemplateJson();
    const res = await admin.graphql(
      `#graphql
      mutation ApprovefyUpsertRegistrationPageTemplate($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
        themeFilesUpsert(themeId: $themeId, files: $files) {
          upsertedThemeFiles {
            filename
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          themeId,
          files: [
            {
              filename: REGISTRATION_PAGE_TEMPLATE_FILE,
              body: { type: "TEXT", value: templateBody },
            },
          ],
        },
      },
    );
    const json = (await res.json()) as {
      data?: {
        themeFilesUpsert?: {
          upsertedThemeFiles?: Array<{ filename?: string }>;
          userErrors?: Array<{ message?: string }>;
        };
      };
      errors?: unknown;
    };
    if (json.errors) {
      console.warn("[ThemeRegistrationTemplate] themeFilesUpsert GraphQL errors:", json.errors);
      return fallback;
    }
    const userErrors = json.data?.themeFilesUpsert?.userErrors ?? [];
    if (userErrors.length > 0) {
      console.warn("[ThemeRegistrationTemplate] themeFilesUpsert userErrors:", userErrors);
      return fallback;
    }
    const upserted = json.data?.themeFilesUpsert?.upsertedThemeFiles ?? [];
    return {
      created: upserted.some((f) => f.filename === REGISTRATION_PAGE_TEMPLATE_FILE),
      templateReady: upserted.length > 0 || !!existing,
    };
  } catch (error) {
    console.warn("[ThemeRegistrationTemplate] ensureRegistrationPageThemeTemplate failed:", error);
    return fallback;
  }
}

export { REGISTRATION_PAGE_TEMPLATE, REGISTRATION_PAGE_TEMPLATE_FILE };
