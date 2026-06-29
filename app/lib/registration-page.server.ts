import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { parseCustomerApprovalSettings } from "./customer-approval-settings.server";
import { getOfflineAccessTokenForShop } from "../models/approval.server";
import {
  cleanRegistrationFormOffDefaultPageTemplate,
  createCustomerRegistrationPageTemplate,
  ensureRegistrationPageThemeTemplate,
  readRegistrationPageTemplateOnMainTheme,
  REGISTRATION_PAGE_TEMPLATE,
} from "./theme-registration-template.server";
import { ensureAppEmbedEnabled } from "./theme-app-embed.server";
import { canUseThemeCliPush } from "./theme-cli-push.server";
import { getThemeSetupStatus } from "./theme-setup-status.server";
import {
  canServeRegistrationPageViaAppEmbed,
  isRegistrationFormLiveOnStorefront,
  isRegistrationPageStorefrontReady,
} from "./registration-page-storefront.server";
import { REGISTRATION_FORM_BLOCK_HANDLE } from "./theme-extension-setup-status";
import {
  REGISTRATION_PAGE_HANDLE,
  REGISTRATION_PAGE_PATH,
  REGISTRATION_PAGE_TITLE,
} from "./registration-page.constants";

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
    (opts?.forceAddAppsBlock === true || apiKey.length > 0);

  if (shouldAutoAddAppsBlock && apiKey) {
    params.push(
      `addAppBlockId=${encodeURIComponent(`${apiKey}/${REGISTRATION_FORM_BLOCK_HANDLE}`)}`,
      "target=newAppsSection",
    );
  }

  return `${base}?${params.join("&")}`;
}

export function registrationStorefrontUrl(shop: string): string {
  const handle = storeHandleFromShop(shop);
  return `https://${handle}.myshopify.com${REGISTRATION_PAGE_PATH}`;
}

export async function findRegistrationPage(
  admin: AdminGraphqlClient,
): Promise<{
  id: string;
  handle: string;
  isPublished: boolean;
  templateSuffix: string | null;
} | null> {
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

async function createRegistrationPage(
  admin: AdminGraphqlClient,
  isPublished: boolean,
  opts?: { useDedicatedTemplate?: boolean },
): Promise<boolean> {
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
          body: "<p>Please complete the registration form below to apply for a customer account.</p>",
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
  if (json.errors) {
    console.warn("[RegistrationPage] pageCreate GraphQL errors:", json.errors);
    return false;
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
    return false;
  }
  return !!payload?.page?.handle;
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
async function syncRegistrationPageTemplateSuffix(admin: AdminGraphqlClient): Promise<void> {
  const existing = await findRegistrationPage(admin);
  if (!existing?.id) return;

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
    return;
  }
  const userErrors = json.data?.pageUpdate?.userErrors ?? [];
  if (userErrors.length > 0) {
    console.warn("[RegistrationPage] pageUpdate templateSuffix userErrors:", userErrors);
  }
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
    next.redirectSignInLinksToFormPage = true;
  }

  if (!existingRedirect) {
    next.guestCheckoutRedirectUrl = REGISTRATION_PAGE_PATH;
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
  let templateWriteFailed = false;
  let needsManualTemplate = false;
  try {
    await syncRegistrationPageRedirectSettings(shop);
    await ensureAppEmbedEnabled(admin);
    const redirectEnabled = await isRegistrationPageRedirectEnabled(shop);
    const shouldPublish = redirectEnabled;
    const themeToken = await resolveThemeWriteAccessToken(shop, opts?.accessToken);

    const verifiedInitial = await readRegistrationPageTemplateOnMainTheme(admin);
    templateExists = !!verifiedInitial.raw?.trim();
    blockOnTemplate = verifiedInitial.blockOnTemplate;

    if (!templateExists) {
      const write = await createCustomerRegistrationPageTemplate(admin, shop, {
        accessToken: themeToken,
        quick: opts?.installSetup === true,
      });
      templateExists = write.templateExists;
      if (templateExists) {
        const verified = await readRegistrationPageTemplateOnMainTheme(admin);
        blockOnTemplate = verified.blockOnTemplate;
      } else if (!write.themeFileWriteAccessDenied) {
        const templateResult = await ensureRegistrationPageThemeTemplate(admin, { quick: true });
        templateExists = templateResult.templateExists;
        blockOnTemplate = templateResult.blockOnTemplate;
      }
      needsManualTemplate =
        !templateExists && write.themeFileWriteAccessDenied && !canUseThemeCliPush();
      templateWriteFailed = !templateExists;
    }

    let existing = await findRegistrationPage(admin);
    if (!existing) {
      created = await createRegistrationPage(admin, shouldPublish, {
        useDedicatedTemplate: templateExists,
      });
      existing = await findRegistrationPage(admin);
      if (existing) created = true;
    }

    pageExists = !!existing;
    pagePublished = existing?.isPublished === true;

    if (pageExists && shouldPublish && !pagePublished) {
      await syncRegistrationPageStorefrontVisibility(admin, shop, true);
      existing = await findRegistrationPage(admin);
      pagePublished = existing?.isPublished === true;
    } else if (pageExists) {
      await syncRegistrationPageStorefrontVisibility(admin, shop, shouldPublish);
      existing = await findRegistrationPage(admin);
      pagePublished = existing?.isPublished === true;
    }

    // 2) Assign template suffix once page.customer-registration.json exists on the theme.
    if (pageExists && templateExists) {
      const suffixMismatch =
        existing?.templateSuffix?.toLowerCase() !== REGISTRATION_PAGE_HANDLE;
      if (suffixMismatch) {
        await syncRegistrationPageTemplateSuffix(admin);
        existing = await findRegistrationPage(admin);
      }
    }

    if (shouldPublish && (!pageExists || !pagePublished)) {
      if (!pageExists) {
        await createRegistrationPage(admin, true, { useDedicatedTemplate: templateExists });
      } else if (existing?.id) {
        await syncRegistrationPageStorefrontVisibility(admin, shop, true);
      }
      existing = await findRegistrationPage(admin);
      pageExists = !!existing;
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
    themeStatus = await getThemeSetupStatus(admin);
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
 * then assigns the page to that template. Order matters — template suffix before theme file exists fails.
 */
async function ensureRegistrationPageAndTemplateForSetup(
  admin: AdminGraphqlClient,
  shop: string,
  opts?: { accessToken?: string },
): Promise<RegistrationPageTemplateSetup> {
  await syncRegistrationPageRedirectSettings(shop);
  const shouldPublish = await isRegistrationPageRedirectEnabled(shop);

  let page = await findRegistrationPage(admin);
  let pageCreated = false;

  if (!page) {
    const created = await createRegistrationPage(admin, shouldPublish, {
      useDedicatedTemplate: false,
    });
    if (created) pageCreated = true;
    page = await findRegistrationPage(admin);
  }

  let verified = await readRegistrationPageTemplateOnMainTheme(admin);
  let templateExists = !!verified.raw?.trim();
  let blockOnTemplate = verified.blockOnTemplate;
  let templateCreated = false;

  if (!templateExists) {
    const write = await createCustomerRegistrationPageTemplate(admin, shop, {
      accessToken: opts?.accessToken,
    });
    templateExists = write.templateExists;
    templateCreated = write.savedViaApi || write.savedViaCli;
    if (templateExists) {
      verified = await readRegistrationPageTemplateOnMainTheme(admin);
      blockOnTemplate = verified.blockOnTemplate;
    }
  }

  if (page && templateExists) {
    const suffixMismatch = page.templateSuffix?.toLowerCase() !== REGISTRATION_PAGE_HANDLE;
    if (suffixMismatch) {
      await syncRegistrationPageTemplateSuffix(admin);
      page = await findRegistrationPage(admin);
    }
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

/** Creates /pages/customer-registration and publishes it on the storefront. */
export async function runCreateRegistrationPageSetup(
  admin: AdminGraphqlClient,
  shop: string,
): Promise<{
  pageExists: boolean;
  pagePublished: boolean;
  pageCreated: boolean;
  themeEditorUrl: string;
}> {
  await syncRegistrationPageRedirectSettings(shop);

  let page = await findRegistrationPage(admin);
  let pageCreated = false;

  if (!page) {
    const created = await createRegistrationPage(admin, true, { useDedicatedTemplate: false });
    if (created) pageCreated = true;
    page = await findRegistrationPage(admin);
  }

  let pagePublished = page?.isPublished === true;
  if (page && !pagePublished) {
    await syncRegistrationPageStorefrontVisibility(admin, shop, true);
    page = await findRegistrationPage(admin);
    pagePublished = page?.isPublished === true;
  }

  const verified = await readRegistrationPageTemplateOnMainTheme(admin);

  return {
    pageExists: !!page,
    pagePublished,
    pageCreated,
    themeEditorUrl: buildRegistrationPageThemeEditorUrl(shop, {
      pageExists: !!page,
      templateExists: !!verified.raw?.trim(),
      blockOnTemplate: verified.blockOnTemplate,
    }),
  };
}

/** Publishes an existing registration page on the storefront. */
export async function runPublishRegistrationPageSetup(
  admin: AdminGraphqlClient,
  shop: string,
): Promise<{
  pageExists: boolean;
  pagePublished: boolean;
}> {
  await syncRegistrationPageRedirectSettings(shop);

  let page = await findRegistrationPage(admin);
  if (!page) {
    await createRegistrationPage(admin, true, { useDedicatedTemplate: false });
    page = await findRegistrationPage(admin);
  }

  if (page) {
    await syncRegistrationPageStorefrontVisibility(admin, shop, true);
    page = await findRegistrationPage(admin);
  }

  return {
    pageExists: !!page,
    pagePublished: page?.isPublished === true,
  };
}

/** Creates templates/page.customer-registration.json on the live theme. */
export async function runCreateRegistrationTemplateOnlySetup(
  admin: AdminGraphqlClient,
  shop: string,
  accessToken?: string,
): Promise<{
  pageExists: boolean;
  pagePublished: boolean;
  templateExists: boolean;
  /** Theme JSON file on the live theme (false when only app-embed mode is used). */
  templateFileExists: boolean;
  servedViaAppEmbed: boolean;
  templateCreated: boolean;
  needsManualTemplate: boolean;
  needsThemeEditorTemplate: boolean;
  blockOnTemplate: boolean;
  themeFileWriteAccessDenied: boolean;
  themeEditorUrl: string;
  themeCliAvailable: boolean;
}> {
  const redirectSync = syncRegistrationPageRedirectSettings(shop);

  const [pageInitial, verifiedInitial] = await Promise.all([
    findRegistrationPage(admin),
    readRegistrationPageTemplateOnMainTheme(admin),
    redirectSync,
  ]);

  let page = pageInitial;
  let verified = verifiedInitial;
  let templateExists = !!verified.raw?.trim();
  let templateCreated = false;
  let themeFileWriteAccessDenied = false;

  if (!page) {
    await createRegistrationPage(admin, true, { useDedicatedTemplate: false });
    page = await findRegistrationPage(admin);
  }

  if (!templateExists) {
    const token = accessToken ?? (await resolveThemeWriteAccessToken(shop));
    const write = await createCustomerRegistrationPageTemplate(admin, shop, {
      accessToken: token,
      quick: true,
    });
    templateExists = write.templateExists;
    templateCreated = write.savedViaApi || write.savedViaCli;
    themeFileWriteAccessDenied = write.themeFileWriteAccessDenied;
    verified = await readRegistrationPageTemplateOnMainTheme(admin);
    templateExists = templateExists || !!verified.raw?.trim();
  }

  if (templateExists && page) {
    if (page.templateSuffix?.toLowerCase() !== REGISTRATION_PAGE_HANDLE) {
      await syncRegistrationPageTemplateSuffix(admin);
      page = await findRegistrationPage(admin);
    }
  }

  if (page && !page.isPublished) {
    await syncRegistrationPageStorefrontVisibility(admin, shop, true);
    page = await findRegistrationPage(admin);
  }

  const themeSetup = await getThemeSetupStatus(admin);
  const pagePublished = page?.isPublished === true;
  const templateFileExists = templateExists;
  const servedViaAppEmbed =
    !templateFileExists &&
    canServeRegistrationPageViaAppEmbed({
      pageExists: !!page,
      pagePublished,
      appEmbedEnabled: themeSetup.appEmbedEnabled,
    });
  const templateReady = isRegistrationPageStorefrontReady({
    pageExists: !!page,
    pagePublished,
    templateFileExists,
    appEmbedEnabled: themeSetup.appEmbedEnabled,
  });
  const blockOnTemplate = isRegistrationFormLiveOnStorefront({
    blockOnDedicatedTemplate: verified.blockOnTemplate,
    pageExists: !!page,
    pagePublished,
    appEmbedEnabled: themeSetup.appEmbedEnabled,
  });

  console.info("[RegistrationPage] create-registration-template setup:", {
    pageExists: !!page,
    pagePublished,
    templateFileExists,
    servedViaAppEmbed,
    templateReady,
    templateCreated,
    templateSuffix: page?.templateSuffix,
    themeFileWriteAccessDenied,
    appEmbedEnabled: themeSetup.appEmbedEnabled,
  });

  return {
    pageExists: !!page,
    pagePublished,
    templateExists: templateReady,
    templateFileExists,
    servedViaAppEmbed,
    templateCreated,
    needsManualTemplate: !templateFileExists && themeFileWriteAccessDenied,
    needsThemeEditorTemplate: !templateFileExists && themeFileWriteAccessDenied,
    blockOnTemplate,
    themeFileWriteAccessDenied,
    themeCliAvailable: canUseThemeCliPush(),
    themeEditorUrl: buildRegistrationPageThemeEditorUrl(shop, {
      pageExists: !!page,
      templateExists: templateFileExists,
      blockOnTemplate: verified.blockOnTemplate,
    }),
  };
}

/** Setup for "Create registration template" — creates page + theme template, then opens theme editor. */
export async function runCreateRegistrationTemplateSetup(
  admin: AdminGraphqlClient,
  shop: string,
  accessToken?: string,
): Promise<{
  pageExists: boolean;
  pagePublished: boolean;
  pageCreated: boolean;
  templateExists: boolean;
  created: boolean;
  savedViaApi: boolean;
  needsManualTemplate: boolean;
  themeEditorUrl: string;
  blockOnTemplate: boolean;
}> {
  const fallbackUrl = buildRegistrationPageThemeEditorUrl(shop, {
    pageExists: true,
    templateExists: false,
  });

  try {
    const setup = await ensureRegistrationPageAndTemplateForSetup(admin, shop, {
      accessToken,
    });

    const themeEditorUrl = buildRegistrationPageThemeEditorUrl(shop, {
      pageExists: setup.pageExists,
      templateExists: setup.templateExists,
      blockOnTemplate: setup.blockOnTemplate,
      forceAddAppsBlock: setup.templateExists && !setup.blockOnTemplate,
    });

    console.info("[RegistrationPage] create-registration-template setup:", {
      pageExists: setup.pageExists,
      pageCreated: setup.pageCreated,
      pagePublished: setup.pagePublished,
      templateExists: setup.templateExists,
      templateCreated: setup.templateCreated,
      themeEditorUrl,
    });

    return {
      pageExists: setup.pageExists,
      pagePublished: setup.pagePublished,
      pageCreated: setup.pageCreated,
      templateExists: setup.templateExists,
      created: setup.pageCreated || setup.templateCreated,
      savedViaApi: setup.templateCreated,
      needsManualTemplate: setup.needsManualTemplate,
      themeEditorUrl,
      blockOnTemplate: setup.blockOnTemplate,
    };
  } catch (error) {
    console.warn("[RegistrationPage] runCreateRegistrationTemplateSetup failed:", error);
    return {
      pageExists: false,
      pagePublished: false,
      pageCreated: false,
      templateExists: false,
      created: false,
      savedViaApi: false,
      needsManualTemplate: true,
      themeEditorUrl: fallbackUrl,
      blockOnTemplate: false,
    };
  }
}

/** Setup for "Add form to page" — ensures page + template, then theme editor deep link adds Registration Form. */
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
    await cleanRegistrationFormOffDefaultPageTemplate(admin);

    const setup = await ensureRegistrationPageAndTemplateForSetup(admin, shop, {
      accessToken,
    });

    const needsEditorSave = setup.templateExists && !setup.blockOnTemplate;
    const themeEditorUrl = buildRegistrationPageThemeEditorUrl(shop, {
      pageExists: setup.pageExists,
      templateExists: setup.templateExists,
      blockOnTemplate: setup.blockOnTemplate,
      forceAddAppsBlock: needsEditorSave,
    });

    console.info("[RegistrationPage] add-form-to-page setup:", {
      pageExists: setup.pageExists,
      templateExists: setup.templateExists,
      themeEditorUrl,
    });

    return {
      pageExists: setup.pageExists,
      templateExists: setup.templateExists,
      blockOnTemplate: setup.blockOnTemplate,
      themeEditorUrl,
      templateWriteFailed: !setup.templateExists && canUseThemeCliPush(),
      needsManualTemplate: setup.needsManualTemplate,
      savedViaApi: setup.templateCreated,
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
