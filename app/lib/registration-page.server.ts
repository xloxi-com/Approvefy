import prisma from "../db.server";
import { parseCustomerApprovalSettings } from "./customer-approval-settings.server";

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

/** Theme editor deep link: open the registration page and offer the Registration Form app block. */
export function buildRegistrationPageThemeEditorUrl(shop: string): string {
  const storeHandle = storeHandleFromShop(shop);
  const apiKey = (process.env.SHOPIFY_API_KEY || "").trim();
  const addBlock = apiKey
    ? `&addAppBlockId=${encodeURIComponent(`${apiKey}/registration-form/registration-form`)}&target=newAppsSection`
    : "";
  return (
    `https://admin.shopify.com/store/${storeHandle}/themes/current/editor` +
    `?previewPath=${encodeURIComponent(REGISTRATION_PAGE_PATH)}${addBlock}`
  );
}

export function registrationStorefrontUrl(shop: string): string {
  const handle = storeHandleFromShop(shop);
  return `https://${handle}.myshopify.com${REGISTRATION_PAGE_PATH}`;
}

async function findRegistrationPage(admin: AdminGraphqlClient): Promise<{ id: string; handle: string } | null> {
  const res = await admin.graphql(
    `#graphql
    query RegistrationPageByHandle($query: String!) {
      pages(first: 1, query: $query) {
        nodes {
          id
          handle
        }
      }
    }`,
    { variables: { query: `handle:${REGISTRATION_PAGE_HANDLE}` } },
  );
  const json = (await res.json()) as {
    data?: { pages?: { nodes?: Array<{ id: string; handle: string }> } };
    errors?: unknown;
  };
  if (json.errors) {
    console.warn("[RegistrationPage] pages query failed:", json.errors);
    return null;
  }
  const node = json.data?.pages?.nodes?.[0];
  return node?.handle ? node : null;
}

async function createRegistrationPage(
  admin: AdminGraphqlClient,
  isPublished: boolean,
): Promise<boolean> {
  const res = await admin.graphql(
    `#graphql
    mutation CreateRegistrationPage($page: PageCreateInput!) {
      pageCreate(page: $page) {
        page {
          id
          handle
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
          isPublished,
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
    { variables: { id: existing.id, page: { isPublished } } },
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

  await prisma.appSettings.upsert({
    where: { shop },
    update: {
      customerApprovalSettings: next,
      updatedAt: new Date(),
    },
    create: {
      shop,
      defaultLanguage: row?.defaultLanguage || "en",
      languageOptions: row?.languageOptions ?? [],
      customerApprovalSettings: next,
    },
  });
}

export type EnsureRegistrationPageResult = {
  pagePath: string;
  created: boolean;
  themeEditorUrl: string;
  storefrontPageUrl: string;
};

/**
 * Ensures the storefront registration page exists and default redirect settings reference it.
 * Requires `read_online_store_pages` + `write_online_store_pages` (or `read_content` / `write_content`).
 */
export async function ensureRegistrationStorefrontPage(
  admin: AdminGraphqlClient,
  shop: string,
): Promise<EnsureRegistrationPageResult> {
  const themeEditorUrl = buildRegistrationPageThemeEditorUrl(shop);
  const storefrontPageUrl = registrationStorefrontUrl(shop);

  let created = false;
  try {
    await syncRegistrationPageRedirectSettings(shop);
    const redirectEnabled = await isRegistrationPageRedirectEnabled(shop);

    const existing = await findRegistrationPage(admin);
    if (!existing) {
      created = await createRegistrationPage(admin, redirectEnabled);
      if (!created) {
        const afterCreate = await findRegistrationPage(admin);
        created = !!afterCreate;
      }
    }
    await syncRegistrationPageStorefrontVisibility(admin, shop, redirectEnabled);
  } catch (error) {
    console.warn("[RegistrationPage] ensureRegistrationStorefrontPage failed:", error);
  }

  return {
    pagePath: REGISTRATION_PAGE_PATH,
    created,
    themeEditorUrl,
    storefrontPageUrl,
  };
}
