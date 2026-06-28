import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { parseCustomerApprovalSettings } from "./customer-approval-settings.server";
import {
  cleanRegistrationFormOffDefaultPageTemplate,
  createCustomerRegistrationPageTemplate,
  ensureRegistrationPageThemeTemplate,
  prepareCustomerRegistrationPageForAppsDeepLink,
  readRegistrationPageTemplateOnMainTheme,
  REGISTRATION_APPS_SECTION_ID,
  REGISTRATION_PAGE_TEMPLATE,
} from "./theme-registration-template.server";
import { ensureAppEmbedEnabled } from "./theme-app-embed.server";
import { canUseThemeCliPush } from "./theme-cli-push.server";
import { REGISTRATION_FORM_BLOCK_HANDLE } from "./theme-extension-setup-status";

export const REGISTRATION_PAGE_HANDLE = "customer-registration";
export const REGISTRATION_PAGE_TITLE = "Customer Registration";
export const REGISTRATION_PAGE_PATH = `/pages/${REGISTRATION_PAGE_HANDLE}`;

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

function storeHandleFromShop(shop: string): string {
  return shop.replace(/\.myshopify\.com$/i, "");
}

function themeNumericIdFromGid(themeGid: string | null | undefined): string | null {
  if (!themeGid) return null;
  const match = themeGid.match(/OnlineStoreTheme\/(\d+)/i);
  return match?.[1] ?? null;
}

function buildThemeEditorBaseUrl(shop: string, themeGid?: string | null): string {
  const storeHandle = storeHandleFromShop(shop);
  const themeSegment = themeNumericIdFromGid(themeGid) ?? "current";
  return `https://admin.shopify.com/store/${storeHandle}/themes/${themeSegment}/editor`;
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
    /** MAIN theme GID — deep link targets the same theme Approvefy writes to */
    themeGid?: string | null;
  },
): string {
  const base = buildThemeEditorBaseUrl(shop, opts?.themeGid);
  const apiKey = (process.env.SHOPIFY_API_KEY || "").trim();
  const params: string[] = [];
  const templateReady = opts?.templateExists === true;

  if (opts?.pageExists !== false) {
    params.push(`previewPath=${encodeURIComponent(REGISTRATION_PAGE_PATH)}`);
  }

  // Only deep-link to page.customer-registration after the JSON file exists on the theme.
  // Otherwise Shopify shows: "page.customer-registration template couldn't be found".
  if (templateReady) {
    params.push(`template=${encodeURIComponent(REGISTRATION_PAGE_TEMPLATE)}`);
  }

  const shouldAutoAddAppsBlock =
    templateReady &&
    (opts?.forceAddAppsBlock === true ||
      (apiKey.length > 0 && opts?.blockOnTemplate !== true));

  if (shouldAutoAddAppsBlock && apiKey) {
    params.push(
      `addAppBlockId=${encodeURIComponent(`${apiKey}/${REGISTRATION_FORM_BLOCK_HANDLE}`)}`,
      "target=newAppsSection",
    );
  } else if (templateReady && opts?.blockOnTemplate === true) {
    params.push(`target=sectionId:${REGISTRATION_APPS_SECTION_ID}`);
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
  templateExists: boolean;
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

    // 1) Try to create dedicated theme template via API (requires Shopify theme-file exemption).
    const templateResult = await ensureRegistrationPageThemeTemplate(admin);
    templateExists = templateResult.templateExists;
    blockOnTemplate = templateResult.blockOnTemplate;
    needsManualTemplate =
      !templateExists && templateResult.themeFileWriteAccessDenied && !canUseThemeCliPush();
    templateWriteFailed = false;

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

    // Retry via CLI in local dev when GraphQL theme file APIs require Shopify exemption.
    if (!templateExists) {
      const retry = await createCustomerRegistrationPageTemplate(admin, shop);
      templateExists = retry.templateExists;
      if (retry.templateExists) {
        const verifiedRetry = await readRegistrationPageTemplateOnMainTheme(admin);
        blockOnTemplate = verifiedRetry.blockOnTemplate;
      }
      needsManualTemplate = !templateExists && !canUseThemeCliPush();
      templateWriteFailed = !templateExists && canUseThemeCliPush();
      if (pageExists && templateExists) {
        const pageAfterRetry = await findRegistrationPage(admin);
        if (pageAfterRetry?.templateSuffix?.toLowerCase() !== REGISTRATION_PAGE_HANDLE) {
          await syncRegistrationPageTemplateSuffix(admin);
        }
      }
    }
  } catch (error) {
    console.warn("[RegistrationPage] ensureRegistrationStorefrontPage failed:", error);
  }

  const themeEditorUrl = buildRegistrationPageThemeEditorUrl(shop, {
    pageExists,
    templateExists,
    blockOnTemplate,
  });

  return {
    pagePath: REGISTRATION_PAGE_PATH,
    created,
    pageExists,
    pagePublished,
    templateExists,
    blockOnTemplate,
    themeEditorUrl,
    storefrontPageUrl,
    templateWriteFailed,
    needsManualTemplate,
  };
}

/** Setup for "Create registration template" — writes theme file when allowed, else opens theme editor. */
export async function runCreateRegistrationTemplateSetup(
  admin: AdminGraphqlClient,
  shop: string,
  accessToken?: string,
): Promise<{
  pageExists: boolean;
  templateExists: boolean;
  created: boolean;
  savedViaApi: boolean;
  needsManualTemplate: boolean;
  themeEditorUrl: string;
}> {
  const fallbackUrl = buildRegistrationPageThemeEditorUrl(shop, {
    pageExists: true,
    templateExists: false,
  });

  try {
    let page = await findRegistrationPage(admin);
    if (!page) {
      const shouldPublish = await isRegistrationPageRedirectEnabled(shop);
      await createRegistrationPage(admin, shouldPublish, { useDedicatedTemplate: false });
      page = await findRegistrationPage(admin);
    }

    const verified = await readRegistrationPageTemplateOnMainTheme(admin);
    let templateExists = !!verified.raw?.trim();
    const themeId = verified.themeId;

    if (page) {
      await syncRegistrationPageTemplateSuffix(admin);
    }

    if (!templateExists) {
      const write = await createCustomerRegistrationPageTemplate(admin, shop, {
        accessToken,
      });
      templateExists = write.templateExists;
      if (write.templateExists && page) {
        await syncRegistrationPageTemplateSuffix(admin);
      }

      if (write.templateExists) {
        const themeEditorUrl = buildRegistrationPageThemeEditorUrl(shop, {
          pageExists: true,
          templateExists: true,
          blockOnTemplate: false,
          forceAddAppsBlock: true,
          themeGid: write.themeId ?? themeId,
        });
        return {
          pageExists: !!page,
          templateExists: true,
          created: write.savedViaApi || write.savedViaCli,
          savedViaApi: write.savedViaApi || write.savedViaCli,
          needsManualTemplate: false,
          themeEditorUrl,
        };
      }

      const themeEditorUrl = buildRegistrationPageThemeEditorUrl(shop, {
        pageExists: true,
        templateExists: false,
        themeGid: write.themeId ?? themeId,
      });

      return {
        pageExists: !!page,
        templateExists: false,
        created: false,
        savedViaApi: false,
        needsManualTemplate: write.themeFileWriteAccessDenied || !templateExists,
        themeEditorUrl,
      };
    }

    const blockOnTemplate = verified.blockOnTemplate;

    return {
      pageExists: !!page,
      templateExists: true,
      created: false,
      savedViaApi: false,
      needsManualTemplate: false,
      themeEditorUrl: buildRegistrationPageThemeEditorUrl(shop, {
        pageExists: true,
        templateExists: true,
        blockOnTemplate,
        forceAddAppsBlock: !blockOnTemplate,
        themeGid: themeId,
      }),
    };
  } catch (error) {
    console.warn("[RegistrationPage] runCreateRegistrationTemplateSetup failed:", error);
    return {
      pageExists: true,
      templateExists: false,
      created: false,
      savedViaApi: false,
      needsManualTemplate: true,
      themeEditorUrl: fallbackUrl,
    };
  }
}

/** Setup for "Add form to page" — prepares template, then theme editor deep link adds Apps → Registration Form. */
export async function runAddRegistrationFormSetup(
  admin: AdminGraphqlClient,
  shop: string,
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

    let page = await findRegistrationPage(admin);
    if (!page) {
      const shouldPublish = await isRegistrationPageRedirectEnabled(shop);
      await createRegistrationPage(admin, shouldPublish, { useDedicatedTemplate: false });
      page = await findRegistrationPage(admin);
    }

    const prep = await prepareCustomerRegistrationPageForAppsDeepLink(admin, { quick: true });

    if (page && prep.templateExists) {
      const suffixMismatch = page.templateSuffix?.toLowerCase() !== REGISTRATION_PAGE_HANDLE;
      if (suffixMismatch) {
        await syncRegistrationPageTemplateSuffix(admin);
        page = await findRegistrationPage(admin);
      }
    }

    const pageExists = !!page;
    const templateExists = prep.templateExists;
    const blockOnTemplate = prep.blockOnTemplate;
    const needsManualTemplate = !templateExists;
    const needsEditorSave = templateExists && !blockOnTemplate;

    const themeEditorUrl = buildRegistrationPageThemeEditorUrl(shop, {
      pageExists: true,
      templateExists,
      blockOnTemplate,
      forceAddAppsBlock: needsEditorSave,
      themeGid: prep.themeId,
    });

    console.info("[RegistrationPage] add-form-to-page theme editor URL:", themeEditorUrl);

    return {
      pageExists,
      templateExists,
      blockOnTemplate,
      themeEditorUrl,
      templateWriteFailed: !templateExists && !prep.themeFileWriteAccessDenied,
      needsManualTemplate,
      savedViaApi: false,
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
