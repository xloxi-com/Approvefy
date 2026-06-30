import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getAnalytics } from "../models/registration-analytics.server";
import { REGISTRATION_PAGE_HANDLE, REGISTRATION_PAGE_PATH } from "./registration-page.constants";
import {
  buildRegistrationPageThemeEditorUrl,
  buildRegistrationPagePreviewThemeEditorUrl,
  ensureRegistrationStorefrontPage,
  findRegistrationPage,
  registrationStorefrontUrl,
  runAddRegistrationFormSetup,
  runCreateRegistrationTemplateSetup,
  resolveThemeWriteAccessToken,
} from "./registration-page.server";
import { cleanRegistrationFormOffDefaultPageTemplate } from "./theme-registration-template.server";
import {
  isRegistrationPageStorefrontReady,
} from "./registration-page-storefront.server";
import { getThemeSetupStatus } from "./theme-setup-status.server";
import { buildAppEmbedThemeEditorUrl, ensureAppEmbedEnabled } from "./theme-app-embed.server";
import {
  ensureOnboardingFormReviewedWhenFormsExist,
  isOnboardingFormReviewed,
  isOnboardingSettingsSaved,
} from "./onboarding-status.server";
import { parseCustomerApprovalSettings } from "./customer-approval-settings.server";
import { getCachedAppSettings } from "./cached-settings.server";

type Analytics = Awaited<ReturnType<typeof getAnalytics>>;

const EMPTY_THEME_SETUP = {
  appEmbedEnabled: false,
  registrationFormBlockOnPage: false,
  registrationFormOnDefaultPage: false,
  registrationPageTemplateExists: false,
  mainThemeId: null as string | null,
  themeCheckAvailable: false,
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const billingPending = url.searchParams.get("billing") === "callback";
  const registrationPageCreated = false;

  const t0 = performance.now();

  let formsCount = 0;
  let formReviewed = false;
  let settingsSaved = false;
  let dbUnavailable = false;
  let registrationPageThemeEditorUrl = "";
  let registrationPageStorefrontUrl = "";
  let registrationPageExists = false;
  let registrationPagePublished = false;
  let registrationPageTemplateExists = false;
  let registrationThemeTemplateFileExists = false;
  let registrationStorefrontReady = false;
  let registrationFormOnDefaultPage = false;
  let appEmbedEnabled = false;
  let registrationFormBlockOnPage = false;
  let themeSetupCheckAvailable = false;
  let registrationNeedsManualTemplate = false;

  let appSettingsRow: { customerApprovalSettings: unknown } | null = null;
  let themeSetup = EMPTY_THEME_SETUP;
  let existingPage: Awaited<ReturnType<typeof findRegistrationPage>> = null;

  const [dbBundle, themeBundle, pageBundle] = await Promise.allSettled([
    Promise.all([
      prisma.formConfig.count({ where: { shop } }),
      getCachedAppSettings(shop),
    ]),
    getThemeSetupStatus(admin, shop),
    findRegistrationPage(admin, shop),
  ]);

  if (dbBundle.status === "fulfilled") {
    const [formCount, settingsRow] = dbBundle.value;
    formsCount = formCount;
    appSettingsRow = settingsRow;
    if (formCount > 0) {
      void ensureOnboardingFormReviewedWhenFormsExist(shop).catch((err) => {
        console.warn("[Home] ensureOnboardingFormReviewedWhenFormsExist failed:", err);
      });
    }
  } else {
    dbUnavailable = true;
    console.error("[Home] Database query failed:", dbBundle.reason);
  }

  if (themeBundle.status === "fulfilled") {
    themeSetup = themeBundle.value;
  } else {
    console.warn("[Home] Theme setup check failed:", themeBundle.reason);
  }

  if (pageBundle.status === "fulfilled") {
    existingPage = pageBundle.value;
  } else {
    console.warn("[Home] Registration page lookup failed:", pageBundle.reason);
  }

  if (!dbUnavailable) {
    const approvalSettings = parseCustomerApprovalSettings(appSettingsRow?.customerApprovalSettings);
    formReviewed = isOnboardingFormReviewed(approvalSettings) || formsCount > 0;
    settingsSaved = isOnboardingSettingsSaved(approvalSettings);

    const pageExists = !!existingPage;
    const pagePublished = existingPage?.isPublished === true;
    const templateFileExists = themeSetup.registrationPageTemplateExists;
    const blockOnTemplate = themeSetup.registrationFormBlockOnPage;

    registrationStorefrontReady = isRegistrationPageStorefrontReady({
      pageExists,
      pagePublished,
      templateFileExists,
      appEmbedEnabled: themeSetup.appEmbedEnabled,
    });

    if (themeSetup.themeCheckAvailable) {
      const needsSuffixSync =
        templateFileExists &&
        existingPage?.templateSuffix?.toLowerCase() !== REGISTRATION_PAGE_HANDLE;
      const setupAlreadyComplete =
        pageExists &&
        pagePublished &&
        templateFileExists &&
        blockOnTemplate &&
        !needsSuffixSync;
      const needsRegistrationPageEnsure =
        !setupAlreadyComplete &&
        (!pageExists || !registrationStorefrontReady || needsSuffixSync);

      if (needsRegistrationPageEnsure) {
        void ensureRegistrationStorefrontPage(admin, shop).catch((error) => {
          console.warn("[Home] ensureRegistrationStorefrontPage background failed:", error);
        });
      }

      void cleanRegistrationFormOffDefaultPageTemplate(admin).catch((err) => {
        console.warn("[Home] cleanRegistrationFormOffDefaultPageTemplate failed:", err);
      });
    }

    registrationPageThemeEditorUrl = buildRegistrationPageThemeEditorUrl(shop, {
      pageExists,
      templateExists: templateFileExists,
      blockOnTemplate,
      themeGid: themeSetup.mainThemeId,
    });
    registrationPageStorefrontUrl = registrationStorefrontUrl(shop);
    registrationPageExists = pageExists;
    registrationPagePublished = pagePublished;
    registrationThemeTemplateFileExists = templateFileExists;
    registrationPageTemplateExists = registrationThemeTemplateFileExists;
    registrationFormOnDefaultPage = themeSetup.registrationFormOnDefaultPage;
    appEmbedEnabled = themeSetup.appEmbedEnabled;
    registrationFormBlockOnPage = blockOnTemplate;
    themeSetupCheckAvailable = themeSetup.themeCheckAvailable;
    registrationNeedsManualTemplate =
      !registrationStorefrontReady && !registrationThemeTemplateFileExists;

    if (!themeSetup.appEmbedEnabled && themeSetup.themeCheckAvailable) {
      void ensureAppEmbedEnabled(admin).catch((err) => {
        console.warn("[Home] ensureAppEmbedEnabled background failed:", err);
      });
    }
  }
  const dbMs = Math.round(performance.now() - t0);

  const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
  const themeEditorUrl = buildAppEmbedThemeEditorUrl(shop);
  const storefrontUrl = `https://${storeHandle}.myshopify.com`;

  const setupTasksTotal = 4;

  const analyticsPromise: Promise<Analytics | null> = getAnalytics(shop).catch(
    (err: unknown) => {
      console.warn("[Home] analytics fetch failed:", err);
      return null;
    },
  );

  return data(
    {
      themeEditorUrl,
      storefrontUrl,
      formsCount,
      formReviewed,
      settingsSaved,
      dbUnavailable,
      setupTasksTotal,
      analytics: analyticsPromise,
      billingPending,
      registrationPagePath: REGISTRATION_PAGE_PATH,
      registrationPageThemeEditorUrl,
      registrationPageStorefrontUrl,
      registrationPageCreated,
      registrationPageExists,
      registrationPagePublished,
      registrationPageTemplateExists,
      registrationThemeTemplateFileExists,
      registrationStorefrontReady,
      registrationFormOnDefaultPage,
      appEmbedEnabled,
      registrationFormBlockOnPage,
      themeSetupCheckAvailable,
      registrationNeedsManualTemplate,
    },
    { headers: { "Server-Timing": `db;dur=${dbMs}` } },
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const shop = session.shop;

  if (intent === "enable-app-embed") {
    const embed = await ensureAppEmbedEnabled(admin);
    return data({
      ok: true as const,
      intent: "enable-app-embed" as const,
      savedViaApi: embed.enabled && !embed.writeFailed,
      writeFailed: embed.writeFailed,
      openUrl: buildAppEmbedThemeEditorUrl(shop),
    });
  }

  if (intent === "create-registration-template") {
    try {
      const token = await resolveThemeWriteAccessToken(shop, session.accessToken);
      const setup = await runCreateRegistrationTemplateSetup(admin, shop, token);
      return data({
        ok: true as const,
        intent: "create-registration-template" as const,
        openUrl: setup.themeEditorUrl,
        templateExists: setup.templateExists,
        blockOnTemplate: setup.blockOnTemplate,
        savedViaApi: setup.savedViaApi,
        formSavedViaApi: setup.formSavedViaApi,
        needsManualTemplate: setup.needsManualTemplate,
        needsEditorSave: setup.needsEditorSave,
        pageExists: setup.pageExists,
        pagePublished: setup.pagePublished,
        pageCreated: setup.pageCreated,
      });
    } catch (error) {
      console.error("[Home] create-registration-template action failed:", error);
      return data({
        ok: false as const,
        intent: "create-registration-template" as const,
        openUrl: buildRegistrationPagePreviewThemeEditorUrl(shop, { templateExists: false }),
      });
    }
  }

  if (intent === "add-registration-form") {
    try {
      const token = await resolveThemeWriteAccessToken(shop, session.accessToken);
      const setup = await runAddRegistrationFormSetup(admin, shop, token);
      return data({
        ok: true as const,
        intent: "add-registration-form" as const,
        openUrl:
          setup.themeEditorUrl ||
          buildRegistrationPageThemeEditorUrl(shop, {
            pageExists: setup.pageExists,
            templateExists: setup.templateExists,
            blockOnTemplate: setup.blockOnTemplate,
          }),
        blockOnTemplate: setup.blockOnTemplate,
        templateExists: setup.templateExists,
        templateWriteFailed: setup.templateWriteFailed,
        needsManualTemplate: setup.needsManualTemplate,
        pageExists: setup.pageExists,
        needsEditorSave: setup.needsEditorSave,
        savedViaApi: setup.savedViaApi,
      });
    } catch (error) {
      console.error("[Home] add-registration-form action failed:", error);
      return data({
        ok: false as const,
        intent: "add-registration-form" as const,
        openUrl: buildRegistrationPageThemeEditorUrl(shop, {
          pageExists: true,
          templateExists: false,
        }),
      });
    }
  }

  return data({ ok: false as const });
};
