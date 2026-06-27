import { ensureDefaultCustomerB2BForm } from "./default-form-config.server";
import { ensureRegistrationStorefrontPage } from "./registration-page.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

/** Seed default form + storefront registration page when a merchant installs or re-authenticates. */
export async function runAppInstallSetup(
  admin: AdminGraphqlClient,
  shop: string,
): Promise<void> {
  if (!shop) return;

  try {
    await ensureDefaultCustomerB2BForm(shop);
    const page = await ensureRegistrationStorefrontPage(admin, shop);
    console.info("[AppInstall] Storefront setup complete", {
      shop,
      registrationPageCreated: page.created,
      pagePath: page.pagePath,
    });
  } catch (error) {
    console.error("[AppInstall] Storefront setup failed:", error);
  }
}
