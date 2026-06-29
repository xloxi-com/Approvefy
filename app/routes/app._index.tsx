import { Suspense, useCallback, useEffect, useId, useRef, useState, memo, type ReactNode } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Await, useFetcher, useLoaderData, useNavigate, Link, useRevalidator } from "react-router";
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
import { APP_DISPLAY_NAME, APP_URL } from "../lib/app-constants";
import { parseThemeExtensionSetupStatus } from "../lib/theme-extension-setup-status";
import { openThemeEditorUrl } from "../lib/open-theme-editor.client";

export async function loader(args: LoaderFunctionArgs) {
  const { loader: homeLoader } = await import("../lib/home-route.server");
  return homeLoader(args);
}

export async function action(args: ActionFunctionArgs) {
  const { action: homeAction } = await import("../lib/home-route.server");
  return homeAction(args);
}

type ShopifyAppHome = {
  app?: {
    extensions?: () => Promise<unknown[]>;
  };
};

type HomeAnalytics = {
  total?: number;
  pending?: number;
  denied?: number;
} | null;

const SETUP_TUTORIAL_URL = "https://www.youtube.com/watch?v=hOv5IXuW3uU";

function countsFromAnalytics(analytics: HomeAnalytics): {
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

const MetricCard = memo(function MetricCard({
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
});

const MetricsRow = memo(function MetricsRow({
  analytics,
  formsCount,
}: {
  analytics: HomeAnalytics;
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
});

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
    registrationPagePublished,
    registrationThemeTemplateFileExists,
    registrationFormOnDefaultPage,
    appEmbedEnabled,
    registrationFormBlockOnPage,
    themeSetupCheckAvailable,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const appEmbedFetcher = useFetcher<typeof action>();
  const registrationFetcher = useFetcher<typeof action>();
  const pendingAppEmbedOpenRef = useRef(false);
  const lastRegistrationResultRef = useRef<unknown>(null);
  const [appEmbedNotice, setAppEmbedNotice] = useState<string | null>(null);
  const [registrationNotice, setRegistrationNotice] = useState<string | null>(null);
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

  const submitAddRegistrationForm = useCallback(() => {
    setRegistrationNotice(null);
    setRegistrationNotice("Adding Registration Form to the Customer Registration template…");
    lastRegistrationResultRef.current = null;
    registrationFetcher.submit({ intent: "add-registration-form" }, { method: "post" });
  }, [registrationFetcher]);

  const registrationBusy = registrationFetcher.state !== "idle";
  const registrationBusyIntent = registrationBusy
    ? String(registrationFetcher.formData?.get("intent") ?? "")
    : null;

  useEffect(() => {
    if (registrationFetcher.state !== "idle") return;

    const result = registrationFetcher.data;
    if (!result || result === lastRegistrationResultRef.current) return;
    lastRegistrationResultRef.current = result;

    if (!("intent" in result)) return;

    revalidator.revalidate();

    if (!result.ok) {
      setRegistrationNotice("Could not complete registration page setup. Refresh and try again.");
      return;
    }

    if (result.intent === "add-registration-form") {
      if (result.openUrl) {
        openThemeEditorUrl(result.openUrl);
      }
      if (result.needsManualTemplate) {
        setRegistrationNotice(
          "Create the customer-registration template in the theme editor first, then click Add form to page again.",
        );
        return;
      }
      if (result.needsEditorSave) {
        setRegistrationNotice(
          "Theme editor opened — Registration Form will be added. Click Save to publish.",
        );
        return;
      }
      if (result.blockOnTemplate) {
        setRegistrationNotice("Registration Form is already on Customer Registration.");
        return;
      }
      setRegistrationNotice("Theme editor opened on Customer Registration.");
    }
  }, [registrationFetcher.state, registrationFetcher.data, revalidator]);

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
            {appEmbedNotice ? (
              <Banner
                tone={appEmbedNotice.includes("Could not") ? "warning" : "success"}
                title="App embed setup"
                onDismiss={() => setAppEmbedNotice(null)}
              >
                <p style={{ margin: 0 }}>{appEmbedNotice}</p>
              </Banner>
            ) : null}
            {registrationNotice ? (
              <Banner
                tone={registrationNotice.includes("Could not") ? "warning" : "success"}
                title="Registration page setup"
                onDismiss={() => setRegistrationNotice(null)}
              >
                <p style={{ margin: 0 }}>{registrationNotice}</p>
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
                      onClick={submitAddRegistrationForm}
                      loading={registrationBusyIntent === "add-registration-form"}
                      variant="primary"
                      disabled={!registrationThemeTemplateFileExists}
                    >
                      Add form to page
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
