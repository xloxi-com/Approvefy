import fs from "node:fs";
import path from "node:path";
import {
  REGISTRATION_PAGE_HANDLE,
  REGISTRATION_PAGE_INTRO,
  REGISTRATION_PAGE_TITLE,
} from "./registration-page.constants";
import {
  blockTypeMatchesApprovefyBlock,
  REGISTRATION_FORM_BLOCK_HANDLE,
  THEME_EXTENSION_HANDLE,
} from "./theme-extension-setup-status";
import {
  canUseThemeCliPush,
  isServerlessRuntime,
  pushRegistrationTemplateViaCli,
  resolveThemeCliPushTimeoutMs,
  themeNumericIdFromGid,
} from "./theme-cli-push.server";
import { putThemeAssetViaRest } from "./theme-rest-asset.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const REGISTRATION_PAGE_TEMPLATE = `page.${REGISTRATION_PAGE_HANDLE}`;
const REGISTRATION_PAGE_TEMPLATE_FILE = `templates/${REGISTRATION_PAGE_TEMPLATE}.json`;

function readBundledRegistrationPageTemplate(): string | null {
  try {
    const filePath = path.join(
      process.cwd(),
      "theme",
      "approvefy-registration",
      "templates",
      "page.customer-registration.json",
    );
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8").trim();
    return raw || null;
  } catch {
    return null;
  }
}

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

/** Local dev may skip theme job waits; Vercel/App Store must wait for themeFilesUpsert jobs. */
function resolveThemeTemplateWriteQuick(quick?: boolean): boolean {
  if (isServerlessRuntime()) return false;
  return quick === true;
}

function registrationFormBlockType(explicitType?: string | null): string {
  const fromTheme = (explicitType || "").trim();
  if (fromTheme && blockTypeMatchesApprovefyBlock(fromTheme, REGISTRATION_FORM_BLOCK_HANDLE)) {
    return fromTheme;
  }
  const apiKey = (process.env.SHOPIFY_API_KEY || "").trim();
  const extensionUid =
    (process.env.SHOPIFY_REGISTRATION_EXTENSION_UID || "").trim() ||
    DEFAULT_REGISTRATION_EXTENSION_UID;
  if (apiKey && extensionUid) {
    return `shopify://apps/${apiKey}/blocks/${REGISTRATION_FORM_BLOCK_HANDLE}/${extensionUid}`;
  }
  return `shopify://apps/${THEME_EXTENSION_HANDLE}/blocks/${REGISTRATION_FORM_BLOCK_HANDLE}`;
}

function readRegistrationFormBlockTypeFromJson(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(stripJsonComments(raw)) as {
      sections?: Record<string, { blocks?: Record<string, { type?: string }> }>;
    };
    for (const section of Object.values(parsed.sections ?? {})) {
      for (const block of Object.values(section?.blocks ?? {})) {
        const type = block?.type;
        if (type && blockTypeMatchesApprovefyBlock(type, REGISTRATION_FORM_BLOCK_HANDLE)) {
          return type;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function readRegistrationFormBlockTypeFromTheme(
  admin: AdminGraphqlClient,
  themeId: string,
): Promise<string | null> {
  const dedicated = await readThemeFile(admin, themeId, REGISTRATION_PAGE_TEMPLATE_FILE);
  const fromDedicated = readRegistrationFormBlockTypeFromJson(dedicated);
  if (fromDedicated) return fromDedicated;
  const defaultPage = await readThemeFile(admin, themeId, "templates/page.json");
  return readRegistrationFormBlockTypeFromJson(defaultPage);
}

function dedupeAppsSections(parsed: {
  sections?: Record<
    string,
    {
      type?: string;
      blocks?: Record<string, unknown>;
      block_order?: string[];
      settings?: Record<string, unknown>;
    }
  >;
  order?: string[];
}): void {
  const sections = parsed.sections;
  if (!sections) return;

  const order = Array.isArray(parsed.order) ? [...parsed.order] : Object.keys(sections);
  const appsKeys = order.filter((key) => sections[key]?.type === "apps");
  if (appsKeys.length <= 1) return;

  const primary =
    appsKeys.find((key) => {
      const blocks = sections[key]?.blocks ?? {};
      return Object.values(blocks).some(
        (block) =>
          block &&
          typeof block === "object" &&
          blockTypeMatchesApprovefyBlock(
            (block as { type?: string }).type,
            REGISTRATION_FORM_BLOCK_HANDLE,
          ),
      );
    }) ?? appsKeys[0];

  const primarySection = sections[primary];
  if (!primarySection) return;

  primarySection.blocks = primarySection.blocks ?? {};
  const blockOrder = Array.isArray(primarySection.block_order)
    ? [...primarySection.block_order]
    : [];

  for (const key of appsKeys) {
    if (key === primary) continue;
    const section = sections[key];
    if (!section?.blocks) {
      delete sections[key];
      continue;
    }
    for (const [blockId, block] of Object.entries(section.blocks)) {
      if (!primarySection.blocks[blockId]) {
        primarySection.blocks[blockId] = block;
        if (!blockOrder.includes(blockId)) blockOrder.push(blockId);
      }
    }
    delete sections[key];
  }
  primarySection.block_order = blockOrder;

  const nextOrder: string[] = [];
  let appsInserted = false;
  for (const key of order) {
    if (!sections[key]) continue;
    if (sections[key]?.type === "apps") {
      if (!appsInserted && key === primary) {
        nextOrder.push(primary);
        appsInserted = true;
      }
      continue;
    }
    nextOrder.push(key);
  }
  if (!appsInserted && sections[primary]) {
    const mainIdx = nextOrder.findIndex(
      (key) => sections[key]?.type === "main-page" || key === "main",
    );
    if (mainIdx >= 0) nextOrder.splice(mainIdx + 1, 0, primary);
    else nextOrder.push(primary);
  }
  parsed.order = nextOrder;
}

const REGISTRATION_FORM_BLOCK_ID = "approvefy_registration_form";
export const REGISTRATION_APPS_SECTION_ID = "approvefy_apps";

/** Page title + intro (main-page) must render above the Registration Form apps block. */
function ensureMainPageBeforeAppsSection(parsed: {
  sections?: Record<string, { type?: string }>;
  order?: string[];
}): boolean {
  const sections = parsed.sections;
  if (!sections) return false;

  const sectionKeys = Object.keys(sections);
  const order = Array.isArray(parsed.order) ? [...parsed.order] : sectionKeys;
  const mainKey =
    order.find((key) => sections[key]?.type === "main-page" || key === "main") ??
    sectionKeys.find((key) => sections[key]?.type === "main-page" || key === "main");
  const appsKey =
    order.find((key) => sections[key]?.type === "apps") ??
    sectionKeys.find((key) => sections[key]?.type === "apps");
  if (!mainKey || !appsKey) return false;

  const mainIdx = order.indexOf(mainKey);
  const appsIdx = order.indexOf(appsKey);
  if (mainIdx >= 0 && appsIdx >= 0 && mainIdx < appsIdx) return false;

  const rest = order.filter((key) => key !== mainKey && key !== appsKey);
  parsed.order = [mainKey, appsKey, ...rest];
  return true;
}

function removeRegistrationFormBlocksFromSections(
  sections: Record<
    string,
    {
      type?: string;
      blocks?: Record<string, unknown>;
      block_order?: string[];
    }
  >,
  exceptSectionKey?: string,
): void {
  for (const [sectionKey, section] of Object.entries(sections)) {
    if (sectionKey === exceptSectionKey || !section?.blocks) continue;
    const removeIds: string[] = [];
    for (const [blockId, block] of Object.entries(section.blocks)) {
      const blockType =
        block && typeof block === "object" ? (block as { type?: string }).type : undefined;
      if (
        blockId === REGISTRATION_FORM_BLOCK_ID ||
        (typeof blockType === "string" && blockType.includes(REGISTRATION_FORM_BLOCK_HANDLE))
      ) {
        removeIds.push(blockId);
      }
    }
    if (removeIds.length === 0) continue;
    for (const id of removeIds) {
      delete section.blocks[id];
    }
    if (Array.isArray(section.block_order)) {
      section.block_order = section.block_order.filter((id) => !removeIds.includes(id));
    }
  }
}

function ensureAppsSectionWithRegistrationForm(
  parsed: {
    sections?: Record<
      string,
      {
        type?: string;
        blocks?: Record<string, unknown>;
        block_order?: string[];
        settings?: Record<string, unknown>;
      }
    >;
    order?: string[];
  },
  blockType?: string | null,
): string | null {
  const sections = parsed.sections;
  if (!sections || typeof sections !== "object") return null;

  const appsSectionKey =
    Object.keys(sections).find((key) => sections[key]?.type === "apps") ??
    REGISTRATION_APPS_SECTION_ID;

  let appsSection = sections[appsSectionKey];
  if (!appsSection) {
    appsSection = { type: "apps", blocks: {}, block_order: [], settings: {} };
    sections[appsSectionKey] = appsSection;
    const order = Array.isArray(parsed.order) ? [...parsed.order] : [];
    if (!order.includes(appsSectionKey)) {
      const mainIdx = order.findIndex(
        (key) => sections[key]?.type === "main-page" || key === "main",
      );
      if (mainIdx >= 0) {
        order.splice(mainIdx + 1, 0, appsSectionKey);
      } else {
        order.push(appsSectionKey);
      }
      parsed.order = order;
    }
  }

  appsSection.blocks = appsSection.blocks ?? {};
  appsSection.blocks[REGISTRATION_FORM_BLOCK_ID] = registrationFormBlockPayload(blockType);
  const blockOrder = Array.isArray(appsSection.block_order) ? [...appsSection.block_order] : [];
  if (!blockOrder.includes(REGISTRATION_FORM_BLOCK_ID)) {
    blockOrder.push(REGISTRATION_FORM_BLOCK_ID);
  }
  appsSection.block_order = blockOrder;

  removeRegistrationFormBlocksFromSections(sections, appsSectionKey);
  dedupeAppsSections(parsed);
  ensureMainPageBeforeAppsSection(parsed);
  return JSON.stringify(parsed, null, 2);
}

function registrationFormBlockPayload(blockType?: string | null): {
  type: string;
  settings: { heading: string; description: string; form_id: string };
} {
  return {
    type: registrationFormBlockType(blockType),
    settings: {
      heading: REGISTRATION_PAGE_TITLE,
      description: REGISTRATION_PAGE_INTRO,
      form_id: "",
    },
  };
}

function mergeRegistrationFormBlockIntoTemplate(
  pageJsonRaw: string,
  blockType?: string | null,
): string | null {
  try {
    const parsed = JSON.parse(stripJsonComments(pageJsonRaw)) as {
      sections?: Record<
        string,
        {
          type?: string;
          blocks?: Record<string, unknown>;
          block_order?: string[];
          settings?: Record<string, unknown>;
        }
      >;
      order?: string[];
    };
    return ensureAppsSectionWithRegistrationForm(parsed, blockType);
  } catch {
    return null;
  }
}

function buildRegistrationPageTemplateShellJson(): string {
  return JSON.stringify(
    {
      sections: {
        main: {
          type: "main-page",
          settings: {
            padding_top: 28,
            padding_bottom: 28,
          },
        },
      },
      order: ["main"],
    },
    null,
    2,
  );
}

async function buildRegistrationPageTemplateShellBody(
  admin: AdminGraphqlClient,
  themeId: string,
): Promise<string> {
  const pageJson = await readThemeFile(admin, themeId, "templates/page.json");
  if (pageJson?.trim()) {
    const stripped = stripRegistrationFormBlocksFromTemplate(pageJson);
    if (stripped) return stripped;
    return pageJson;
  }
  return buildRegistrationPageTemplateShellJson();
}

function buildRegistrationPageTemplateJson(blockType?: string | null): string {
  const payload = {
    sections: {
      main: {
        type: "main-page",
        settings: {
          padding_top: 28,
          padding_bottom: 28,
        },
      },
      [REGISTRATION_APPS_SECTION_ID]: {
        type: "apps",
        blocks: {
          [REGISTRATION_FORM_BLOCK_ID]: {
            type: registrationFormBlockType(blockType),
            settings: registrationFormBlockPayload(blockType).settings,
          },
        },
        block_order: [REGISTRATION_FORM_BLOCK_ID],
        settings: {},
      },
    },
    order: ["main", REGISTRATION_APPS_SECTION_ID],
  };
  return JSON.stringify(payload, null, 2);
}

async function buildRegistrationPageTemplateBody(
  admin: AdminGraphqlClient,
  themeId: string,
  blockType?: string | null,
): Promise<string> {
  const pageJson = await readThemeFile(admin, themeId, "templates/page.json");
  if (pageJson) {
    const merged = mergeRegistrationFormBlockIntoTemplate(pageJson, blockType);
    if (merged) return merged;
  }
  return buildRegistrationPageTemplateJson(blockType);
}

export async function getMainThemeId(admin: AdminGraphqlClient): Promise<string | null> {
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

export async function readThemeFile(
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

function registrationFormBlockPlacement(raw: string): "apps" | "main" | "none" {
  try {
    const parsed = JSON.parse(stripJsonComments(raw)) as {
      sections?: Record<
        string,
        {
          type?: string;
          blocks?: Record<string, { type?: string }>;
        }
      >;
    };
    const sections = parsed.sections;
    if (!sections) return "none";

    let inApps = false;
    let inMain = false;
    for (const [sectionKey, section] of Object.entries(sections)) {
      if (!section?.blocks) continue;
      const hasBlock = Object.values(section.blocks).some(
        (block) =>
          typeof block?.type === "string" && block.type.includes(REGISTRATION_FORM_BLOCK_HANDLE),
      );
      if (!hasBlock) continue;
      if (section.type === "apps") {
        inApps = true;
      } else if (section.type === "main-page" || sectionKey === "main") {
        inMain = true;
      }
    }
    if (inApps) return "apps";
    if (inMain) return "main";
    return "none";
  } catch {
    return "none";
  }
}

function stripRegistrationFormBlocksFromTemplate(pageJsonRaw: string): string | null {
  try {
    const parsed = JSON.parse(stripJsonComments(pageJsonRaw)) as {
      sections?: Record<
        string,
        {
          blocks?: Record<string, { type?: string }>;
          block_order?: string[];
        }
      >;
    };
    const sections = parsed.sections;
    if (!sections) return null;

    let changed = false;
    for (const section of Object.values(sections)) {
      if (!section?.blocks) continue;
      const removeIds: string[] = [];
      for (const [blockId, block] of Object.entries(section.blocks)) {
        if (typeof block?.type === "string" && block.type.includes(REGISTRATION_FORM_BLOCK_HANDLE)) {
          removeIds.push(blockId);
        }
      }
      if (removeIds.length === 0) continue;
      for (const id of removeIds) {
        delete section.blocks[id];
      }
      if (Array.isArray(section.block_order)) {
        section.block_order = section.block_order.filter((id) => !removeIds.includes(id));
      }
      changed = true;
    }
    return changed ? JSON.stringify(parsed, null, 2) : null;
  } catch {
    return null;
  }
}

async function copyThemeFile(
  admin: AdminGraphqlClient,
  themeId: string,
  srcFilename: string,
  dstFilename: string,
): Promise<boolean> {
  const res = await admin.graphql(
    `#graphql
    mutation ApprovefyThemeFilesCopy($themeId: ID!, $files: [ThemeFilesCopyFileInput!]!) {
      themeFilesCopy(themeId: $themeId, files: $files) {
        copiedThemeFiles {
          filename
        }
        userErrors {
          message
        }
      }
    }`,
    {
      variables: {
        themeId,
        files: [{ srcFilename, dstFilename }],
      },
    },
  );
  const json = (await res.json()) as {
    data?: {
      themeFilesCopy?: {
        copiedThemeFiles?: Array<{ filename?: string }>;
        userErrors?: Array<{ message?: string }>;
      };
    };
    errors?: Array<{ message?: string }>;
  };
  if (json.errors?.length) {
    console.warn(
      "[ThemeRegistrationTemplate] themeFilesCopy GraphQL errors:",
      json.errors.map((e) => e.message).join("; "),
    );
    return false;
  }
  const payload = json.data?.themeFilesCopy;
  const userErrors = payload?.userErrors ?? [];
  if (userErrors.length > 0) {
    console.warn("[ThemeRegistrationTemplate] themeFilesCopy userErrors:", userErrors);
    return false;
  }
  return (payload?.copiedThemeFiles ?? []).some((f) => f.filename === dstFilename);
}

type ThemeFilePollOptions = {
  attempts?: number;
  delayMs?: number;
};

async function pollForThemeFile(
  admin: AdminGraphqlClient,
  themeId: string,
  filename: string,
  attemptsOrOpts: number | ThemeFilePollOptions = 6,
  delayMs = 700,
): Promise<string | null> {
  const opts =
    typeof attemptsOrOpts === "number"
      ? { attempts: attemptsOrOpts, delayMs }
      : attemptsOrOpts;
  const maxAttempts = opts.attempts ?? 6;
  const waitMs = opts.delayMs ?? 700;

  for (let i = 0; i < maxAttempts; i++) {
    const raw = await readThemeFile(admin, themeId, filename);
    if (raw?.trim()) return raw;
    if (i < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  return null;
}

function quickThemeFilePoll(): ThemeFilePollOptions {
  // Theme copy/upsert jobs can take a few seconds on live stores — short polls caused false failures.
  return { attempts: 12, delayMs: 450 };
}

async function upsertDedicatedRegistrationTemplateShell(
  admin: AdminGraphqlClient,
  themeId: string,
): Promise<string | null> {
  const templateBody = await buildRegistrationPageTemplateShellBody(admin, themeId);
  const upsert = await upsertThemeFileByFilename(
    admin,
    themeId,
    REGISTRATION_PAGE_TEMPLATE_FILE,
    templateBody,
  );
  if (!upsert.ok) return null;
  return pollForThemeFile(admin, themeId, REGISTRATION_PAGE_TEMPLATE_FILE);
}

async function ensureDedicatedRegistrationTemplateFile(
  admin: AdminGraphqlClient,
  themeId: string,
): Promise<string | null> {
  const existing = await readThemeFile(admin, themeId, REGISTRATION_PAGE_TEMPLATE_FILE);
  if (existing?.trim()) return existing;

  const copied = await copyThemeFile(
    admin,
    themeId,
    "templates/page.json",
    REGISTRATION_PAGE_TEMPLATE_FILE,
  );
  if (copied) {
    const copiedContent = await pollForThemeFile(
      admin,
      themeId,
      REGISTRATION_PAGE_TEMPLATE_FILE,
      6,
      700,
    );
    if (copiedContent?.trim()) {
      const stripped = stripRegistrationFormBlocksFromTemplate(copiedContent);
      if (stripped) {
        await upsertThemeFileByFilename(
          admin,
          themeId,
          REGISTRATION_PAGE_TEMPLATE_FILE,
          stripped,
        );
        const cleaned = await pollForThemeFile(admin, themeId, REGISTRATION_PAGE_TEMPLATE_FILE);
        if (cleaned?.trim()) return cleaned;
      }
      return copiedContent;
    }
  }

  const shellUpsert = await upsertDedicatedRegistrationTemplateShell(admin, themeId);
  if (shellUpsert?.trim()) return shellUpsert;

  // Last resort: write the minimal main-page shell directly.
  const minimalShell = buildRegistrationPageTemplateShellJson();
  const upsert = await upsertThemeFileByFilename(
    admin,
    themeId,
    REGISTRATION_PAGE_TEMPLATE_FILE,
    minimalShell,
  );
  if (!upsert.ok) return null;
  return pollForThemeFile(admin, themeId, REGISTRATION_PAGE_TEMPLATE_FILE);
}

export function isThemeFileWriteAccessDenied(message: string | undefined | null): boolean {
  return /access denied|required access|not authorized|exemption|write_themes/i.test(
    message ?? "",
  );
}

export async function upsertThemeFileByFilename(
  admin: AdminGraphqlClient,
  themeId: string,
  filename: string,
  templateBody: string,
  opts?: { skipJobWait?: boolean },
): Promise<{ ok: boolean; userErrors: Array<{ message?: string }>; accessDenied: boolean }> {
  try {
    const res = await admin.graphql(
      `#graphql
      mutation ApprovefyUpsertThemeFile($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
        themeFilesUpsert(themeId: $themeId, files: $files) {
          upsertedThemeFiles {
            filename
          }
          job {
            id
            done
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
          files: [{ filename, body: { type: "TEXT", value: templateBody } }],
        },
      },
    );
    const json = (await res.json()) as {
      data?: {
        themeFilesUpsert?: {
          upsertedThemeFiles?: Array<{ filename?: string }>;
          job?: { id?: string; done?: boolean } | null;
          userErrors?: Array<{ message?: string }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };
    if (json.errors?.length) {
      const denied = json.errors.some((e) => isThemeFileWriteAccessDenied(e.message));
      console.warn(
        "[ThemeRegistrationTemplate] themeFilesUpsert GraphQL errors:",
        json.errors.map((e) => e.message).join("; "),
        denied ? "(needs write_themes + theme file exemption)" : "",
      );
      return { ok: false, userErrors: [], accessDenied: denied };
    }
    const payload = json.data?.themeFilesUpsert;
    if (!payload) {
      return { ok: false, userErrors: [], accessDenied: true };
    }
    const userErrors = payload.userErrors ?? [];
    if (userErrors.length > 0) {
      console.warn("[ThemeRegistrationTemplate] themeFilesUpsert userErrors:", userErrors);
      const denied = userErrors.some((e) => isThemeFileWriteAccessDenied(e.message));
      return { ok: false, userErrors, accessDenied: denied };
    }
    const jobId = payload.job?.id;
    const jobInitiallyDone = payload.job?.done === true;
    if (!opts?.skipJobWait && jobId && !jobInitiallyDone) {
      await waitForThemeWriteJob(admin, jobId);
    }

    const upsertedNow = (payload.upsertedThemeFiles ?? []).some((f) => f.filename === filename);
    if (upsertedNow) {
      return { ok: true, userErrors, accessDenied: false };
    }

    const written = await readThemeFile(admin, themeId, filename);
    return {
      ok: !!written?.trim(),
      userErrors,
      accessDenied: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const accessDenied = isThemeFileWriteAccessDenied(message);
    console.warn("[ThemeRegistrationTemplate] themeFilesUpsert failed:", message);
    return { ok: false, userErrors: [], accessDenied };
  }
}

/** Strip Registration Form blocks mistakenly added to templates/page.json (Default page). */
export async function cleanRegistrationFormOffDefaultPageTemplate(
  admin: AdminGraphqlClient,
): Promise<boolean> {
  const themeId = await getMainThemeId(admin);
  if (!themeId) return false;
  await removeRegistrationFormFromDefaultPageTemplate(admin, themeId);
  return true;
}

/** Remove Registration Form blocks from templates/page.json (default page template). */
async function removeRegistrationFormFromDefaultPageTemplate(
  admin: AdminGraphqlClient,
  themeId: string,
): Promise<void> {
  const pageJson = await readThemeFile(admin, themeId, "templates/page.json");
  if (!pageJson) return;
  const cleaned = stripRegistrationFormBlocksFromTemplate(pageJson);
  if (!cleaned) return;
  await upsertThemeFileByFilename(admin, themeId, "templates/page.json", cleaned);
}

async function upsertThemeTemplateFile(
  admin: AdminGraphqlClient,
  themeId: string,
  templateBody: string,
  opts?: { skipJobWait?: boolean },
): Promise<{ ok: boolean; userErrors: Array<{ message?: string }>; accessDenied: boolean }> {
  return upsertThemeFileByFilename(
    admin,
    themeId,
    REGISTRATION_PAGE_TEMPLATE_FILE,
    templateBody,
    opts,
  );
}

/** GraphQL theme write + Theme REST fallback (required on Vercel — no Shopify CLI). */
async function persistRegistrationPageTemplate(
  admin: AdminGraphqlClient,
  themeId: string,
  templateBody: string,
  opts?: { quick?: boolean; shop?: string; accessToken?: string },
): Promise<{ ok: boolean; accessDenied: boolean }> {
  const quick = resolveThemeTemplateWriteQuick(opts?.quick);
  const shop = opts?.shop?.trim();
  const accessToken = opts?.accessToken?.trim();

  let upsert = await upsertThemeTemplateFile(admin, themeId, templateBody, { skipJobWait: quick });
  if (upsert.ok) return { ok: true, accessDenied: false };

  if (shop && accessToken) {
    const rest = await putThemeAssetViaRest(
      shop,
      accessToken,
      themeId,
      REGISTRATION_PAGE_TEMPLATE_FILE,
      templateBody,
    );
    if (rest.ok) {
      console.info("[ThemeRegistrationTemplate] page.customer-registration.json written via Theme REST");
      return { ok: true, accessDenied: false };
    }
    if (rest.accessDenied) upsert = { ...upsert, accessDenied: true };
  }

  if (!upsert.ok && !quick) {
    upsert = await upsertThemeTemplateFile(admin, themeId, templateBody);
    if (upsert.ok) return { ok: true, accessDenied: false };
  }

  const themeNumericId = themeNumericIdFromGid(themeId);
  if (shop && themeNumericId && canUseThemeCliPush()) {
    const cli = await pushRegistrationTemplateViaCli(shop, themeNumericId, {
      timeoutMs: resolveThemeCliPushTimeoutMs(quick),
      templateBody,
    });
    if (cli.ok) return { ok: true, accessDenied: false };
    if (cli.error) {
      console.warn("[ThemeRegistrationTemplate] CLI theme push failed:", cli.error);
    }
  }

  return { ok: false, accessDenied: upsert.accessDenied };
}

async function waitForThemeWriteJob(
  admin: AdminGraphqlClient,
  jobId: string,
  timeoutMs = 20000,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await admin.graphql(
      `#graphql
      query ApprovefyThemeWriteJob($id: ID!) {
        job(id: $id) {
          done
        }
      }`,
      { variables: { id: jobId } },
    );
    const json = (await res.json()) as { data?: { job?: { done?: boolean } } };
    if (json.data?.job?.done === true) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  console.warn("[ThemeRegistrationTemplate] theme write job timed out:", jobId);
}
export type RegistrationPageThemeTemplateStatus = {
  created: boolean;
  /** Theme JSON file exists on the published theme. */
  templateExists: boolean;
  /** Registration Form app block is present in that template file. */
  blockOnTemplate: boolean;
  /** themeFilesUpsert blocked — merchant must create template in theme editor */
  themeFileWriteAccessDenied: boolean;
};

export type EnsureRegistrationPageThemeTemplateOptions = {
  /** Skip default-page cleanup and extra file reads (faster button action). */
  quick?: boolean;
  /** Session/offline token — Theme REST asset fallback when GraphQL upsert is blocked. */
  accessToken?: string;
  /** Required for Theme REST / CLI fallbacks when GraphQL themeFilesUpsert is blocked. */
  shop?: string;
};

/**
 * Ensures page.customer-registration.json includes Apps → Registration Form (auto app block).
 */
export async function prepareCustomerRegistrationPageForAppsDeepLink(
  admin: AdminGraphqlClient,
  opts?: { quick?: boolean },
): Promise<{
  templateExists: boolean;
  themeId: string | null;
  blockOnTemplate: boolean;
  themeFileWriteAccessDenied: boolean;
}> {
  const empty = {
    templateExists: false,
    themeId: null,
    blockOnTemplate: false,
    themeFileWriteAccessDenied: false,
  };
  try {
    const result = await ensureRegistrationPageThemeTemplate(admin, { quick: opts?.quick === true });
    const verified = await readRegistrationPageTemplateOnMainTheme(admin);
    return {
      templateExists: result.templateExists || !!verified.raw?.trim(),
      themeId: verified.themeId,
      blockOnTemplate: result.blockOnTemplate || verified.blockOnTemplate,
      themeFileWriteAccessDenied: result.themeFileWriteAccessDenied,
    };
  } catch (error) {
    console.warn(
      "[ThemeRegistrationTemplate] prepareCustomerRegistrationPageForAppsDeepLink failed:",
      error,
    );
    return empty;
  }
}

/** @deprecated Use prepareCustomerRegistrationPageForAppsDeepLink */
export async function ensureRegistrationPageThemeTemplateShell(
  admin: AdminGraphqlClient,
): Promise<{ templateExists: boolean }> {
  const result = await prepareCustomerRegistrationPageForAppsDeepLink(admin);
  return { templateExists: result.templateExists };
}

export type InstallRegistrationFormOnPageResult = {
  templateExists: boolean;
  blockOnTemplate: boolean;
  /** Theme file written via themeFilesUpsert (Apps section + Registration Form block). */
  savedViaApi: boolean;
  themeId: string | null;
};

export type InstallRegistrationFormOnPageOptions = {
  shop?: string;
  accessToken?: string;
  /** Background install — skip long theme job waits. Merchant setup should leave this false. */
  quick?: boolean;
};

/**
 * Fully installs Customer Registration template with Apps section + Registration Form block.
 * Persists via themeFilesUpsert (equivalent to saving the template JSON on the live theme).
 */
export async function installRegistrationFormOnCustomerRegistrationTemplate(
  admin: AdminGraphqlClient,
  opts?: InstallRegistrationFormOnPageOptions,
): Promise<InstallRegistrationFormOnPageResult> {
  const empty: InstallRegistrationFormOnPageResult = {
    templateExists: false,
    blockOnTemplate: false,
    savedViaApi: false,
    themeId: null,
  };

  try {
    await cleanRegistrationFormOffDefaultPageTemplate(admin);

    const quick = opts?.quick === true;
    let result = await ensureRegistrationPageThemeTemplate(admin, {
      quick,
      shop: opts?.shop,
      accessToken: opts?.accessToken,
    });
    if (!result.blockOnTemplate && !result.themeFileWriteAccessDenied) {
      result = await ensureRegistrationPageThemeTemplate(admin, {
        quick: false,
        shop: opts?.shop,
        accessToken: opts?.accessToken,
      });
    }

    const verified = await readRegistrationPageTemplateOnMainTheme(admin);
    const templateExists = result.templateExists || !!verified.raw?.trim();
    const blockOnTemplate = result.blockOnTemplate || verified.blockOnTemplate;

    await cleanRegistrationFormOffDefaultPageTemplate(admin);

    return {
      templateExists,
      blockOnTemplate,
      savedViaApi: blockOnTemplate,
      themeId: verified.themeId,
    };
  } catch (error) {
    console.warn(
      "[ThemeRegistrationTemplate] installRegistrationFormOnCustomerRegistrationTemplate failed:",
      error,
    );
    return empty;
  }
}

export async function ensureRegistrationPageThemeTemplate(
  admin: AdminGraphqlClient,
  opts?: EnsureRegistrationPageThemeTemplateOptions,
): Promise<RegistrationPageThemeTemplateStatus> {
  const quick = resolveThemeTemplateWriteQuick(opts?.quick);
  const persistOpts = { quick, shop: opts?.shop, accessToken: opts?.accessToken };
  const fallback: RegistrationPageThemeTemplateStatus = {
    created: false,
    templateExists: false,
    blockOnTemplate: false,
    themeFileWriteAccessDenied: false,
  };
  try {
    const themeId = await getMainThemeId(admin);
    if (!themeId) return fallback;

    const resolvedBlockType = await readRegistrationFormBlockTypeFromTheme(admin, themeId);

    if (!quick) {
      await removeRegistrationFormFromDefaultPageTemplate(admin, themeId);
    }

    let existing: string | null;
    if (quick) {
      existing = await readThemeFile(admin, themeId, REGISTRATION_PAGE_TEMPLATE_FILE);
    } else {
      existing = await ensureDedicatedRegistrationTemplateFile(admin, themeId);
    }
    if (existing?.trim()) {
      const placement = registrationFormBlockPlacement(existing);
      if (placement === "apps") {
        try {
          const parsed = JSON.parse(stripJsonComments(existing)) as {
            sections?: Record<string, { type?: string }>;
            order?: string[];
          };
          dedupeAppsSections(parsed);
          const orderChanged = ensureMainPageBeforeAppsSection(parsed);
          if (orderChanged) {
            const reordered = JSON.stringify(parsed, null, 2);
            await persistRegistrationPageTemplate(admin, themeId, reordered, persistOpts);
          }
        } catch {
          /* ignore reorder parse errors */
        }
        return {
          created: false,
          templateExists: true,
          blockOnTemplate: true,
          themeFileWriteAccessDenied: false,
        };
      }
      if (placement === "main" || placement === "none") {
        const merged = mergeRegistrationFormBlockIntoTemplate(existing, resolvedBlockType);
        if (merged) {
          const wrote = await persistRegistrationPageTemplate(admin, themeId, merged, persistOpts);
          if (wrote.ok) {
            const written =
              (await pollForThemeFile(
                admin,
                themeId,
                REGISTRATION_PAGE_TEMPLATE_FILE,
                quick ? quickThemeFilePoll() : { attempts: 8, delayMs: 500 },
              )) ?? "";
            const blockOnTemplate =
              !!written.trim() && registrationFormBlockPlacement(written) === "apps";
            return {
              created: blockOnTemplate,
              templateExists: !!written.trim(),
              blockOnTemplate,
              themeFileWriteAccessDenied: false,
            };
          }
          if (wrote.accessDenied) {
            return { ...fallback, themeFileWriteAccessDenied: true };
          }
        }
      }
    }

    const templateBody = existing?.trim()
      ? (mergeRegistrationFormBlockIntoTemplate(existing, resolvedBlockType) ??
        (quick
          ? buildRegistrationPageTemplateJson(resolvedBlockType)
          : await buildRegistrationPageTemplateBody(admin, themeId, resolvedBlockType)))
      : quick
        ? buildRegistrationPageTemplateJson(resolvedBlockType)
        : await buildRegistrationPageTemplateBody(admin, themeId, resolvedBlockType);

    const wrote = await persistRegistrationPageTemplate(admin, themeId, templateBody, persistOpts);
    if (wrote.ok) {
      const written =
        (await pollForThemeFile(
          admin,
          themeId,
          REGISTRATION_PAGE_TEMPLATE_FILE,
          quick ? quickThemeFilePoll() : { attempts: 8, delayMs: 500 },
        )) ?? "";
      const templateExists = !!written.trim();
      const blockOnTemplate =
        templateExists && registrationFormBlockPlacement(written) === "apps";
      return {
        created: blockOnTemplate,
        templateExists,
        blockOnTemplate,
        themeFileWriteAccessDenied: false,
      };
    }

    if (wrote.accessDenied) {
      return { ...fallback, themeFileWriteAccessDenied: true };
    }

    if (quick) {
      const existingQuick = await readThemeFile(admin, themeId, REGISTRATION_PAGE_TEMPLATE_FILE);
      if (existingQuick?.trim()) {
        return {
          created: false,
          templateExists: true,
          blockOnTemplate: registrationFormBlockPlacement(existingQuick) === "apps",
          themeFileWriteAccessDenied: false,
        };
      }
      return fallback;
    }

    existing =
      (await pollForThemeFile(admin, themeId, REGISTRATION_PAGE_TEMPLATE_FILE, 3, 500)) ?? "";
    const templateExists = !!existing.trim();
    const blockOnTemplate = templateExists && registrationFormBlockPlacement(existing) === "apps";
    return {
      created: false,
      templateExists,
      blockOnTemplate,
      themeFileWriteAccessDenied: false,
    };
  } catch (error) {
    console.warn("[ThemeRegistrationTemplate] ensureRegistrationPageThemeTemplate failed:", error);
    return fallback;
  }
}

export async function readRegistrationPageTemplateOnMainTheme(
  admin: AdminGraphqlClient,
): Promise<{ themeId: string | null; raw: string | null; blockOnTemplate: boolean }> {
  const themeId = await getMainThemeId(admin);
  if (!themeId) return { themeId: null, raw: null, blockOnTemplate: false };
  const raw = await readThemeFile(admin, themeId, REGISTRATION_PAGE_TEMPLATE_FILE);
  const blockOnTemplate = !!raw?.trim() && registrationFormBlockPlacement(raw) === "apps";
  return { themeId, raw, blockOnTemplate };
}

export { REGISTRATION_PAGE_TEMPLATE, REGISTRATION_PAGE_TEMPLATE_FILE };

export type WriteRegistrationPageTemplateShellOptions = {
  /** Skip Shopify CLI fallback when API already returned access denied. */
  skipCliPush?: boolean;
  /** Shorter poll when responding to a merchant click. */
  quickPoll?: boolean;
  /** Session/offline token — used as Theme CLI --password on live stores. */
  accessToken?: string;
};

export type CreateCustomerRegistrationPageTemplateOptions = {
  accessToken?: string;
  /** Merchant button click — mirrors theme editor "Create template" with minimal latency. */
  quick?: boolean;
};

type CreateCustomerRegistrationPageTemplateResult = {
  templateExists: boolean;
  themeId: string | null;
  savedViaApi: boolean;
  savedViaCli: boolean;
  themeFileWriteAccessDenied: boolean;
};

function templateCreateSuccess(
  themeId: string,
  savedViaApi: boolean,
  savedViaCli: boolean,
): CreateCustomerRegistrationPageTemplateResult {
  return {
    templateExists: true,
    themeId,
    savedViaApi,
    savedViaCli,
    themeFileWriteAccessDenied: false,
  };
}

function resolveTemplateBodyFromDefaultPage(pageJson: string | null): string {
  if (pageJson?.trim()) {
    const merged = mergeRegistrationFormBlockIntoTemplate(pageJson);
    if (merged) return merged;
  }
  const bundled = readBundledRegistrationPageTemplate();
  if (bundled?.trim()) {
    const mergedBundled = mergeRegistrationFormBlockIntoTemplate(bundled);
    if (mergedBundled) return mergedBundled;
  }
  return buildRegistrationPageTemplateJson();
}

async function verifyRegistrationTemplateWritten(
  admin: AdminGraphqlClient,
  themeId: string,
  quick: boolean,
): Promise<string | null> {
  return pollForThemeFile(
    admin,
    themeId,
    REGISTRATION_PAGE_TEMPLATE_FILE,
    quick ? quickThemeFilePoll() : { attempts: 6, delayMs: 500 },
  );
}

/**
 * Create templates/page.customer-registration.json — same outcome as theme editor
 * Default page → Create template → "Customer Registration".
 * Fast path: themeFilesCopy → Theme REST → CLI → GraphQL upsert.
 */
export async function createCustomerRegistrationPageTemplate(
  admin: AdminGraphqlClient,
  shop: string,
  opts?: CreateCustomerRegistrationPageTemplateOptions,
): Promise<CreateCustomerRegistrationPageTemplateResult> {
  const empty: CreateCustomerRegistrationPageTemplateResult = {
    templateExists: false,
    themeId: null,
    savedViaApi: false,
    savedViaCli: false,
    themeFileWriteAccessDenied: false,
  };

  try {
    const quick = resolveThemeTemplateWriteQuick(opts?.quick);
    const accessToken = opts?.accessToken?.trim();

    const themeId = await getMainThemeId(admin);
    if (!themeId) return empty;

    const [existingRaw, defaultPageJson] = await Promise.all([
      readThemeFile(admin, themeId, REGISTRATION_PAGE_TEMPLATE_FILE),
      readThemeFile(admin, themeId, "templates/page.json"),
    ]);

    /** Template exists with Apps block already — nothing to create. */
    if (existingRaw?.trim() && registrationFormBlockPlacement(existingRaw) === "apps") {
      return templateCreateSuccess(themeId, false, false);
    }

    /** Template exists (Page only) — upgrade with Registration Form app block. */
    if (existingRaw?.trim()) {
      const ensured = await ensureRegistrationPageThemeTemplate(admin, {
        quick,
        shop,
        accessToken,
      });
      return {
        templateExists: ensured.templateExists,
        themeId,
        savedViaApi: ensured.created || ensured.blockOnTemplate,
        savedViaCli: false,
        themeFileWriteAccessDenied: ensured.themeFileWriteAccessDenied,
      };
    }

    const templateBody = resolveTemplateBodyFromDefaultPage(defaultPageJson);
    const themeNumericId = themeNumericIdFromGid(themeId);

    const tryCliPushRegistrationTemplate = async (
      body?: string,
    ): Promise<boolean> => {
      if (!themeNumericId || !canUseThemeCliPush()) return false;
      const cli = await pushRegistrationTemplateViaCli(shop, themeNumericId, {
        timeoutMs: resolveThemeCliPushTimeoutMs(quick),
        templateBody: body ?? buildRegistrationPageTemplateJson(),
      });
      if (!cli.ok) {
        console.warn("[ThemeRegistrationTemplate] CLI theme push failed:", cli.error ?? "unknown");
        return false;
      }
      const verified = await verifyRegistrationTemplateWritten(admin, themeId, quick);
      return !!verified?.trim();
    };

    if (await tryCliPushRegistrationTemplate(templateBody)) {
      console.info(
        "[ThemeRegistrationTemplate] page.customer-registration.json pushed via Shopify CLI",
      );
      return templateCreateSuccess(themeId, false, true);
    }

    const wrote = await persistRegistrationPageTemplate(admin, themeId, templateBody, {
      quick,
      shop,
      accessToken,
    });
    if (wrote.ok) {
      const written = await verifyRegistrationTemplateWritten(admin, themeId, quick);
      if (written?.trim()) {
        console.info(
          "[ThemeRegistrationTemplate] page.customer-registration.json created via theme API",
        );
        return templateCreateSuccess(themeId, true, false);
      }
    }

    if (!quick) {
      void removeRegistrationFormFromDefaultPageTemplate(admin, themeId).catch((err) => {
        console.warn("[ThemeRegistrationTemplate] default page cleanup failed:", err);
      });
    }

    if (await tryCliPushRegistrationTemplate(templateBody)) {
      console.info(
        "[ThemeRegistrationTemplate] page.customer-registration.json pushed via Shopify CLI (shell)",
      );
      return templateCreateSuccess(themeId, false, true);
    }

    if (accessToken) {
      const rest = await putThemeAssetViaRest(
        shop,
        accessToken,
        themeId,
        REGISTRATION_PAGE_TEMPLATE_FILE,
        templateBody,
      );
      if (rest.ok) {
        const written = await verifyRegistrationTemplateWritten(admin, themeId, quick);
        if (written?.trim()) {
          console.info(
            "[ThemeRegistrationTemplate] page.customer-registration.json created via Theme REST API",
          );
          return templateCreateSuccess(themeId, true, false);
        }
      }
      if (rest.accessDenied) {
        console.warn(
          "[ThemeRegistrationTemplate] Theme REST asset write denied — trying GraphQL fallbacks",
        );
      } else if (rest.error) {
        console.warn("[ThemeRegistrationTemplate] Theme REST asset write failed:", rest.error);
      }
    }

    const created = await ensureDedicatedRegistrationTemplateFile(admin, themeId);
    if (created?.trim()) {
      console.info(
        "[ThemeRegistrationTemplate] page.customer-registration.json created via theme API",
      );
      return templateCreateSuccess(themeId, true, false);
    }

    const shellResult = await writeRegistrationPageTemplateShell(admin, shop, {
      skipCliPush: false,
      quickPoll: quick,
      accessToken,
    });
    if (shellResult.templateExists) {
      return {
        templateExists: true,
        themeId: shellResult.themeId,
        savedViaApi: shellResult.savedViaApi,
        savedViaCli: shellResult.savedViaCli,
        themeFileWriteAccessDenied: shellResult.themeFileWriteAccessDenied,
      };
    }

    const finalCheck = await verifyRegistrationTemplateWritten(admin, themeId, quick);
    if (finalCheck?.trim()) {
      console.info(
        "[ThemeRegistrationTemplate] page.customer-registration.json verified after write attempts",
      );
      return templateCreateSuccess(themeId, true, false);
    }

    return {
      ...empty,
      themeId,
      themeFileWriteAccessDenied:
        wrote.accessDenied || shellResult.themeFileWriteAccessDenied,
    };
  } catch (error) {
    console.warn(
      "[ThemeRegistrationTemplate] createCustomerRegistrationPageTemplate failed:",
      error,
    );
    return empty;
  }
}

/** Try to write templates/page.customer-registration.json on the live theme. */
export async function writeRegistrationPageTemplateShell(
  admin: AdminGraphqlClient,
  shop: string,
  opts?: WriteRegistrationPageTemplateShellOptions,
): Promise<{
  templateExists: boolean;
  themeId: string | null;
  savedViaApi: boolean;
  savedViaCli: boolean;
  themeFileWriteAccessDenied: boolean;
}> {
  const empty = {
    templateExists: false,
    themeId: null,
    savedViaApi: false,
    savedViaCli: false,
    themeFileWriteAccessDenied: false,
  };
  try {
    const themeId = await getMainThemeId(admin);
    if (!themeId) return empty;

    const existing = await readThemeFile(admin, themeId, REGISTRATION_PAGE_TEMPLATE_FILE);
    if (existing?.trim()) {
      return {
        templateExists: true,
        themeId,
        savedViaApi: false,
        savedViaCli: false,
        themeFileWriteAccessDenied: false,
      };
    }

    const pageJson = await readThemeFile(admin, themeId, "templates/page.json");
    const stripped = pageJson?.trim()
      ? stripRegistrationFormBlocksFromTemplate(pageJson)
      : null;
    const shellBody =
      stripped ?? pageJson?.trim() ?? buildRegistrationPageTemplateShellJson();

    const upsert = await upsertThemeFileByFilename(
      admin,
      themeId,
      REGISTRATION_PAGE_TEMPLATE_FILE,
      shellBody,
    );
    const pollAttempts = opts?.quickPoll ? 2 : 6;
    const pollDelayMs = opts?.quickPoll ? 350 : 700;

    if (upsert.ok) {
      const written = await pollForThemeFile(
        admin,
        themeId,
        REGISTRATION_PAGE_TEMPLATE_FILE,
        pollAttempts,
        pollDelayMs,
      );
      return {
        templateExists: !!written?.trim(),
        themeId,
        savedViaApi: true,
        savedViaCli: false,
        themeFileWriteAccessDenied: false,
      };
    }

    if (upsert.accessDenied) {
      if (opts?.skipCliPush) {
        return {
          templateExists: false,
          themeId,
          savedViaApi: false,
          savedViaCli: false,
          themeFileWriteAccessDenied: true,
        };
      }

      const themeNumericId = themeNumericIdFromGid(themeId);
      if (themeNumericId) {
        const cli = await pushRegistrationTemplateViaCli(shop, themeNumericId, {
          timeoutMs: resolveThemeCliPushTimeoutMs(opts?.quickPoll),
        });
        if (cli.ok) {
          const written = await pollForThemeFile(
            admin,
            themeId,
            REGISTRATION_PAGE_TEMPLATE_FILE,
            pollAttempts,
            pollDelayMs,
          );
          if (written?.trim()) {
            console.info(
              "[ThemeRegistrationTemplate] page.customer-registration.json pushed via Shopify CLI",
            );
            return {
              templateExists: true,
              themeId,
              savedViaApi: false,
              savedViaCli: true,
              themeFileWriteAccessDenied: false,
            };
          }
        } else if (cli.error) {
          console.warn("[ThemeRegistrationTemplate] CLI theme push failed:", cli.error);
        }
      }

      return {
        templateExists: false,
        themeId,
        savedViaApi: false,
        savedViaCli: false,
        themeFileWriteAccessDenied: true,
      };
    }

    return {
      templateExists: false,
      themeId,
      savedViaApi: false,
      savedViaCli: false,
      themeFileWriteAccessDenied: false,
    };
  } catch (error) {
    console.warn("[ThemeRegistrationTemplate] writeRegistrationPageTemplateShell failed:", error);
    return empty;
  }
}
