import { ensureDefaultCustomerB2BForm } from "./default-form-config.server";
import { ensureRegistrationStorefrontPage } from "./registration-page.server";
import { ensureOnboardingFormReviewedWhenFormsExist } from "./onboarding-status.server";
import { ensureAppEmbedEnabled } from "./theme-app-embed.server";

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
    await ensureOnboardingFormReviewedWhenFormsExist(shop);
    const embed = await ensureAppEmbedEnabled(admin);
    const page = await ensureRegistrationStorefrontPage(admin, shop);
    console.info("[AppInstall] Storefront setup complete", {
      shop,
      appEmbedEnabled: embed.enabled,
      appEmbedWriteFailed: embed.writeFailed,
      registrationPageCreated: page.created,
      registrationPageExists: page.pageExists,
      registrationPagePublished: page.pagePublished,
      pagePath: page.pagePath,
    });
  } catch (error) {
    console.error("[AppInstall] Storefront setup failed:", error);
  }
}
