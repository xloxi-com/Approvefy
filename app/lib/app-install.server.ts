import { ensureDefaultCustomerB2BForm } from "./default-form-config.server";
import { ensureRegistrationStorefrontPage } from "./registration-page.server";
import { ensureOnboardingFormReviewedWhenFormsExist } from "./onboarding-status.server";
import { sessionHasWriteThemesScope } from "./app-scopes.server";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const installSetupInflight = new Map<string, Promise<void>>();

/** Seed default form + storefront registration page when a merchant installs or re-authenticates. */
export async function runAppInstallSetup(
  admin: AdminGraphqlClient,
  shop: string,
  accessToken?: string | null,
  grantedScope?: string | null,
): Promise<void> {
  if (!shop) return;

  const inflight = installSetupInflight.get(shop);
  if (inflight) {
    await inflight;
    return;
  }

  const task = runAppInstallSetupOnce(admin, shop, accessToken, grantedScope).finally(() => {
    installSetupInflight.delete(shop);
  });
  installSetupInflight.set(shop, task);
  await task;
}

async function runAppInstallSetupOnce(
  admin: AdminGraphqlClient,
  shop: string,
  accessToken?: string | null,
  grantedScope?: string | null,
): Promise<void> {
  if (!shop) return;

  const hasWriteThemes = sessionHasWriteThemesScope(grantedScope);
  if (!hasWriteThemes) {
    console.warn(
      "[AppInstall] write_themes not granted yet — merchant must approve theme access on reinstall",
      { shop, grantedScope },
    );
  }

  try {
    await ensureDefaultCustomerB2BForm(shop);
    await ensureOnboardingFormReviewedWhenFormsExist(shop);
    const page = await ensureRegistrationStorefrontPage(admin, shop, {
      accessToken,
      installSetup: true,
    });
    console.info("[AppInstall] Storefront setup complete", {
      shop,
      registrationPageCreated: page.created,
      registrationPageExists: page.pageExists,
      registrationPagePublished: page.pagePublished,
      registrationPageTemplateExists: page.templateExists,
      registrationFormOnTemplate: page.blockOnTemplate,
      storefrontReady: page.storefrontReady,
      templateWriteFailed: page.templateWriteFailed,
      pagePath: page.pagePath,
    });
  } catch (error) {
    console.error("[AppInstall] Storefront setup failed:", error);
  }
}
