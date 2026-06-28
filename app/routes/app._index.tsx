import { Suspense, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Await, data, useFetcher, useLoaderData, useNavigate, Link, useRevalidator } from "react-router";
import {
  Page,
  Text,
  Card,
  BlockStack,
  Button,
  Box,
  InlineStack,
  Icon,
  ProgressBar,
  Banner,
  Layout,
  Badge,
  InlineGrid,
  Divider,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  ViewIcon,
  ThemeEditIcon,
  PageIcon,
  FormsIcon,
  SettingsIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getAnalytics } from "../models/registration-analytics.server";
import { APP_DISPLAY_NAME, APP_URL } from "../lib/app-constants";
import {
  buildRegistrationPageThemeEditorUrl,
  ensureRegistrationStorefrontPage,
  findRegistrationPage,
  registrationStorefrontUrl,
  runAddRegistrationFormSetup,
  runCreateRegistrationTemplateSetup,
  REGISTRATION_PAGE_HANDLE,
  REGISTRATION_PAGE_PATH,
} from "../lib/registration-page.server";
import { cleanRegistrationFormOffDefaultPageTemplate } from "../lib/theme-registration-template.server";
import { getThemeSetupStatus } from "../lib/theme-setup-status.server";
import { buildAppEmbedThemeEditorUrl, ensureAppEmbedEnabled } from "../lib/theme-app-embed.server";
import { parseThemeExtensionSetupStatus } from "../lib/theme-extension-setup-status";
import {
  ensureOnboardingFormReviewedWhenFormsExist,
  isOnboardingFormReviewed,
  isOnboardingSettingsSaved,
} from "../lib/onboarding-status.server";
import { parseCustomerApprovalSettings } from "../lib/customer-approval-settings.server";
import { openThemeEditorUrl } from "../lib/open-theme-editor.client";

type ShopifyAppHome = {
  app?: {
    extensions?: () => Promise<unknown[]>;
  };
};

type Analytics = Awaited<ReturnType<typeof getAnalytics>>;

const SETUP_TUTORIAL_URL = "https://www.youtube.com/watch?v=hOv5IXuW3uU";

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
      prisma.appSettings.findUnique({
        where: { shop },
        select: { customerApprovalSettings: true },
      }),
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
    let templateExists = themeSetup.registrationPageTemplateExists;
    let blockOnTemplate = themeSetup.registrationFormBlockOnPage;

    if (themeSetup.themeCheckAvailable) {
      const needsRegistrationPageEnsure =
        !pageExists ||
        !templateExists ||
        existingPage?.templateSuffix?.toLowerCase() !== REGISTRATION_PAGE_HANDLE;

      if (needsRegistrationPageEnsure) {
        try {
          const ensured = await ensureRegistrationStorefrontPage(admin, shop);
          pageExists = ensured.pageExists;
          pagePublished = ensured.pagePublished;
          templateExists = ensured.templateExists;
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
      templateExists,
      blockOnTemplate,
      themeGid: themeSetup.mainThemeId,
    });
    registrationPageStorefrontUrl = registrationStorefrontUrl(shop);
    registrationPageExists = pageExists;
    registrationPagePublished = pagePublished;
    registrationPageTemplateExists = templateExists;
    registrationFormOnDefaultPage = themeSetup.registrationFormOnDefaultPage;
    appEmbedEnabled = themeSetup.appEmbedEnabled;
    registrationFormBlockOnPage = blockOnTemplate;
    themeSetupCheckAvailable = themeSetup.themeCheckAvailable;

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

  if (intent !== "add-registration-form" && intent !== "create-registration-template") {
    return data({ ok: false as const });
  }

  if (intent === "create-registration-template") {
    try {
      const setup = await runCreateRegistrationTemplateSetup(
        admin,
        shop,
        session.accessToken,
      );
      return data({
        ok: true as const,
        intent: "create-registration-template" as const,
        openUrl: setup.themeEditorUrl,
        templateExists: setup.templateExists,
        created: setup.created,
        savedViaApi: setup.savedViaApi,
        needsManualTemplate: setup.needsManualTemplate,
        pageExists: setup.pageExists,
      });
    } catch (error) {
      console.error("[Home] create-registration-template action failed:", error);
      return data({
        ok: true as const,
        intent: "create-registration-template" as const,
        openUrl: buildRegistrationPageThemeEditorUrl(shop, {
          pageExists: true,
          templateExists: false,
        }),
        templateExists: false,
        created: false,
        savedViaApi: false,
        needsManualTemplate: true,
        pageExists: true,
      });
    }
  }

  try {
    const setup = await runAddRegistrationFormSetup(admin, shop);

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
      savedViaApi: setup.savedViaApi,
      needsEditorSave: setup.needsEditorSave,
    });
  } catch (error) {
    console.error("[Home] add-registration-form action failed:", error);
    return data({
      ok: true as const,
      intent: "add-registration-form" as const,
      openUrl: buildRegistrationPageThemeEditorUrl(shop, {
        pageExists: true,
        templateExists: false,
      }),
      blockOnTemplate: false,
      templateExists: false,
      templateWriteFailed: true,
      needsManualTemplate: false,
      pageExists: true,
      savedViaApi: false,
      needsEditorSave: false,
    });
  }
};

function countsFromAnalytics(analytics: Analytics | null): {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
} {
  if (!analytics) {
    return { pending: 0, approved: 0, rejected: 0, total: 0 };
  }
  const total = analytics.total ?? 0;
  const pending = analytics.pending ?? 0;
  const denied = analytics.denied ?? 0;
  const approved = Math.max(0, total - pending - denied);
  return { pending, approved, rejected: denied, total };
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "caution" | "success" | "critical" | "subdued";
}) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="p" variant="bodySm" tone="subdued">
          {label}
        </Text>
        <Text as="p" variant="headingLg" tone={tone}>
          {value}
        </Text>
      </BlockStack>
    </Card>
  );
}

function MetricsRow({
  analytics,
  formsCount,
}: {
  analytics: Analytics | null;
  formsCount: number;
}) {
  const { pending, approved, total } = countsFromAnalytics(analytics);
  const loading = analytics == null;

  return (
    <InlineGrid columns={{ xs: 2, sm: 2, md: 4 }} gap="400">
      <MetricCard label="Total registrations" value={loading ? "—" : total} />
      <MetricCard label="Pending approval" value={loading ? "—" : pending} tone="caution" />
      <MetricCard label="Approved" value={loading ? "—" : approved} tone="success" />
      <MetricCard label="Registration forms" value={formsCount} />
    </InlineGrid>
  );
}

function SetupStep({
  step,
  icon,
  title,
  description,
  complete,
  optional,
  actions,
  footer,
}: {
  step: number;
  icon: typeof ThemeEditIcon;
  title: string;
  description: string;
  complete?: boolean;
  optional?: boolean;
  actions: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card padding="0">
      <Box padding="500">
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="start" wrap gap="300">
            <InlineStack gap="400" blockAlign="start" wrap={false}>
              <Box
                minWidth="36px"
                minHeight="36px"
                borderRadius="full"
                background={complete ? "bg-fill-success-secondary" : "bg-surface-secondary"}
                padding="200"
              >
                <InlineStack align="center" blockAlign="center">
                  {complete ? (
                    <Icon source={CheckCircleIcon} tone="success" accessibilityLabel="Completed" />
                  ) : (
                    <Icon source={icon} tone="subdued" accessibilityLabel="" />
                  )}
                </InlineStack>
              </Box>
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center" wrap>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Step {step}
                  </Text>
                  {complete ? (
                    <Badge tone="success">Done</Badge>
                  ) : optional ? (
                    <Badge tone="info">Required</Badge>
                  ) : (
                    <Badge tone="attention">To do</Badge>
                  )}
                </InlineStack>
                <Text as="h3" variant="headingSm">
                  {title}
                </Text>
              </BlockStack>
            </InlineStack>
          </InlineStack>
          <Text as="p" variant="bodyMd" tone="subdued">
            {description}
          </Text>
          <InlineStack gap="300" wrap blockAlign="center">
            {actions}
          </InlineStack>
        </BlockStack>
      </Box>
      {footer ? (
        <Box
          background="bg-surface-secondary"
          paddingInline="500"
          paddingBlock="300"
          borderBlockStartWidth="025"
          borderColor="border"
        >
          {footer}
        </Box>
      ) : null}
    </Card>
  );
}

export default function Index() {
  const {
    themeEditorUrl,
    storefrontUrl,
    formsCount,
    formReviewed,
    settingsSaved,
    dbUnavailable,
    setupTasksTotal,
    analytics,
    billingPending,
    registrationPagePath,
    registrationPageThemeEditorUrl,
    registrationPageStorefrontUrl,
    registrationPageExists,
    registrationPagePublished,
    registrationPageTemplateExists,
    registrationFormOnDefaultPage,
    appEmbedEnabled,
    registrationFormBlockOnPage,
    themeSetupCheckAvailable,
    registrationNeedsManualTemplate,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const registrationFormFetcher = useFetcher<typeof action>();
  const appEmbedFetcher = useFetcher<typeof action>();
  const pendingThemeEditorOpenRef = useRef(false);
  const pendingAppEmbedOpenRef = useRef(false);
  const [registrationFormNotice, setRegistrationFormNotice] = useState<string | null>(null);
  const [appEmbedNotice, setAppEmbedNotice] = useState<string | null>(null);
  const [registrationFormBusy, setRegistrationFormBusy] = useState(false);
  const progressLabelId = useId();

  const [extensionSetup, setExtensionSetup] = useState({
    appEmbedEnabled: false,
    registrationFormBlockOnPage: false,
    loaded: false,
  });

  const refreshExtensionSetup = useCallback(async () => {
    try {
      const shopifyGlobal = (globalThis as { shopify?: ShopifyAppHome }).shopify;
      if (!shopifyGlobal?.app?.extensions) return;
      const extensions = await shopifyGlobal.app.extensions();
      const parsed = parseThemeExtensionSetupStatus(Array.isArray(extensions) ? extensions : []);
      setExtensionSetup({
        appEmbedEnabled: parsed.appEmbedEnabled,
        registrationFormBlockOnPage: parsed.registrationFormBlockOnPage,
        loaded: true,
      });
    } catch (err) {
      console.warn("[Home] shopify.app.extensions() failed:", err);
    }
  }, []);

  const appEmbedDone = themeSetupCheckAvailable
    ? appEmbedEnabled
    : extensionSetup.loaded
      ? extensionSetup.appEmbedEnabled
      : appEmbedEnabled;
  const registrationPageFormDone = themeSetupCheckAvailable
    ? registrationFormBlockOnPage
    : extensionSetup.loaded
      ? extensionSetup.registrationFormBlockOnPage
      : registrationFormBlockOnPage;
  const formDone = formReviewed;
  const settingsDone = settingsSaved;

  const setupTasksComplete =
    (appEmbedDone ? 1 : 0) +
    (registrationPageFormDone ? 1 : 0) +
    (formDone ? 1 : 0) +
    (settingsDone ? 1 : 0);

  const progressPercent = setupTasksTotal
    ? Math.min(100, Math.round((100 * setupTasksComplete) / setupTasksTotal))
    : 0;

  useEffect(() => {
    void refreshExtensionSetup();
  }, [refreshExtensionSetup]);

  useEffect(() => {
    if (!billingPending) return;
    const timer = window.setInterval(() => revalidator.revalidate(), 2000);
    return () => window.clearInterval(timer);
  }, [billingPending, revalidator]);

  useEffect(() => {
    const refreshSetup = () => {
      if (document.visibilityState === "visible") {
        revalidator.revalidate();
        void refreshExtensionSetup();
      }
    };
    window.addEventListener("focus", refreshSetup);
    document.addEventListener("visibilitychange", refreshSetup);
    return () => {
      window.removeEventListener("focus", refreshSetup);
      document.removeEventListener("visibilitychange", refreshSetup);
    };
  }, [revalidator, refreshExtensionSetup]);

  const enableAppEmbed = useCallback(() => {
    setAppEmbedNotice(null);
    pendingAppEmbedOpenRef.current = true;
    appEmbedFetcher.submit({ intent: "enable-app-embed" }, { method: "post" });
  }, [appEmbedFetcher]);

  useEffect(() => {
    if (!pendingAppEmbedOpenRef.current) return;
    if (appEmbedFetcher.state !== "idle") return;

    pendingAppEmbedOpenRef.current = false;

    if (!appEmbedFetcher.data?.ok || appEmbedFetcher.data.intent !== "enable-app-embed") {
      setAppEmbedNotice("Could not enable the app embed. Refresh the app and try again.");
      return;
    }

    revalidator.revalidate();

    const openUrl = appEmbedFetcher.data.openUrl;
    if (openUrl) {
      openThemeEditorUrl(openUrl);
    }

    if (appEmbedFetcher.data.savedViaApi) {
      setAppEmbedNotice(
        "Approvefy app embed enabled on your theme. Theme editor opened — click Save if prompted.",
      );
      return;
    }

    setAppEmbedNotice(
      "Theme editor opened — toggle Approvefy under App embeds and click Save. Approve write_themes for Approvefy to auto-enable next time.",
    );
  }, [appEmbedFetcher.state, appEmbedFetcher.data, revalidator]);

  const addRegistrationFormToPage = useCallback(() => {
    setRegistrationFormNotice(null);
    setRegistrationFormBusy(true);
    pendingThemeEditorOpenRef.current = true;

    registrationFormFetcher.submit(
      {
        intent: registrationPageTemplateExists
          ? "add-registration-form"
          : "create-registration-template",
      },
      { method: "post" },
    );
  }, [registrationFormFetcher, registrationPageTemplateExists]);

  useEffect(() => {
    if (!registrationFormBusy) return;
    const timer = window.setTimeout(() => {
      if (registrationFormFetcher.state === "idle") return;
      pendingThemeEditorOpenRef.current = false;
      setRegistrationFormBusy(false);
      const fallbackUrl = registrationPageThemeEditorUrl || themeEditorUrl;
      if (fallbackUrl) {
        openThemeEditorUrl(fallbackUrl);
      }
      setRegistrationFormNotice(
        "Setup took too long — theme editor opened on Customer Registration. Finish the template there, then return and click Add form to page.",
      );
    }, 50_000);
    return () => window.clearTimeout(timer);
  }, [
    registrationFormBusy,
    registrationFormFetcher.state,
    registrationPageThemeEditorUrl,
    themeEditorUrl,
  ]);

  useEffect(() => {
    if (!pendingThemeEditorOpenRef.current) return;
    if (registrationFormFetcher.state !== "idle") return;

    pendingThemeEditorOpenRef.current = false;
    setRegistrationFormBusy(false);

    const formResult = registrationFormFetcher.data;
    if (
      !formResult ||
      formResult.ok !== true ||
      (formResult.intent !== "add-registration-form" &&
        formResult.intent !== "create-registration-template")
    ) {
      setRegistrationFormNotice(
        "Could not set up the registration page. Refresh the app and try again.",
      );
      return;
    }

    revalidator.revalidate();

    const openUrl = formResult.openUrl;
    if (openUrl) {
      openThemeEditorUrl(openUrl);
    }

    if (formResult.intent === "create-registration-template") {
      if (formResult.savedViaApi && formResult.templateExists) {
        setRegistrationFormNotice(
          "Customer Registration template created on your theme. Theme editor opened on that template — click Save to publish the Registration Form block.",
        );
        return;
      }

      if (formResult.templateExists) {
        setRegistrationFormNotice(
          "Customer Registration template is ready in Pages templates. Theme editor opened — click Save after reviewing.",
        );
        return;
      }

      setRegistrationFormNotice(
        "Theme editor opened on Customer Registration. Click Default page at the top → Create template → name it customer-registration → Save. Then return here and click Add form to page.",
      );
      return;
    }

    if (formResult.needsManualTemplate) {
      setRegistrationFormNotice(
        "Theme editor opened on Customer Registration. At the top, click Default page → Create template → name it customer-registration → Save. Return here and click Add form to page.",
      );
      return;
    }

    if (formResult.templateWriteFailed) {
      setRegistrationFormNotice(
        "Theme editor opened on Customer Registration. Approvefy could not write the template automatically — refresh and try again.",
      );
      return;
    }

    if (formResult.needsEditorSave) {
      setRegistrationFormNotice(
        "Theme editor opened on Customer Registration. Apps → Registration Form will be added automatically — click Save to publish.",
      );
      return;
    }

    if (formResult.blockOnTemplate) {
      setRegistrationFormNotice(
        "Registration Form is already on Customer Registration. Theme editor opened for review.",
      );
      return;
    }

    setRegistrationFormNotice(
      "Theme editor opened on Customer Registration. Approve write_themes for Approvefy and try again for fully automatic setup.",
    );
  }, [
    registrationFormFetcher.state,
    registrationFormFetcher.data,
    revalidator,
  ]);

  return (
    <Page
      title={APP_DISPLAY_NAME}
      subtitle="Customer registration and B2B approval workflow"
      primaryAction={{
        content: "View customers",
        onAction: () => navigate("/app/customers"),
      }}
      secondaryActions={[
        { content: "Form Builder", onAction: () => navigate("/app/form-config") },
        { content: "Settings", onAction: () => navigate("/app/settings") },
        { content: "Support", url: APP_URL, external: true },
      ]}
    >
      <Layout>
        {billingPending && (
          <Layout.Section>
            <Banner tone="info" title="Activating your plan">
              Thanks for subscribing — your plan is being confirmed. This page will refresh automatically.
            </Banner>
          </Layout.Section>
        )}

        {dbUnavailable && (
          <Layout.Section>
            <Banner tone="critical" title="Database connection issue detected">
              <p style={{ margin: 0 }}>
                We could not load setup data from the database. Please verify your production{" "}
                <Text as="span" variant="bodyMd" fontWeight="semibold">
                  DATABASE_URL
                </Text>{" "}
                (Supabase pooler on port 6543 with{" "}
                <Text as="span" variant="bodyMd" fontWeight="semibold">
                  ?pgbouncer=true
                </Text>
                ) and{" "}
                <Text as="span" variant="bodyMd" fontWeight="semibold">
                  DIRECT_URL
                </Text>{" "}
                (direct port 5432), then redeploy.
              </p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Suspense
            fallback={
              <InlineGrid columns={{ xs: 2, sm: 2, md: 4 }} gap="400">
                {[1, 2, 3, 4].map((n) => (
                  <Card key={n}>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Loading…
                    </Text>
                  </Card>
                ))}
              </InlineGrid>
            }
          >
            <Await
              resolve={analytics}
              errorElement={
                <MetricsRow analytics={null} formsCount={formsCount} />
              }
            >
              {(resolved) => <MetricsRow analytics={resolved} formsCount={formsCount} />}
            </Await>
          </Suspense>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Getting started
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Complete these steps to show your registration form on the storefront and route new sign-ups
                  into your approval workflow.
                </Text>
              </BlockStack>
              <Divider />
              <InlineStack align="space-between" blockAlign="center" wrap={false}>
                <Text id={progressLabelId} as="span" variant="bodySm" fontWeight="medium">
                  {setupTasksComplete} of {setupTasksTotal} configuration steps complete
                </Text>
                <Text as="span" variant="bodySm" tone="subdued">
                  {progressPercent}%
                </Text>
              </InlineStack>
              <ProgressBar
                progress={progressPercent}
                tone="primary"
                size="small"
                ariaLabelledBy={progressLabelId}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="400">
            {!registrationPageExists && (
              <Banner tone="warning" title="Registration page not ready">
                Approvefy could not create the storefront registration page yet. Refresh this page — if it
                persists, re-open the app and approve the updated permissions when prompted.
              </Banner>
            )}
            {registrationPageExists && !registrationPagePublished && (
              <Banner tone="warning" title="Registration page is not published">
                {registrationPagePath} is hidden on your storefront. Open Settings → Store, confirm
                &quot;Redirect header customer account icon&quot; is enabled, click Save — Approvefy will
                publish the page automatically.
              </Banner>
            )}
            {registrationFormOnDefaultPage && (
              <Banner tone="warning" title="Registration Form is on the wrong page template">
                The Registration Form block is on the <Text as="span" variant="bodyMd" fontWeight="semibold">Default page</Text>{" "}
                template (e.g. Your Privacy Choices). Remove it there in the theme editor (Template → Apps → Registration Form → Remove), click Save,
                then use &quot;Add form to page&quot; — Approvefy adds it only to{" "}
                <Text as="span" variant="bodyMd" fontWeight="semibold">
                  Customer Registration
                </Text>{" "}
                ({registrationPagePath}).
              </Banner>
            )}
            {registrationPageExists && !registrationPageTemplateExists && (
              <Banner tone="warning" title="Create Customer Registration template">
                <p style={{ margin: 0 }}>
                  Approvefy cannot auto-create the theme template (Shopify permission). Click{" "}
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    Create registration template
                  </Text>{" "}
                  below. In the theme editor: click{" "}
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    Default page
                  </Text>{" "}
                  at the top →{" "}
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    Create template
                  </Text>{" "}
                  → name it{" "}
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    customer-registration
                  </Text>{" "}
                  → Save. Then click{" "}
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    Add form to page
                  </Text>
                  .
                </p>
              </Banner>
            )}
            {appEmbedNotice ? (
              <Banner
                tone={appEmbedNotice.includes("Could not") ? "warning" : "success"}
                title="App embed setup"
                onDismiss={() => setAppEmbedNotice(null)}
              >
                <p style={{ margin: 0 }}>{appEmbedNotice}</p>
              </Banner>
            ) : null}
            {registrationFormNotice ? (
              <Banner
                tone={registrationFormNotice.includes("could not create") ? "warning" : "success"}
                title="Registration page setup"
                onDismiss={() => setRegistrationFormNotice(null)}
              >
                <p style={{ margin: 0 }}>{registrationFormNotice}</p>
              </Banner>
            ) : null}
            {!themeSetupCheckAvailable && !extensionSetup.loaded && (
              <Banner tone="info" title="Theme setup status unavailable">
                Approvefy could not read your live theme files. Re-open the app and approve the updated
                permissions if prompted, then refresh this page.
              </Banner>
            )}
            <SetupStep
              step={1}
              icon={ThemeEditIcon}
              title="Enable app embed block"
              description="Turn on the Approvefy app embed in your theme (Theme settings → App embeds → Approvefy). Required for the header account icon redirect and registration scripts on every page."
              complete={appEmbedDone}
              optional={!appEmbedDone}
              actions={
                <>
                  {appEmbedDone ? (
                    <Button url={themeEditorUrl} variant="secondary" external>
                      Open theme editor
                    </Button>
                  ) : (
                    <Button
                      onClick={enableAppEmbed}
                      loading={appEmbedFetcher.state !== "idle"}
                      variant="primary"
                    >
                      Enable app embed
                    </Button>
                  )}
                  <Button
                    url={registrationPageStorefrontUrl || `${storefrontUrl}${registrationPagePath}`}
                    variant="secondary"
                    external
                  >
                    Preview theme
                  </Button>
                </>
              }
              footer={
                <InlineStack align="space-between" blockAlign="center" gap="400" wrap>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Required for storefront activation
                  </Text>
                  <Button variant="plain" icon={ViewIcon} url={SETUP_TUTORIAL_URL} external>
                    View tutorial
                  </Button>
                </InlineStack>
              }
            />

            <SetupStep
              step={2}
              icon={PageIcon}
              title="Add form to registration page"
              description={`Opens only the Customer Registration template (${registrationPagePath}) — never Default page. The Registration Form block is added exclusively to this page.`}
              complete={registrationPageFormDone}
              optional={!registrationPageFormDone}
              actions={
                <>
                  {registrationPageFormDone ? (
                    <Button
                      url={registrationPageThemeEditorUrl || themeEditorUrl}
                      variant="secondary"
                      external
                    >
                      Open page in theme editor
                    </Button>
                  ) : (
                    <Button
                      onClick={addRegistrationFormToPage}
                      loading={registrationFormBusy || registrationFormFetcher.state !== "idle"}
                      variant="primary"
                    >
                      {!registrationPageTemplateExists
                        ? "Create registration template"
                        : "Add form to page"}
                    </Button>
                  )}
                  {registrationPageStorefrontUrl && registrationPagePublished ? (
                    <Button url={registrationPageStorefrontUrl} variant="secondary" external>
                      Preview page
                    </Button>
                  ) : null}
                </>
              }
            />

            <SetupStep
              step={3}
              icon={FormsIcon}
              title="Review your registration form"
              description="A default Customer B2B form is created when you install Approvefy. Open Form Builder anytime to customize fields or add more forms."
              complete={formDone}
              actions={
                <Link to="/app/form-config" prefetch="render">
                  <Button variant={formDone ? "secondary" : "primary"}>
                    {formDone ? "Open Form Builder" : "Go to Form Builder"}
                  </Button>
                </Link>
              }
            />

            <SetupStep
              step={4}
              icon={SettingsIcon}
              title="Configure settings"
              description="Set languages, form appearance, and approval workflow — including SMTP, notifications, and storefront messages. Save Settings once to complete this step."
              complete={settingsDone}
              actions={
                <Link to="/app/settings" prefetch="render">
                  <Button variant={settingsDone ? "secondary" : "primary"}>
                    {settingsDone ? "Open Settings" : "Go to Settings"}
                  </Button>
                </Link>
              }
            />
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">
                Quick links
              </Text>
              <InlineStack gap="400" wrap>
                <Button variant="plain" onClick={() => navigate("/app/customers")}>
                  Review customers
                </Button>
                <Button variant="plain" onClick={() => navigate("/app/form-config")}>
                  Form Builder
                </Button>
                <Button variant="plain" onClick={() => navigate("/app/settings")}>
                  Settings
                </Button>
                <Button variant="plain" url={APP_URL} external>
                  Help & support
                </Button>
                <Button variant="plain" url={SETUP_TUTORIAL_URL} external>
                  Documentation
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
