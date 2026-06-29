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
  syncRegistrationPageTemplateSuffix,
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const billingPending = url.searchParams.get("billing") === "callback";

  let formsCount = 0;
  let formReviewed = false;
  let settingsSaved = false;
  let dbUnavailable = false;
  let registrationPageThemeEditorUrl = "";
  let registrationPageStorefrontUrl = "";
  let registrationPageCreated = false;
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

  const t0 = performance.now();

  let appSettingsRow: { customerApprovalSettings: unknown } | null = null;
  try {
    const [formCount, settingsRow] = await Promise.all([
      prisma.formConfig.count({ where: { shop } }),
      getCachedAppSettings(shop),
    ]);
    formsCount = formCount;
    appSettingsRow = settingsRow;
    if (formCount > 0) {
      void ensureOnboardingFormReviewedWhenFormsExist(shop).catch((err) => {
        console.warn("[Home] ensureOnboardingFormReviewedWhenFormsExist failed:", err);
      });
    }
  } catch (error) {
    dbUnavailable = true;
    console.error("[Home] Database query failed:", error);
  }

  let themeSetup = {
    appEmbedEnabled: false,
    registrationFormBlockOnPage: false,
    registrationFormOnDefaultPage: false,
    registrationPageTemplateExists: false,
    mainThemeId: null as string | null,
    themeCheckAvailable: false,
  };
  let existingPage: Awaited<ReturnType<typeof findRegistrationPage>> = null;
  try {
    [themeSetup, existingPage] = await Promise.all([
      getThemeSetupStatus(admin),
      findRegistrationPage(admin),
    ]);
  } catch (error) {
    console.warn("[Home] Theme/page setup check failed:", error);
  }

  if (!dbUnavailable) {
    const approvalSettings = parseCustomerApprovalSettings(appSettingsRow?.customerApprovalSettings);
    formReviewed = isOnboardingFormReviewed(approvalSettings) || formsCount > 0;
    settingsSaved = isOnboardingSettingsSaved(approvalSettings);

    let pageExists = !!existingPage;
    let pagePublished = existingPage?.isPublished === true;
    let templateFileExists = themeSetup.registrationPageTemplateExists;
    let blockOnTemplate = themeSetup.registrationFormBlockOnPage;

    if (themeSetup.themeCheckAvailable) {
      const storefrontReadyInitial = isRegistrationPageStorefrontReady({
        pageExists,
        pagePublished,
        templateFileExists,
        appEmbedEnabled: themeSetup.appEmbedEnabled,
      });
      const needsSuffixSync =
        templateFileExists &&
        existingPage?.templateSuffix?.toLowerCase() !== REGISTRATION_PAGE_HANDLE;

      if (needsSuffixSync && pageExists) {
        try {
          await syncRegistrationPageTemplateSuffix(admin);
          existingPage = await findRegistrationPage(admin);
        } catch (error) {
          console.warn("[Home] syncRegistrationPageTemplateSuffix failed:", error);
        }
      }

      const suffixSynced =
        !templateFileExists ||
        existingPage?.templateSuffix?.toLowerCase() === REGISTRATION_PAGE_HANDLE;
      const setupAlreadyComplete =
        pageExists &&
        pagePublished &&
        templateFileExists &&
        blockOnTemplate &&
        suffixSynced;
      const needsRegistrationPageEnsure =
        !setupAlreadyComplete &&
        (!pageExists || !storefrontReadyInitial || !suffixSynced);

      if (needsRegistrationPageEnsure) {
        try {
          const ensured = await ensureRegistrationStorefrontPage(admin, shop);
          pageExists = ensured.pageExists;
          pagePublished = ensured.pagePublished;
          templateFileExists = ensured.templateFileExists;
          blockOnTemplate = ensured.blockOnTemplate;
          registrationPageCreated = ensured.created;
          registrationNeedsManualTemplate = ensured.needsManualTemplate;
          existingPage = pageExists ? await findRegistrationPage(admin) : null;
        } catch (error) {
          console.warn("[Home] ensureRegistrationStorefrontPage failed:", error);
        }
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
    registrationStorefrontReady = isRegistrationPageStorefrontReady({
      pageExists,
      pagePublished,
      templateFileExists,
      appEmbedEnabled: themeSetup.appEmbedEnabled,
    });
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
