import { Suspense, useEffect, useId, type ReactNode } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { Await, data, useLoaderData, useNavigate, Link, useRevalidator } from "react-router";
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
  ensureRegistrationStorefrontPage,
  REGISTRATION_PAGE_PATH,
} from "../lib/registration-page.server";
import { ensureDefaultCustomerB2BForm } from "../lib/default-form-config.server";

type Analytics = Awaited<ReturnType<typeof getAnalytics>>;

const SETUP_TUTORIAL_URL = `${APP_URL.replace(/\/?$/, "")}/`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const billingPending = url.searchParams.get("billing") === "callback";

  let formsCount = 0;
  let hasSettings = false;
  let dbUnavailable = false;
  let registrationPageThemeEditorUrl = "";
  let registrationPageStorefrontUrl = "";
  let registrationPageCreated = false;

  const t0 = performance.now();
  try {
    await ensureDefaultCustomerB2BForm(shop);

    const [formCount, settingsExists, pageResult] = await Promise.all([
      prisma.formConfig.count({ where: { shop } }),
      prisma.appSettings
        .findUnique({ where: { shop }, select: { id: true } })
        .then((r: { id: string } | null) => !!r),
      ensureRegistrationStorefrontPage(admin, shop),
    ]);
    formsCount = formCount;
    hasSettings = settingsExists;
    registrationPageThemeEditorUrl = pageResult.themeEditorUrl;
    registrationPageStorefrontUrl = pageResult.storefrontPageUrl;
    registrationPageCreated = pageResult.created;
  } catch (error) {
    dbUnavailable = true;
    console.error("[Home] Failed to load setup data:", error);
  }
  const dbMs = Math.round(performance.now() - t0);

  const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
  const themeEditorUrl = `https://admin.shopify.com/store/${storeHandle}/themes/current/editor?context=apps`;
  const storefrontUrl = `https://${storeHandle}.myshopify.com`;

  const setupTasksTotal = 2;
  const setupTasksComplete = (formsCount > 0 ? 1 : 0) + (hasSettings ? 1 : 0);

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
      hasSettings,
      dbUnavailable,
      setupTasksComplete,
      setupTasksTotal,
      analytics: analyticsPromise,
      billingPending,
      registrationPagePath: REGISTRATION_PAGE_PATH,
      registrationPageThemeEditorUrl,
      registrationPageStorefrontUrl,
      registrationPageCreated,
    },
    { headers: { "Server-Timing": `db;dur=${dbMs}` } },
  );
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
    hasSettings,
    dbUnavailable,
    setupTasksComplete,
    setupTasksTotal,
    analytics,
    billingPending,
    registrationPagePath,
    registrationPageThemeEditorUrl,
    registrationPageStorefrontUrl,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const progressLabelId = useId();
  const progressPercent = setupTasksTotal
    ? Math.min(100, Math.round((100 * setupTasksComplete) / setupTasksTotal))
    : 0;

  const formDone = formsCount > 0;
  const settingsDone = hasSettings;

  useEffect(() => {
    if (!billingPending) return;
    const timer = window.setInterval(() => revalidator.revalidate(), 2000);
    return () => window.clearInterval(timer);
  }, [billingPending, revalidator]);

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
            <SetupStep
              step={1}
              icon={ThemeEditIcon}
              title="Enable app embed block"
              description="Turn on the Approvefy app embed in your theme (Theme settings → App embeds → Approvefy) so registration scripts load on your storefront."
              optional
              actions={
                <>
                  <Button url={themeEditorUrl} variant="primary" external>
                    Enable app embed
                  </Button>
                  <Button url={storefrontUrl} variant="secondary" external>
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
              description={`Your registration page is at ${registrationPagePath}. Open the theme editor and add the Registration Form block to that page. The store redirect URL is set automatically when empty.`}
              optional
              actions={
                <>
                  <Button
                    url={registrationPageThemeEditorUrl || themeEditorUrl}
                    variant="primary"
                    external
                  >
                    Add form to page
                  </Button>
                  {registrationPageStorefrontUrl ? (
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
              title="Create a registration form"
              description="Build at least one form in Form Builder. Leave the theme embed Form ID blank to use your default form."
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
              description="Set languages, form appearance, and approval workflow — including SMTP, notifications, and storefront messages."
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
