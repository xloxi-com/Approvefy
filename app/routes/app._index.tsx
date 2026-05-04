import { Suspense, useId, type ReactNode } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { Await, data, useLoaderData, useNavigate, Link } from "react-router";
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
  Divider,
  Layout,
  Badge,
} from "@shopify/polaris";
import { CheckCircleIcon, ViewIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getAnalytics } from "../models/registration-analytics.server";
import { APP_DISPLAY_NAME, APP_URL } from "../lib/app-constants";

type Analytics = Awaited<ReturnType<typeof getAnalytics>>;

const SETUP_TUTORIAL_URL = `${APP_URL.replace(/\/?$/, "")}/`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let formsCount = 0;
  let hasSettings = false;
  let dbUnavailable = false;

  const t0 = performance.now();
  try {
    [formsCount, hasSettings] = await Promise.all([
      prisma.formConfig.count({ where: { shop } }),
      prisma.appSettings
        .findUnique({ where: { shop }, select: { id: true } })
        .then((r: { id: string } | null) => !!r),
    ]);
  } catch (error) {
    dbUnavailable = true;
    console.error("[Home] Failed to load setup data:", error);
  }
  const dbMs = Math.round(performance.now() - t0);

  const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
  const themeEditorUrl = `https://admin.shopify.com/store/${storeHandle}/themes/current/editor?context=apps`;
  const storefrontUrl = `https://${storeHandle}.myshopify.com`;

  const setupTasksTotal = 3;
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
    },
    { headers: { "Server-Timing": `db;dur=${dbMs}` } },
  );
};

function countsFromAnalytics(analytics: Analytics | null): {
  pending: number;
  approved: number;
  rejected: number;
} {
  if (!analytics) {
    return { pending: 0, approved: 0, rejected: 0 };
  }
  const total = analytics.total ?? 0;
  const pending = analytics.pending ?? 0;
  const denied = analytics.denied ?? 0;
  const approved = Math.max(0, total - pending - denied);
  return { pending, approved, rejected: denied };
}

function LiveStatusPanel({ analytics }: { analytics: Analytics | null }) {
  const { pending, approved, rejected } = countsFromAnalytics(analytics);

  const row = (label: string, value: number) => (
    <InlineStack align="space-between" blockAlign="center">
      <Text as="span" variant="bodySm" tone="subdued">
        {label}
      </Text>
      <Text as="span" variant="bodySm" fontWeight="semibold">
        {analytics == null ? "—" : value}
      </Text>
    </InlineStack>
  );

  return (
    <Card background="bg-surface-secondary" padding="500">
      <BlockStack gap="400">
        <Text as="p" variant="bodySm" fontWeight="bold" tone="subdued">
          <span className="setup-guide-live-status-label">Live status</span>
        </Text>
        <BlockStack gap="300">
          {row("Pending", pending)}
          {row("Approved", approved)}
          {row("Rejected", rejected)}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

function GuideAnnotatedBlock({
  id,
  stepLabel,
  title,
  description,
  children,
}: {
  id?: string;
  stepLabel: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Layout.AnnotatedSection id={id} title={title} description={description}>
      <Box paddingBlockStart={{ xs: "200", lg: "0" }}>
        <BlockStack gap="300">
          <Text as="p" variant="bodySm" tone="subdued">
            {stepLabel}
          </Text>
          {children}
        </BlockStack>
      </Box>
    </Layout.AnnotatedSection>
  );
}

function StepStatusRow({
  complete,
  heading,
  body,
  action,
}: {
  complete: boolean;
  heading: string;
  body: string;
  action: ReactNode;
}) {
  return (
    <Card padding="500">
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" wrap gap="300">
          <InlineStack gap="300" blockAlign="center" wrap={false}>
            <Box flex="0 0 auto">
              {complete ? (
                <Icon source={CheckCircleIcon} tone="success" accessibilityLabel="Completed" />
              ) : (
                <Box
                  width="22px"
                  height="22px"
                  borderRadius="full"
                  borderWidth="025"
                  borderColor="border"
                  background="bg-surface"
                />
              )}
            </Box>
            <Text as="span" variant="headingSm" tone={complete ? "subdued" : undefined}>
              <span
                style={
                  complete ? { textDecoration: "line-through", textDecorationColor: "var(--p-color-border)" } : undefined
                }
              >
                {heading}
              </span>
            </Text>
          </InlineStack>
          <Badge tone={complete ? "success" : "attention"}>{complete ? "Done" : "To do"}</Badge>
        </InlineStack>
        <Text as="p" variant="bodyMd" tone="subdued">
          {body}
        </Text>
        <Box>{action}</Box>
      </BlockStack>
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
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const progressLabelId = useId();
  const progressPercent = setupTasksTotal
    ? Math.min(100, Math.round((100 * setupTasksComplete) / setupTasksTotal))
    : 0;
  const year = new Date().getFullYear();

  const tutorialLink = (
    <Button variant="plain" icon={ViewIcon} url={SETUP_TUTORIAL_URL} external tone="neutral">
      View Tutorial
    </Button>
  );

  const formDone = formsCount > 0;
  const settingsDone = hasSettings;

  return (
    <div className="app-home-page">
      <Page
        title={APP_DISPLAY_NAME}
        subtitle="Setup guide — full checklist"
        fullWidth
        secondaryActions={[
          { content: "View customers", onAction: () => navigate("/app/customers") },
          { content: "Form Builder", onAction: () => navigate("/app/form-config") },
          { content: "Settings", onAction: () => navigate("/app/settings") },
          { content: "Support", url: APP_URL, external: true },
        ]}
      >
        <div className="app-home-main app-setup-guide app-setup-guide--annotated">
          <BlockStack gap="600">
            <div className="app-nav-tabs-mobile">
              <Box paddingBlockEnd="200">
                <BlockStack gap="200" inlineAlign="start">
                  <InlineStack gap="100" wrap>
                    <Button size="slim" variant="primary" onClick={() => navigate("/app")}>
                      {APP_DISPLAY_NAME}
                    </Button>
                    <Link to="/app/customers" prefetch="render">
                      <Button size="slim">Customers</Button>
                    </Link>
                    <Link to="/app/form-config" prefetch="render">
                      <Button size="slim">Form Builder</Button>
                    </Link>
                    <Link to="/app/settings" prefetch="render">
                      <Button size="slim">Settings</Button>
                    </Link>
                  </InlineStack>
                </BlockStack>
              </Box>
            </div>

            {dbUnavailable && (
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
            )}

            <Box className="app-backend-card setup-guide-overview-card">
              <Card padding="500">
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Overview
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Follow all three steps so Approvefy can show your registration form on the storefront and route
                    new sign-ups into the approval workflow.
                  </Text>
                  <Divider />
                  <InlineStack align="space-between" blockAlign="center" wrap={false}>
                    <Text id={progressLabelId} as="span" variant="headingSm">
                      {setupTasksComplete} of {setupTasksTotal} tasks complete
                    </Text>
                    <Text as="span" variant="bodySm" fontWeight="medium" tone="subdued">
                      {progressPercent}%
                    </Text>
                  </InlineStack>
                  <ProgressBar
                    progress={progressPercent}
                    tone="success"
                    size="medium"
                    ariaLabelledBy={progressLabelId}
                  />
                </BlockStack>
              </Card>
            </Box>

            <Layout>
              <GuideAnnotatedBlock
                id="setup-step-embed"
                stepLabel="Step 1 · Storefront activation"
                title="Enable app embed block"
                description={
                  "Required: the embed loads scripts and mounts the form in your theme (Theme settings → App embeds → Approvefy)."
                }
              >
                <Card padding="0">
                  <Box padding="500">
                    <BlockStack gap="500">
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Turn on the Approvefy app embed in your theme so the registration form appears on your storefront.
                      </Text>
                      <InlineStack gap="300" wrap blockAlign="center">
                        <Button url={themeEditorUrl} variant="primary" external>
                          Enable app embed
                        </Button>
                        <Button url={storefrontUrl} variant="secondary" external>
                          Preview theme
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Box>
                  <Box
                    background="bg-surface-secondary"
                    paddingInline="500"
                    paddingBlock="450"
                    borderBlockStartWidth="025"
                    borderColor="border"
                  >
                    <InlineStack align="space-between" blockAlign="center" gap="400" wrap>
                      <Text as="span" variant="bodySm" tone="subdued">
                        Required step for storefront activation
                      </Text>
                      <span className="setup-guide-tutorial-link">{tutorialLink}</span>
                    </InlineStack>
                  </Box>
                </Card>
              </GuideAnnotatedBlock>

              <GuideAnnotatedBlock
                stepLabel="Step 2 · Registration form"
                title="Create a registration form"
                description={
                  "Build at least one form in Form Builder. Leave the theme embed \"Form ID\" blank to use your default form."
                }
              >
                <StepStatusRow
                  complete={formDone}
                  heading="Create a registration form"
                  body="Build your first form in Form Builder and choose which fields to collect."
                  action={
                    <Link to="/app/form-config" prefetch="render">
                      <Button variant={formDone ? "secondary" : "primary"} size="slim">
                        {formDone ? "Open Form Builder" : "Go to Form Builder"}
                      </Button>
                    </Link>
                  }
                />
              </GuideAnnotatedBlock>

              <GuideAnnotatedBlock
                stepLabel="Step 3 · Behaviour & branding"
                title="Configure settings"
                description={
                  "Set languages, form appearance, and approval workflow (SMTP, notifications, storefront messages)."
                }
              >
                <StepStatusRow
                  complete={settingsDone}
                  heading="Configure settings"
                  body="Set languages, appearance, and approval rules for new registrations."
                  action={
                    <Link to="/app/settings" prefetch="render">
                      <Button variant={settingsDone ? "secondary" : "primary"} size="slim">
                        {settingsDone ? "Open Settings" : "Go to Settings"}
                      </Button>
                    </Link>
                  }
                />
              </GuideAnnotatedBlock>

              <GuideAnnotatedBlock
                stepLabel="Monitor"
                title="Registration pipeline"
                description="Counts update as customers submit applications and you approve or reject them."
              >
                <Suspense
                  fallback={
                    <Card padding="500">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Loading live status…
                      </Text>
                    </Card>
                  }
                >
                  <Await
                    resolve={analytics}
                    errorElement={
                      <Card padding="500">
                        <Text as="p" variant="bodySm" tone="subdued">
                          Live status unavailable.
                        </Text>
                      </Card>
                    }
                  >
                    {(resolved) => <LiveStatusPanel analytics={resolved} />}
                  </Await>
                </Suspense>
              </GuideAnnotatedBlock>
            </Layout>

            <Divider />

            <Box paddingBlock="400">
              <div className="setup-guide-footer-row">
                <Text as="p" variant="bodySm" tone="subdued">
                  © {APP_DISPLAY_NAME} {year}
                </Text>
                <div className="setup-guide-footer-links">
                  <InlineStack gap="500" wrap>
                    <Link to="/app/customers" prefetch="render" className="setup-guide-footer-link">
                      <Button variant="plain" tone="primary">
                        View Customers
                      </Button>
                    </Link>
                    <Button variant="plain" tone="primary" url={APP_URL} external>
                      Support
                    </Button>
                    <Button variant="plain" tone="primary" url={SETUP_TUTORIAL_URL} external>
                      Documentation
                    </Button>
                  </InlineStack>
                </div>
              </div>
            </Box>
          </BlockStack>
        </div>
      </Page>
    </div>
  );
}
