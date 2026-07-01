import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { parseCustomerApprovalSettings } from "./customer-approval-settings.server";
import { STOREFRONT_REDIRECT_DEFAULTS } from "./storefront-redirect-settings";
import { getOfflineAccessTokenForShop } from "../models/approval.server";
import {
  cleanRegistrationFormOffDefaultPageTemplate,
  createCustomerRegistrationPageTemplate,
  ensureRegistrationPageThemeTemplate,
  installRegistrationFormOnCustomerRegistrationTemplate,
  readRegistrationPageTemplateOnMainTheme,
  REGISTRATION_PAGE_TEMPLATE,
} from "./theme-registration-template.server";
import { buildAppEmbedThemeEditorUrl, ensureAppEmbedEnabled } from "./theme-app-embed.server";
import { canUseThemeCliPush, isServerlessRuntime } from "./theme-cli-push.server";
import { getThemeSetupStatus, invalidateThemeSetupStatusCache } from "./theme-setup-status.server";
import {
  canServeRegistrationPageViaAppEmbed,
  isRegistrationFormLiveOnStorefront,
  isRegistrationPageStorefrontReady,
} from "./registration-page-storefront.server";
import { REGISTRATION_FORM_BLOCK_HANDLE } from "./theme-extension-setup-status";
import {
  REGISTRATION_PAGE_HANDLE,
  REGISTRATION_PAGE_INTRO,
  REGISTRATION_PAGE_PATH,
  REGISTRATION_PAGE_TITLE,
} from "./registration-page.constants";
import { CACHE_TTL, getCache, invalidateCache, setCache, shopKey } from "./cache.server";

export { REGISTRATION_PAGE_HANDLE, REGISTRATION_PAGE_PATH, REGISTRATION_PAGE_TITLE };

/** Fresh session token first (install/OAuth), then offline token from DB. */
export async function resolveThemeWriteAccessToken(
  shop: string,
  sessionToken?: string | null,
): Promise<string | undefined> {
  const fromSession = typeof sessionToken === "string" ? sessionToken.trim() : "";
  if (fromSession) return fromSession;
  const offline = await getOfflineAccessTokenForShop(shop);
  return offline || undefined;
}

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

function storeHandleFromShop(shop: string): string {
  return shop.replace(/\.myshopify\.com$/i, "");
}

function buildThemeEditorBaseUrl(shop: string): string {
  const storeHandle = storeHandleFromShop(shop);
  // Always use the live theme — numeric IDs from GraphQL can be stale and cause
  // "The specified theme does not exist" in the theme editor.
  return `https://admin.shopify.com/store/${storeHandle}/themes/current/editor`;
}

/** Theme editor deep link: Customer Registration page only — never Default page (Privacy Choices, etc.). */
export function buildRegistrationPageThemeEditorUrl(
  shop: string,
  opts?: {
    pageExists?: boolean;
    /** templates/page.customer-registration.json exists on the live theme */
    templateExists?: boolean;
    /** Registration Form block is already in that template file */
    blockOnTemplate?: boolean;
    /** Force addAppBlockId + newAppsSection (theme editor auto-adds Apps section) */
    forceAddAppsBlock?: boolean;
    /** @deprecated Ignored — URLs always target themes/current */
    themeGid?: string | null;
  },
): string {
  const base = buildThemeEditorBaseUrl(shop);
  const apiKey = (process.env.SHOPIFY_API_KEY || "").trim();
  const params: string[] = [];
  const templateReady = opts?.templateExists === true;

  if (opts?.pageExists !== false) {
    params.push(`previewPath=${encodeURIComponent(REGISTRATION_PAGE_PATH)}`);
  }

  if (templateReady) {
    params.push(`template=${encodeURIComponent(REGISTRATION_PAGE_TEMPLATE)}`);
  }

  const shouldAutoAddAppsBlock =
    templateReady &&
    opts?.blockOnTemplate !== true &&
    opts?.forceAddAppsBlock === true;

  if (shouldAutoAddAppsBlock && apiKey) {
    params.push(
      `addAppBlockId=${encodeURIComponent(`${apiKey}/${REGISTRATION_FORM_BLOCK_HANDLE}`)}`,
      "target=newAppsSection",
    );
  }

  return `${base}?${params.join("&")}`;
}

/** Theme editor preview for Customer Registration — only targets customer-registration template when it exists on the theme. */
export function buildRegistrationPagePreviewThemeEditorUrl(
  shop: string,
  opts?: { templateExists?: boolean },
): string {
  return buildRegistrationPageThemeEditorUrl(shop, {
    pageExists: true,
    templateExists: opts?.templateExists === true,
  });
}

/** @deprecated Use buildRegistrationPagePreviewThemeEditorUrl */
export function buildDefaultPageRegistrationThemeEditorUrl(shop: string): string {
  return buildRegistrationPagePreviewThemeEditorUrl(shop);
}

export function registrationStorefrontUrl(shop: string): string {
  const handle = storeHandleFromShop(shop);
  return `https://${handle}.myshopify.com${REGISTRATION_PAGE_PATH}`;
}

export type RegistrationPageSummary = {
  id: string;
  handle: string;
  isPublished: boolean;
  templateSuffix: string | null;
};

export function invalidateRegistrationPageCache(shop: string): void {
  const key = (shop || "").trim().toLowerCase();
  if (!key) return;
  invalidateCache(shopKey(key, "registrationPage"));
  invalidateThemeSetupStatusCache(key);
}

export async function findRegistrationPage(
  admin: AdminGraphqlClient,
  shop?: string,
): Promise<RegistrationPageSummary | null> {
  const shopKeyNorm = (shop || "").trim().toLowerCase();
  if (shopKeyNorm) {
    const cached = getCache<RegistrationPageSummary | null>(shopKey(shopKeyNorm, "registrationPage"));
    if (cached !== undefined) return cached;
  }

  const page = await queryRegistrationPageByHandle(admin);
  if (shopKeyNorm) {
    setCache(shopKey(shopKeyNorm, "registrationPage"), page, CACHE_TTL.registrationPage);
  }
  return page;
}

async function queryRegistrationPageByHandle(
  admin: AdminGraphqlClient,
): Promise<RegistrationPageSummary | null> {
  const res = await admin.graphql(
    `#graphql
    query RegistrationPageByHandle($query: String!) {
      pages(first: 5, query: $query) {
        nodes {
          id
          handle
          isPublished
          templateSuffix
        }
      }
    }`,
    { variables: { query: `handle:${REGISTRATION_PAGE_HANDLE}` } },
  );
  const json = (await res.json()) as {
    data?: {
      pages?: {
        nodes?: Array<{
          id: string;
          handle: string;
          isPublished?: boolean;
          templateSuffix?: string | null;
        }>;
      };
    };
    errors?: unknown;
  };
  if (json.errors) {
    console.warn("[RegistrationPage] pages query failed:", json.errors);
    return null;
  }
  const nodes = json.data?.pages?.nodes ?? [];
  const exact =
    nodes.find((n) => n.handle?.toLowerCase() === REGISTRATION_PAGE_HANDLE) ?? nodes[0];
  if (exact?.handle) {
    return {
      id: exact.id,
      handle: exact.handle,
      isPublished: exact.isPublished === true,
      templateSuffix: exact.templateSuffix ?? null,
    };
  }
  return null;
}

function pagePublishInput(isPublished: boolean): { isPublished: boolean } {
  return { isPublished };
}

export type CreateCustomerRegistrationPageViaAdminApiResult = {
  ok: boolean;
  created: boolean;
  pageId: string | null;
  handle: string | null;
  userErrors: Array<{ message?: string; code?: string }>;
};

/**
 * Creates the Online Store page at `/pages/customer-registration` via Admin API `pageCreate`.
 * Title: "Customer Registration", handle: `customer-registration`.
 */
export async function createCustomerRegistrationPageViaAdminApi(
  admin: AdminGraphqlClient,
  opts?: { isPublished?: boolean; useDedicatedTemplate?: boolean },
): Promise<CreateCustomerRegistrationPageViaAdminApiResult> {
  const isPublished = opts?.isPublished !== false;
  const useDedicatedTemplate = opts?.useDedicatedTemplate === true;
  const res = await admin.graphql(
    `#graphql
    mutation CreateRegistrationPage($page: PageCreateInput!) {
      pageCreate(page: $page) {
        page {
          id
          handle
          isPublished
        }
        userErrors {
          field
          message
          code
        }
      }
    }`,
    {
      variables: {
        page: {
          title: REGISTRATION_PAGE_TITLE,
          handle: REGISTRATION_PAGE_HANDLE,
          ...pagePublishInput(isPublished),
          ...(useDedicatedTemplate ? { templateSuffix: REGISTRATION_PAGE_HANDLE } : {}),
          body: `<p>${REGISTRATION_PAGE_INTRO}</p>`,
        },
      },
    },
  );
  const json = (await res.json()) as {
    data?: {
      pageCreate?: {
        page?: { id: string; handle: string } | null;
        userErrors?: Array<{ message?: string; code?: string }>;
      };
    };
    errors?: unknown;
  };
  const empty: CreateCustomerRegistrationPageViaAdminApiResult = {
    ok: false,
    created: false,
    pageId: null,
    handle: null,
    userErrors: [],
  };
  if (json.errors) {
    console.warn("[RegistrationPage] pageCreate GraphQL errors:", json.errors);
    return empty;
  }
  const payload = json.data?.pageCreate;
  const userErrors = payload?.userErrors ?? [];
  if (userErrors.length > 0) {
    const alreadyExists = userErrors.some(
      (e) =>
        e.code === "TAKEN" ||
        (e.message && /handle.*taken|already exists/i.test(e.message)),
    );
    if (!alreadyExists) {
      console.warn("[RegistrationPage] pageCreate userErrors:", userErrors);
    }
    return { ...empty, userErrors };
  }
  const page = payload?.page;
  return {
    ok: !!page?.handle,
    created: !!page?.handle,
    pageId: page?.id ?? null,
    handle: page?.handle ?? null,
    userErrors: [],
  };
}

async function createRegistrationPage(
  admin: AdminGraphqlClient,
  isPublished: boolean,
  opts?: { useDedicatedTemplate?: boolean },
): Promise<boolean> {
  const result = await createCustomerRegistrationPageViaAdminApi(admin, {
    isPublished,
    useDedicatedTemplate: opts?.useDedicatedTemplate,
  });
  return result.ok;
}

export async function isRegistrationPageRedirectEnabled(shop: string): Promise<boolean> {
  if (!shop) return false;
  const row = await prisma.appSettings.findUnique({
    where: { shop },
    select: { customerApprovalSettings: true },
  });
  const parsed = parseCustomerApprovalSettings(row?.customerApprovalSettings);
  return parsed.redirectSignInLinksToFormPage !== false;
}

/** Publish or unpublish the auto-created registration page (unpublished = 404 on storefront). */
export async function syncRegistrationPageStorefrontVisibility(
  admin: AdminGraphqlClient,
  shop: string,
  published?: boolean,
): Promise<void> {
  const isPublished = published ?? (await isRegistrationPageRedirectEnabled(shop));
  const existing = await findRegistrationPage(admin);
  if (!existing?.id) return;

  const res = await admin.graphql(
    `#graphql
    mutation SyncRegistrationPageVisibility($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page {
          id
          isPublished
        }
        userErrors {
          message
        }
      }
    }`,
    { variables: { id: existing.id, page: pagePublishInput(isPublished) } },
  );
  const json = (await res.json()) as {
    data?: { pageUpdate?: { userErrors?: Array<{ message?: string }> } };
    errors?: unknown;
  };
  if (json.errors) {
    console.warn("[RegistrationPage] pageUpdate visibility failed:", json.errors);
    return;
  }
  const userErrors = json.data?.pageUpdate?.userErrors ?? [];
  if (userErrors.length > 0) {
    console.warn("[RegistrationPage] pageUpdate visibility userErrors:", userErrors);
  }
}

/** Assign the dedicated registration page template suffix on the Shopify page resource. */
export async function syncRegistrationPageTemplateSuffix(
  admin: AdminGraphqlClient,
): Promise<boolean> {
  const existing = await findRegistrationPage(admin);
  if (!existing?.id) return false;
  if (existing.templateSuffix?.toLowerCase() === REGISTRATION_PAGE_HANDLE) {
    return true;
  }

  const res = await admin.graphql(
    `#graphql
    mutation SyncRegistrationPageTemplate($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page {
          id
          templateSuffix
        }
        userErrors {
          message
        }
      }
    }`,
    {
      variables: {
        id: existing.id,
        page: { templateSuffix: REGISTRATION_PAGE_HANDLE },
      },
    },
  );
  const json = (await res.json()) as {
    data?: { pageUpdate?: { userErrors?: Array<{ message?: string }> } };
    errors?: unknown;
  };
  if (json.errors) {
    console.warn("[RegistrationPage] pageUpdate templateSuffix failed:", json.errors);
    return false;
  }
  const userErrors = json.data?.pageUpdate?.userErrors ?? [];
  if (userErrors.length > 0) {
    console.warn("[RegistrationPage] pageUpdate templateSuffix userErrors:", userErrors);
    return false;
  }
  return true;
}

/**
 * When redirect URL is still empty, point guest/sign-in redirects at the registration page
 * and enable sign-in link redirect so storefront links land on the form page.
 */
export async function syncRegistrationPageRedirectSettings(shop: string): Promise<void> {
  if (!shop) return;

  const row = await prisma.appSettings.findUnique({
    where: { shop },
    select: { customerApprovalSettings: true, defaultLanguage: true, languageOptions: true },
  });
  const parsed = parseCustomerApprovalSettings(row?.customerApprovalSettings);
  const existingRedirect =
    typeof parsed.guestCheckoutRedirectUrl === "string" ? parsed.guestCheckoutRedirectUrl.trim() : "";

  const next: Record<string, unknown> = {
    ...parsed,
    registrationPageHandle: REGISTRATION_PAGE_HANDLE,
    registrationPagePath: REGISTRATION_PAGE_PATH,
  };

  const signInRedirectExplicitlyDisabled = parsed.redirectSignInLinksToFormPage === false;

  if (!signInRedirectExplicitlyDisabled) {
    next.redirectSignInLinksToFormPage = STOREFRONT_REDIRECT_DEFAULTS.redirectSignInLinksToFormPage;
  }

  if (typeof parsed.redirectGuestsFromCheckout !== "boolean") {
    next.redirectGuestsFromCheckout = STOREFRONT_REDIRECT_DEFAULTS.redirectGuestsFromCheckout;
  }
  if (typeof parsed.blockLoggedInWithoutApprovedTag !== "boolean") {
    next.blockLoggedInWithoutApprovedTag = STOREFRONT_REDIRECT_DEFAULTS.blockLoggedInWithoutApprovedTag;
  }

  if (!existingRedirect) {
    next.guestCheckoutRedirectUrl = REGISTRATION_PAGE_PATH;
  }

  const stableJson = (value: Record<string, unknown>) =>
    JSON.stringify(value, Object.keys(value).sort());

  if (row && stableJson(parsed) === stableJson(next)) {
    return;
  }

  const approvalSettingsJson = next as Prisma.InputJsonValue;

  await prisma.appSettings.upsert({
    where: { shop },
    update: {
      customerApprovalSettings: approvalSettingsJson,
      updatedAt: new Date(),
    },
    create: {
      shop,
      defaultLanguage: row?.defaultLanguage || "en",
      languageOptions: row?.languageOptions ?? [],
      customerApprovalSettings: approvalSettingsJson,
    },
  });
  invalidateCache(shopKey(shop, "appSettings"));
}

export type EnsureRegistrationPageResult = {
  pagePath: string;
  created: boolean;
  pageExists: boolean;
  pagePublished: boolean;
  /** Page can load the registration form (theme template file and/or app embed). */
  templateExists: boolean;
  /** templates/page.customer-registration.json on the current published theme. */
  templateFileExists: boolean;
  storefrontReady: boolean;
  blockOnTemplate: boolean;
  themeEditorUrl: string;
  storefrontPageUrl: string;
  templateWriteFailed: boolean;
  /** Shopify blocked themeFilesUpsert — merchant must create the template in the theme editor */
  needsManualTemplate: boolean;
};

/**
 * Ensures the storefront registration page exists and default redirect settings reference it.
 * Requires `read_online_store_pages` + `write_online_store_pages` (or `read_content` / `write_content`).
 */
export async function ensureRegistrationStorefrontPage(
  admin: AdminGraphqlClient,
  shop: string,
  opts?: { accessToken?: string | null; installSetup?: boolean },
): Promise<EnsureRegistrationPageResult> {
  const storefrontPageUrl = registrationStorefrontUrl(shop);

  let created = false;
  let pageExists = false;
  let pagePublished = false;
  let templateExists = false;
  let blockOnTemplate = false;
  try {
    await syncRegistrationPageRedirectSettings(shop);
    const redirectEnabled = await isRegistrationPageRedirectEnabled(shop);
    const shouldPublish = redirectEnabled;
    const themeToken = await resolveThemeWriteAccessToken(shop, opts?.accessToken);
    const themeQuick = opts?.installSetup === true && !isServerlessRuntime();

    const verifiedInitial = await readRegistrationPageTemplateOnMainTheme(admin);
    templateExists = !!verifiedInitial.raw?.trim();
    blockOnTemplate = verifiedInitial.blockOnTemplate;

    if (!templateExists) {
      const write = await createCustomerRegistrationPageTemplate(admin, shop, {
        accessToken: themeToken,
        quick: themeQuick,
      });
      templateExists = write.templateExists;
      if (templateExists) {
        const verified = await readRegistrationPageTemplateOnMainTheme(admin);
        blockOnTemplate = verified.blockOnTemplate;
      }
      if (!blockOnTemplate && !write.themeFileWriteAccessDenied) {
        const templateResult = await ensureRegistrationPageThemeTemplate(admin, {
          quick: themeQuick,
          shop,
          accessToken: themeToken,
        });
        templateExists = templateResult.templateExists || templateExists;
        blockOnTemplate = templateResult.blockOnTemplate;
      }
    } else {
      const templateResult = await ensureRegistrationPageThemeTemplate(admin, {
        quick: themeQuick,
        shop,
        accessToken: themeToken,
      });
      templateExists = templateResult.templateExists || templateExists;
      blockOnTemplate = templateResult.blockOnTemplate || blockOnTemplate;
    }

    const pageWithEmbed = await createCustomerRegistrationPageWithAppEmbed(admin, shop);
    pageExists = pageWithEmbed.pageExists;
    pagePublished = pageWithEmbed.pagePublished;
    created = pageWithEmbed.pageCreated;

    if (templateExists) {
      await syncRegistrationPageTemplateSuffix(admin);
      const existing = await findRegistrationPage(admin);
      pagePublished = existing?.isPublished === true;
    }

    if (pageExists && !shouldPublish && pagePublished) {
      await syncRegistrationPageStorefrontVisibility(admin, shop, false);
      const existing = await findRegistrationPage(admin);
      pagePublished = existing?.isPublished === true;
    }
  } catch (error) {
    console.warn("[RegistrationPage] ensureRegistrationStorefrontPage failed:", error);
  }

  let themeStatus: Awaited<ReturnType<typeof getThemeSetupStatus>> = {
    appEmbedEnabled: false,
    registrationFormBlockOnPage: false,
    registrationFormOnDefaultPage: false,
    registrationPageTemplateExists: false,
    mainThemeId: null,
    themeCheckAvailable: false,
  };
  try {
    themeStatus = await getThemeSetupStatus(admin, shop);
  } catch (error) {
    console.warn("[RegistrationPage] getThemeSetupStatus failed:", error);
  }

  const templateFileOnTheme = templateExists;
  const storefrontReady = isRegistrationPageStorefrontReady({
    pageExists,
    pagePublished,
    templateFileExists: templateFileOnTheme,
    appEmbedEnabled: themeStatus.appEmbedEnabled,
  });
  const formLive = isRegistrationFormLiveOnStorefront({
    blockOnDedicatedTemplate: blockOnTemplate,
    pageExists,
    pagePublished,
    appEmbedEnabled: themeStatus.appEmbedEnabled,
  });

  const themeEditorUrl = buildRegistrationPageThemeEditorUrl(shop, {
    pageExists,
    templateExists: templateFileOnTheme,
    blockOnTemplate,
  });

  invalidateRegistrationPageCache(shop);

  return {
    pagePath: REGISTRATION_PAGE_PATH,
    created,
    pageExists,
    pagePublished,
    templateExists: storefrontReady,
    templateFileExists: templateFileOnTheme,
    storefrontReady,
    blockOnTemplate: formLive,
    themeEditorUrl,
    storefrontPageUrl,
    templateWriteFailed: !storefrontReady,
    needsManualTemplate: !storefrontReady,
  };
}

type RegistrationPageTemplateSetup = {
  pageExists: boolean;
  pagePublished: boolean;
  pageCreated: boolean;
  templateExists: boolean;
  templateCreated: boolean;
  blockOnTemplate: boolean;
  needsManualTemplate: boolean;
};

/**
 * Ensures /pages/customer-registration exists, then templates/page.customer-registration.json,
 * then assigns the page to that template. Order matters — theme file must exist before templateSuffix.
 */
async function ensureRegistrationPageAndTemplateForSetup(
  admin: AdminGraphqlClient,
  shop: string,
  opts?: { accessToken?: string },
): Promise<RegistrationPageTemplateSetup> {
  await syncRegistrationPageRedirectSettings(shop);
  const shouldPublish = await isRegistrationPageRedirectEnabled(shop);

  let verified = await readRegistrationPageTemplateOnMainTheme(admin);
  let templateExists = !!verified.raw?.trim();
  let blockOnTemplate = verified.blockOnTemplate;
  let templateCreated = false;

  if (!templateExists) {
    const write = await createCustomerRegistrationPageTemplate(admin, shop, {
      accessToken: opts?.accessToken,
      quick: true,
    });
    templateExists = write.templateExists;
    templateCreated = write.savedViaApi || write.savedViaCli;
    if (templateExists) {
      verified = await readRegistrationPageTemplateOnMainTheme(admin);
      blockOnTemplate = verified.blockOnTemplate;
    }
  }

  let page = await findRegistrationPage(admin);
  let pageCreated = false;

  if (!page) {
    const createResult = await createCustomerRegistrationPageViaAdminApi(admin, {
      isPublished: shouldPublish,
      useDedicatedTemplate: templateExists,
    });
    if (createResult.created) pageCreated = true;
    page = await findRegistrationPage(admin);
  }

  if (page && templateExists) {
    await syncRegistrationPageTemplateSuffix(admin);
    page = await findRegistrationPage(admin);
  }

  let pagePublished = page?.isPublished === true;
  if (page && shouldPublish && !pagePublished) {
    await syncRegistrationPageStorefrontVisibility(admin, shop, true);
    page = await findRegistrationPage(admin);
    pagePublished = page?.isPublished === true;
  }

  return {
    pageExists: !!page,
    pagePublished,
    pageCreated,
    templateExists,
    templateCreated,
    blockOnTemplate,
    needsManualTemplate: !templateExists && !canUseThemeCliPush(),
  };
}

/** Setup for "Add form to page" — ensures page + template, writes Apps block via API, then opens theme editor. */
export async function runAddRegistrationFormSetup(
  admin: AdminGraphqlClient,
  shop: string,
  accessToken?: string,
): Promise<{
  pageExists: boolean;
  templateExists: boolean;
  blockOnTemplate: boolean;
  themeEditorUrl: string;
  templateWriteFailed: boolean;
  needsManualTemplate: boolean;
  savedViaApi: boolean;
  needsEditorSave: boolean;
}> {
  const fallbackUrl = buildRegistrationPageThemeEditorUrl(shop, {
    pageExists: true,
    templateExists: false,
  });

  try {
    void cleanRegistrationFormOffDefaultPageTemplate(admin).catch((err) => {
      console.warn("[RegistrationPage] cleanRegistrationFormOffDefaultPageTemplate failed:", err);
    });

    const setup = await ensureRegistrationPageAndTemplateForSetup(admin, shop, {
      accessToken,
    });

    let templateExists = setup.templateExists;
    let blockOnTemplate = setup.blockOnTemplate;
    let savedViaApi = setup.templateCreated;
    let themeFileWriteAccessDenied = false;

    if (templateExists && !blockOnTemplate) {
      const templateResult = await ensureRegistrationPageThemeTemplate(admin, {
        quick: false,
        shop,
        accessToken,
      });
      templateExists = templateResult.templateExists || templateExists;
      blockOnTemplate = templateResult.blockOnTemplate;
      savedViaApi = savedViaApi || templateResult.blockOnTemplate;
      themeFileWriteAccessDenied = templateResult.themeFileWriteAccessDenied;

      if (!blockOnTemplate) {
        const verified = await readRegistrationPageTemplateOnMainTheme(admin);
        blockOnTemplate = verified.blockOnTemplate;
      }
    }

    const needsDeepLinkFallback = templateExists && !blockOnTemplate;
    const needsEditorSave = needsDeepLinkFallback && !themeFileWriteAccessDenied;
    const themeEditorUrl = buildRegistrationPageThemeEditorUrl(shop, {
      pageExists: setup.pageExists,
      templateExists,
      blockOnTemplate,
      forceAddAppsBlock: needsDeepLinkFallback,
    });

    console.info("[RegistrationPage] add-form-to-page setup:", {
      pageExists: setup.pageExists,
      templateExists,
      blockOnTemplate,
      themeEditorUrl,
      savedViaApi,
      needsEditorSave,
    });

    return {
      pageExists: setup.pageExists,
      templateExists,
      blockOnTemplate,
      themeEditorUrl,
      templateWriteFailed: !templateExists && canUseThemeCliPush(),
      needsManualTemplate: setup.needsManualTemplate,
      savedViaApi,
      needsEditorSave,
    };
  } catch (error) {
    console.warn("[RegistrationPage] runAddRegistrationFormSetup failed:", error);
    return {
      pageExists: false,
      templateExists: false,
      blockOnTemplate: false,
      themeEditorUrl: fallbackUrl,
      templateWriteFailed: true,
      needsManualTemplate: false,
      savedViaApi: false,
      needsEditorSave: false,
    };
  }
}

/** Ensures the Customer Registration Shopify page exists and is published (setup / Create template). */
async function ensureRegistrationStorefrontPageResource(
  admin: AdminGraphqlClient,
  shop: string,
): Promise<{ pageExists: boolean; pagePublished: boolean; pageCreated: boolean }> {
  let page = await findRegistrationPage(admin);
  if (page?.isPublished) {
    return { pageExists: true, pagePublished: true, pageCreated: false };
  }

  let pageCreated = false;

  if (!page) {
    if (await createRegistrationPage(admin, true, { useDedicatedTemplate: false })) {
      pageCreated = true;
    }
    page = await findRegistrationPage(admin);
  }

  if (!page) {
    return { pageExists: false, pagePublished: false, pageCreated: false };
  }

  if (!page.isPublished) {
    await syncRegistrationPageStorefrontVisibility(admin, shop, true);
    page = await findRegistrationPage(admin);
  }

  return {
    pageExists: !!page,
    pagePublished: page?.isPublished === true,
    pageCreated,
  };
}

export type CreateCustomerRegistrationPageWithAppEmbedResult = {
  pageExists: boolean;
  pagePublished: boolean;
  pageCreated: boolean;
  pageId: string | null;
  pagePath: string;
  pageUrl: string;
  appEmbedEnabled: boolean;
  appEmbedWriteFailed: boolean;
  /** Page is published and Approvefy app embed is active — form scripts run on this page. */
  registrationFormVisible: boolean;
  appEmbedThemeEditorUrl: string;
};

/**
 * Creates (or ensures) the Customer Registration Online Store page via Admin API (`pageCreate`),
 * then enables the Approvefy theme app embed so the registration form is visible on
 * `/pages/customer-registration`.
 *
 * Note: Shopify app embeds are theme-wide (not per-page). The embed loads globally; storefront
 * JS detects the customer-registration path and renders the form there.
 */
export async function createCustomerRegistrationPageWithAppEmbed(
  admin: AdminGraphqlClient,
  shop: string,
): Promise<CreateCustomerRegistrationPageWithAppEmbedResult> {
  const pagePath = REGISTRATION_PAGE_PATH;
  const pageUrl = registrationStorefrontUrl(shop);
  const appEmbedThemeEditorUrl = buildAppEmbedThemeEditorUrl(shop);

  const empty: CreateCustomerRegistrationPageWithAppEmbedResult = {
    pageExists: false,
    pagePublished: false,
    pageCreated: false,
    pageId: null,
    pagePath,
    pageUrl,
    appEmbedEnabled: false,
    appEmbedWriteFailed: true,
    registrationFormVisible: false,
    appEmbedThemeEditorUrl,
  };

  try {
    await syncRegistrationPageRedirectSettings(shop);

    const themeState = await readRegistrationPageTemplateOnMainTheme(admin);
    let page = await findRegistrationPage(admin);
    let pageCreated = false;

    if (!page) {
      const createResult = await createCustomerRegistrationPageViaAdminApi(admin, {
        isPublished: true,
        useDedicatedTemplate: !!themeState.raw?.trim(),
      });
      if (createResult.created) {
        pageCreated = true;
      }
      page = await findRegistrationPage(admin);
    }

    if (!page) {
      return empty;
    }

    if (!page.isPublished) {
      await syncRegistrationPageStorefrontVisibility(admin, shop, true);
      page = await findRegistrationPage(admin);
    }

    const latestTheme = await readRegistrationPageTemplateOnMainTheme(admin);
    if (latestTheme.raw?.trim()) {
      await syncRegistrationPageTemplateSuffix(admin);
      page = await findRegistrationPage(admin);
    }

    const embed = await ensureAppEmbedEnabled(admin);

    const pageExists = !!page;
    const pagePublished = page?.isPublished === true;
    const registrationFormVisible = canServeRegistrationPageViaAppEmbed({
      pageExists,
      pagePublished,
      appEmbedEnabled: embed.enabled,
    });

    return {
      pageExists,
      pagePublished,
      pageCreated,
      pageId: page?.id ?? null,
      pagePath,
      pageUrl,
      appEmbedEnabled: embed.enabled,
      appEmbedWriteFailed: embed.writeFailed,
      registrationFormVisible,
      appEmbedThemeEditorUrl,
    };
  } catch (error) {
    console.warn("[RegistrationPage] createCustomerRegistrationPageWithAppEmbed failed:", error);
    return empty;
  }
}

/** Alias for {@link createCustomerRegistrationPageWithAppEmbed}. */
export const createCustomerRegistrationPageAndEnableAppEmbed =
  createCustomerRegistrationPageWithAppEmbed;

/** Setup for "Create template" — page + template + Registration Form block on Customer Registration. */
export async function runCreateRegistrationTemplateSetup(
  admin: AdminGraphqlClient,
  shop: string,
  accessToken?: string,
): Promise<{
  pageExists: boolean;
  pagePublished: boolean;
  pageCreated: boolean;
  templateExists: boolean;
  blockOnTemplate: boolean;
  savedViaApi: boolean;
  formSavedViaApi: boolean;
  needsManualTemplate: boolean;
  needsEditorSave: boolean;
  themeEditorUrl: string;
}> {
  const buildPreviewThemeEditorUrl = (hasTemplate: boolean) =>
    buildRegistrationPagePreviewThemeEditorUrl(shop, { templateExists: hasTemplate });

  const buildEditorUrl = (opts: {
    templateExists: boolean;
    blockOnTemplate: boolean;
    forceAddAppsBlock?: boolean;
  }) =>
    buildRegistrationPageThemeEditorUrl(shop, {
      pageExists: true,
      templateExists: opts.templateExists,
      blockOnTemplate: opts.blockOnTemplate,
      forceAddAppsBlock: opts.forceAddAppsBlock,
    });

  const failure = {
    pageExists: false,
    pagePublished: false,
    pageCreated: false,
    templateExists: false,
    blockOnTemplate: false,
    savedViaApi: false,
    formSavedViaApi: false,
    needsManualTemplate: true,
    needsEditorSave: false,
    themeEditorUrl: buildPreviewThemeEditorUrl(false),
  };

  try {
    await syncRegistrationPageRedirectSettings(shop);

    const install = await installRegistrationFormOnCustomerRegistrationTemplate(admin, {
      shop,
      accessToken,
      quick: false,
    });

    let themeState = await readRegistrationPageTemplateOnMainTheme(admin);
    let templateExists = install.templateExists || !!themeState.raw?.trim();
    let blockOnTemplate = install.blockOnTemplate || themeState.blockOnTemplate;
    let savedViaApi = install.savedViaApi;
    let formSavedViaApi = install.blockOnTemplate;
    let themeFileWriteAccessDenied = false;

    if (!blockOnTemplate) {
      await createCustomerRegistrationPageTemplate(admin, shop, {
        quick: false,
        accessToken,
      });
      const themeResult = await ensureRegistrationPageThemeTemplate(admin, {
        quick: false,
        shop,
        accessToken,
      });
      themeState = await readRegistrationPageTemplateOnMainTheme(admin);
      templateExists = themeResult.templateExists || !!themeState.raw?.trim();
      blockOnTemplate = themeResult.blockOnTemplate || themeState.blockOnTemplate;
      savedViaApi = savedViaApi || themeResult.created || themeResult.blockOnTemplate;
      formSavedViaApi = blockOnTemplate;
      themeFileWriteAccessDenied = themeResult.themeFileWriteAccessDenied;
    }

    let page = await findRegistrationPage(admin);
    let pageCreated = false;
    if (!page) {
      const createResult = await createCustomerRegistrationPageViaAdminApi(admin, {
        isPublished: true,
        useDedicatedTemplate: templateExists,
      });
      if (createResult.created) pageCreated = true;
      page = await findRegistrationPage(admin);
    }

    if (!page) {
      console.warn("[RegistrationPage] create-template: Customer Registration page was not created");
      return failure;
    }

    if (!page.isPublished) {
      await syncRegistrationPageStorefrontVisibility(admin, shop, true);
      page = await findRegistrationPage(admin);
    }

    if (templateExists) {
      await syncRegistrationPageTemplateSuffix(admin);
      page = await findRegistrationPage(admin);
    }

    await ensureAppEmbedEnabled(admin);

    const pageResult = {
      pageExists: true,
      pagePublished: page?.isPublished === true,
      pageCreated,
    };

    if (templateExists && blockOnTemplate) {
      void cleanRegistrationFormOffDefaultPageTemplate(admin).catch((err) => {
        console.warn("[RegistrationPage] cleanRegistrationFormOffDefaultPageTemplate failed:", err);
      });
      return {
        pageExists: true,
        pagePublished: pageResult.pagePublished,
        pageCreated: pageResult.pageCreated,
        templateExists: true,
        blockOnTemplate: true,
        savedViaApi,
        formSavedViaApi,
        needsManualTemplate: false,
        needsEditorSave: false,
        themeEditorUrl: buildEditorUrl({
          templateExists: true,
          blockOnTemplate: true,
        }),
      };
    }

    void cleanRegistrationFormOffDefaultPageTemplate(admin).catch((err) => {
      console.warn("[RegistrationPage] cleanRegistrationFormOffDefaultPageTemplate failed:", err);
    });

    const needsManualTemplate = !templateExists;
    const needsDeepLinkFallback = templateExists && !blockOnTemplate;
    const needsEditorSave = needsDeepLinkFallback && !themeFileWriteAccessDenied;

    return {
      pageExists: true,
      pagePublished: pageResult.pagePublished,
      pageCreated: pageResult.pageCreated,
      templateExists,
      blockOnTemplate,
      savedViaApi,
      formSavedViaApi,
      needsManualTemplate,
      needsEditorSave,
      themeEditorUrl: templateExists
        ? buildEditorUrl({
            templateExists: true,
            blockOnTemplate,
            forceAddAppsBlock: needsDeepLinkFallback,
          })
        : buildPreviewThemeEditorUrl(false),
    };
  } catch (error) {
    console.warn("[RegistrationPage] runCreateRegistrationTemplateSetup failed:", error);
    return failure;
  }
}
