import fs from "node:fs";
import path from "node:path";
import {
  REGISTRATION_FORM_BLOCK_HANDLE,
  THEME_EXTENSION_HANDLE,
} from "./theme-extension-setup-status";
import {
  canUseThemeCliPush,
  CLI_PUSH_QUICK_TIMEOUT_MS,
  CLI_PUSH_TIMEOUT_MS,
  pushRegistrationTemplateViaCli,
  themeNumericIdFromGid,
} from "./theme-cli-push.server";
import { putThemeAssetViaRest } from "./theme-rest-asset.server";

const REGISTRATION_PAGE_HANDLE = "customer-registration";

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

const REGISTRATION_FORM_BLOCK_ID = "approvefy_registration_form";
export const REGISTRATION_APPS_SECTION_ID = "approvefy_apps";

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
  appsSection.blocks[REGISTRATION_FORM_BLOCK_ID] = registrationFormBlockPayload();
  const blockOrder = Array.isArray(appsSection.block_order) ? [...appsSection.block_order] : [];
  if (!blockOrder.includes(REGISTRATION_FORM_BLOCK_ID)) {
    blockOrder.push(REGISTRATION_FORM_BLOCK_ID);
  }
  appsSection.block_order = blockOrder;

  removeRegistrationFormBlocksFromSections(sections, appsSectionKey);
  return JSON.stringify(parsed, null, 2);
}

function registrationFormBlockPayload(): {
  type: string;
  settings: { heading: string; description: string; form_id: string };
} {
  return {
    type: registrationFormBlockType(),
    settings: {
      heading: "Create Account",
      description: "Please fill out the information below to create your account.",
      form_id: "",
    },
  };
}

function mergeRegistrationFormBlockIntoTemplate(pageJsonRaw: string): string | null {
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
    return ensureAppsSectionWithRegistrationForm(parsed);
  } catch {
    return null;
  }
}

function buildMainOnlyRegistrationTemplateShell(existingRaw?: string | null): string {
  if (existingRaw?.trim()) {
    try {
      const parsed = JSON.parse(stripJsonComments(existingRaw)) as {
        sections?: Record<
          string,
          {
            type?: string;
            blocks?: Record<string, { type?: string }>;
            block_order?: string[];
            settings?: Record<string, unknown>;
          }
        >;
        order?: string[];
      };
      const sections = parsed.sections ?? {};
      const order = Array.isArray(parsed.order) ? [...parsed.order] : Object.keys(sections);
      const nextSections: typeof sections = {};
      const nextOrder: string[] = [];

      for (const key of order) {
        const section = sections[key];
        if (!section || section.type === "apps") continue;

        const blocks = section.blocks ? { ...section.blocks } : undefined;
        if (blocks) {
          for (const [blockId, block] of Object.entries(blocks)) {
            if (
              blockId === REGISTRATION_FORM_BLOCK_ID ||
              (typeof block?.type === "string" &&
                block.type.includes(REGISTRATION_FORM_BLOCK_HANDLE))
            ) {
              delete blocks[blockId];
            }
          }
        }

        const blockOrder = Array.isArray(section.block_order)
          ? section.block_order.filter((id) => !blocks || id in blocks)
          : undefined;

        nextSections[key] = {
          ...section,
          ...(blocks ? { blocks } : {}),
          ...(blockOrder ? { block_order: blockOrder } : {}),
        };
        nextOrder.push(key);
      }

      if (nextOrder.length > 0) {
        return JSON.stringify({ sections: nextSections, order: nextOrder }, null, 2);
      }
    } catch {
      // fall through to default shell
    }
  }
  return buildRegistrationPageTemplateShellJson();
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

function buildRegistrationPageTemplateJson(): string {
  const blockType = registrationFormBlockType();
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
            type: blockType,
            settings: registrationFormBlockPayload().settings,
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
): Promise<string> {
  const pageJson = await readThemeFile(admin, themeId, "templates/page.json");
  if (pageJson) {
    const merged = mergeRegistrationFormBlockIntoTemplate(pageJson);
    if (merged) return merged;
  }
  return buildRegistrationPageTemplateJson();
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
  return { attempts: 2, delayMs: 200 };
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
};

/**
 * Ensures page.customer-registration exists with Page section only (no Apps block),
 * so the theme editor deep link auto-adds Apps → Registration Form.
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
    const quick = opts?.quick === true;
    const pollAttempts = quick ? 2 : 6;
    const pollDelayMs = quick ? 350 : 700;
    const themeId = await getMainThemeId(admin);
    if (!themeId) return empty;

    await removeRegistrationFormFromDefaultPageTemplate(admin, themeId);

    let existing = await readThemeFile(admin, themeId, REGISTRATION_PAGE_TEMPLATE_FILE);
    if (existing?.trim() && registrationFormBlockPlacement(existing) === "apps") {
      return {
        templateExists: true,
        themeId,
        blockOnTemplate: true,
        themeFileWriteAccessDenied: false,
      };
    }

    if (!existing?.trim()) {
      const created = await ensureDedicatedRegistrationTemplateFile(admin, themeId);
      if (created?.trim()) {
        existing = created;
      }
    }

    const shellBody = buildMainOnlyRegistrationTemplateShell(existing);
    const upsert = await upsertThemeFileByFilename(
      admin,
      themeId,
      REGISTRATION_PAGE_TEMPLATE_FILE,
      shellBody,
      { skipJobWait: quick },
    );

    if (!upsert.ok) {
      const stillThere = await readThemeFile(admin, themeId, REGISTRATION_PAGE_TEMPLATE_FILE);
      return {
        templateExists: !!stillThere?.trim(),
        themeId,
        blockOnTemplate:
          !!stillThere?.trim() && registrationFormBlockPlacement(stillThere) === "apps",
        themeFileWriteAccessDenied: upsert.accessDenied,
      };
    }

    const written =
      (await pollForThemeFile(
        admin,
        themeId,
        REGISTRATION_PAGE_TEMPLATE_FILE,
        pollAttempts,
        pollDelayMs,
      )) ?? existing;
    const templateExists = !!written?.trim();
    return {
      templateExists,
      themeId,
      blockOnTemplate: templateExists && registrationFormBlockPlacement(written!) === "apps",
      themeFileWriteAccessDenied: false,
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

/**
 * Fully installs Customer Registration template with Apps section + Registration Form block.
 * Persists via themeFilesUpsert (equivalent to saving the template JSON on the live theme).
 */
export async function installRegistrationFormOnCustomerRegistrationTemplate(
  admin: AdminGraphqlClient,
): Promise<InstallRegistrationFormOnPageResult> {
  const empty: InstallRegistrationFormOnPageResult = {
    templateExists: false,
    blockOnTemplate: false,
    savedViaApi: false,
    themeId: null,
  };

  try {
    await cleanRegistrationFormOffDefaultPageTemplate(admin);

    await prepareCustomerRegistrationPageForAppsDeepLink(admin);

    let result = await ensureRegistrationPageThemeTemplate(admin);
    if (result.templateExists && !result.blockOnTemplate) {
      result = await ensureRegistrationPageThemeTemplate(admin);
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
  const quick = opts?.quick === true;
  const fallback: RegistrationPageThemeTemplateStatus = {
    created: false,
    templateExists: false,
    blockOnTemplate: false,
    themeFileWriteAccessDenied: false,
  };
  try {
    const themeId = await getMainThemeId(admin);
    if (!themeId) return fallback;

    if (!quick) {
      await removeRegistrationFormFromDefaultPageTemplate(admin, themeId);
    }

    let existing = await ensureDedicatedRegistrationTemplateFile(admin, themeId);
    if (existing?.trim()) {
      const placement = registrationFormBlockPlacement(existing);
      if (placement === "apps") {
        return {
          created: false,
          templateExists: true,
          blockOnTemplate: true,
          themeFileWriteAccessDenied: false,
        };
      }
      if (placement === "main") {
        const migrated = mergeRegistrationFormBlockIntoTemplate(existing);
        if (migrated) {
          const migrateUpsert = await upsertThemeTemplateFile(admin, themeId, migrated, {
            skipJobWait: quick,
          });
          if (migrateUpsert.ok) {
            return {
              created: true,
              templateExists: true,
              blockOnTemplate: true,
              themeFileWriteAccessDenied: false,
            };
          }
          if (migrateUpsert.accessDenied) {
            return { ...fallback, themeFileWriteAccessDenied: true };
          }
        }
      }
    }

    const templateBody = existing?.trim()
      ? (mergeRegistrationFormBlockIntoTemplate(existing) ??
        (await buildRegistrationPageTemplateBody(admin, themeId)))
      : await buildRegistrationPageTemplateBody(admin, themeId);

    let upsert = await upsertThemeTemplateFile(admin, themeId, templateBody, {
      skipJobWait: quick,
    });
    if (!upsert.ok && !quick && !upsert.accessDenied) {
      upsert = await upsertThemeTemplateFile(admin, themeId, templateBody);
    }

    if (upsert.ok) {
      const written = quick
        ? (await readThemeFile(admin, themeId, REGISTRATION_PAGE_TEMPLATE_FILE)) ?? ""
        : (await pollForThemeFile(admin, themeId, REGISTRATION_PAGE_TEMPLATE_FILE)) ?? "";
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

    if (upsert.accessDenied) {
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
  const bundledBody =
    readBundledRegistrationPageTemplate() ?? buildRegistrationPageTemplateShellJson();
  const stripped = pageJson?.trim() ? stripRegistrationFormBlocksFromTemplate(pageJson) : null;
  return stripped ?? pageJson?.trim() ?? bundledBody;
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
    const quick = opts?.quick === true;
    const accessToken = opts?.accessToken?.trim();

    const themeId = await getMainThemeId(admin);
    if (!themeId) return empty;

    const [existing, defaultPageJson] = await Promise.all([
      readThemeFile(admin, themeId, REGISTRATION_PAGE_TEMPLATE_FILE),
      readThemeFile(admin, themeId, "templates/page.json"),
    ]);
    if (existing?.trim()) {
      return templateCreateSuccess(themeId, false, false);
    }

    const templateBody = resolveTemplateBodyFromDefaultPage(defaultPageJson);
    const themeNumericId = themeNumericIdFromGid(themeId);

    if (!quick) {
      void removeRegistrationFormFromDefaultPageTemplate(admin, themeId).catch((err) => {
        console.warn("[ThemeRegistrationTemplate] default page cleanup failed:", err);
      });
    }

    if (canUseThemeCliPush() && themeNumericId) {
      const cli = await pushRegistrationTemplateViaCli(shop, themeNumericId, {
        timeoutMs: quick ? CLI_PUSH_QUICK_TIMEOUT_MS : CLI_PUSH_TIMEOUT_MS,
      });
      if (cli.ok) {
        console.info(
          "[ThemeRegistrationTemplate] page.customer-registration.json pushed via Shopify CLI",
        );
        return templateCreateSuccess(themeId, false, true);
      }
      console.warn("[ThemeRegistrationTemplate] CLI theme push failed:", cli.error ?? "unknown");
    }

    const copied = await copyThemeFile(
      admin,
      themeId,
      "templates/page.json",
      REGISTRATION_PAGE_TEMPLATE_FILE,
    );
    if (copied) {
      console.info(
        "[ThemeRegistrationTemplate] page.customer-registration.json created via themeFilesCopy",
      );
      return templateCreateSuccess(themeId, true, false);
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
        console.info(
          "[ThemeRegistrationTemplate] page.customer-registration.json created via Theme REST API",
        );
        return templateCreateSuccess(themeId, true, false);
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
      skipCliPush: true,
      quickPoll: quick,
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
      themeFileWriteAccessDenied: shellResult.themeFileWriteAccessDenied,
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
          timeoutMs: opts?.quickPoll ? 12_000 : undefined,
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
