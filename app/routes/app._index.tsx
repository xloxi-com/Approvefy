import { Suspense, useId } from "react";
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
  InlineGrid,
  Banner,
  Divider,
} from "@shopify/polaris";
import { CheckCircleIcon, ViewIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getAnalytics } from "../models/approval.server";
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
    }
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
    { headers: { "Server-Timing": `db;dur=${dbMs}` } }
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
    <Card background="bg-surface-secondary">
      <BlockStack gap="300">
        <Text
          as="p"
          variant="bodySm"
          fontWeight="bold"
          tone="subdued"
        >
          <span style={{ letterSpacing: "0.06em", textTransform: "uppercase" }}>Live status</span>
        </Text>
        <BlockStack gap="200">
          {row("Pending", pending)}
          {row("Approved", approved)}
          {row("Rejected", rejected)}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

function CompletedTaskCard({
  complete,
  title,
  description,
  actionLabel,
  actionHref,
}: {
  complete: boolean;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
}) {
  return (
    <div style={{ opacity: complete ? 0.92 : 1 }}>
      <Card>
        <BlockStack gap="300">
          <InlineStack gap="300" blockAlign="start" wrap={false}>
            <Box flex="0 0 auto">
              <Box paddingBlockStart="025">
                {complete ? (
                  <Icon
                    source={CheckCircleIcon}
                    tone="success"
                    accessibilityLabel="Completed"
                  />
                ) : (
                  <Box
                    width="20px"
                    height="20px"
                    borderRadius="full"
                    borderWidth="025"
                    borderColor="border"
                    background="bg-fill-secondary"
                  />
                )}
              </Box>
            </Box>
            <BlockStack gap="200">
              <Text
                as="p"
                variant="headingSm"
                tone={complete ? "subdued" : undefined}
              >
                <span style={complete ? { textDecoration: "line-through" } : undefined}>
                  {title}
                </span>
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {description}
              </Text>
              <Box>
                <Link to={actionHref} prefetch="render">
                  <Button variant="secondary" size="micro">
                    {actionLabel}
                  </Button>
                </Link>
              </Box>
            </BlockStack>
          </InlineStack>
        </BlockStack>
      </Card>
    </div>
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

  return (
    <div className="app-home-page">
      <Page title={APP_DISPLAY_NAME} subtitle="Setup guide" fullWidth>
        <div className="app-home-main">
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

            <div className="app-backend-card">
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text id={progressLabelId} as="span" variant="headingSm">
                      {setupTasksComplete} of {setupTasksTotal} tasks complete
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {progressPercent}%
                    </Text>
                  </InlineStack>
                  <ProgressBar
                    progress={progressPercent}
                    tone="success"
                    size="small"
                    ariaLabelledBy={progressLabelId}
                  />
                </BlockStack>
              </Card>
            </div>

            <InlineGrid columns={{ xs: 1, md: ["twoThirds", "oneThird"] }} gap="600">
              <BlockStack gap="400">
                <div className="app-backend-card">
                  <Card padding="0">
                    <Box padding="600">
                      <InlineStack gap="400" blockAlign="start" wrap={false}>
                        <Box flex="0 0 auto">
                          <Box paddingBlockStart="100">
                            <Box
                              width="24px"
                              height="24px"
                              borderRadius="full"
                              borderWidth="025"
                              borderColor="border"
                            />
                          </Box>
                        </Box>
                        <BlockStack gap="400">
                          <BlockStack gap="200">
                            <Text as="h3" variant="headingMd">
                              Enable app embed block
                            </Text>
                            <Text as="p" variant="bodyMd" tone="subdued">
                              Turn on the Approvefy app embed in your theme so the registration form
                              appears on your storefront. This is essential for the app to function
                              properly on your live site.
                            </Text>
                          </BlockStack>
                          <InlineStack gap="300" wrap>
                            <Button url={themeEditorUrl} variant="primary" external>
                              Enable app embed
                            </Button>
                            <Button url={storefrontUrl} variant="secondary" external>
                              Preview theme
                            </Button>
                          </InlineStack>
                        </BlockStack>
                      </InlineStack>
                    </Box>
                    <Box
                      background="bg-surface-secondary"
                      paddingInline="600"
                      paddingBlock="400"
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
                </div>

                {setupTasksComplete < 2 ? (
                  <Card>
                    <BlockStack gap="300">
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Complete the remaining steps above, then manage customer registrations under{" "}
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          Customers
                        </Text>{" "}
                        in the app navigation.
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        After enabling the embed, creating a form, and saving settings, open the{" "}
                        <Link to="/app/customers">customer list</Link>.
                      </Text>
                    </BlockStack>
                  </Card>
                ) : null}
              </BlockStack>

              <BlockStack gap="600">
                <CompletedTaskCard
                  complete={formsCount > 0}
                  title="Create a registration form"
                  description="Build your first form in Form Builder and choose which fields to collect."
                  actionLabel={formsCount > 0 ? "Form Builder" : "Go to Form Builder"}
                  actionHref="/app/form-config"
                />
                <CompletedTaskCard
                  complete={hasSettings}
                  title="Configure settings"
                  description="Set languages, appearance, and approval rules for new registrations."
                  actionLabel={hasSettings ? "Settings" : "Go to Settings"}
                  actionHref="/app/settings"
                />
                <Suspense
                  fallback={
                    <Card>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Loading live status…
                      </Text>
                    </Card>
                  }
                >
                  <Await
                    resolve={analytics}
                    errorElement={
                      <Card>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Live status unavailable.
                        </Text>
                      </Card>
                    }
                  >
                    {(resolved) => (
                      <div className="app-backend-card">
                        <LiveStatusPanel analytics={resolved} />
                      </div>
                    )}
                  </Await>
                </Suspense>
              </BlockStack>
            </InlineGrid>

            <Divider />

            <Box paddingBlock="400">
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <Text as="p" variant="bodySm" tone="subdued">
                  © {APP_DISPLAY_NAME} {year}
                </Text>
                <div className="setup-guide-footer-links">
                  <InlineStack gap="400" wrap>
                    <Link to="/app/customers" prefetch="render" style={{ textDecoration: "none" }}>
                      <Button variant="plain" tone="subdued">
                        View Customers
                      </Button>
                    </Link>
                    <Button variant="plain" tone="subdued" url={APP_URL} external>
                      Support
                    </Button>
                    <Button variant="plain" tone="subdued" url={SETUP_TUTORIAL_URL} external>
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
