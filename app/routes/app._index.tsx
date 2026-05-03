/// <reference path="../../env.d.ts" />
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
  Layout,
  Divider,
  Banner,
} from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getAnalytics } from "../models/approval.server";

type Analytics = Awaited<ReturnType<typeof getAnalytics>>;

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

function AnalyticsSummary({ analytics }: { analytics: Analytics | null }) {
  if (!analytics) {
    return (
      <Text as="p" variant="bodySm" tone="subdued">
        Customer counts will appear here once the database is reachable.
      </Text>
    );
  }
  const total = analytics.total ?? 0;
  const pending = analytics.pending ?? 0;
  const denied = analytics.denied ?? 0;
  const approved = Math.max(0, total - pending - denied);
  return (
    <InlineStack gap="400" wrap>
      <Text as="span" variant="bodySm" tone="subdued">
        Pending: <strong>{pending}</strong>
      </Text>
      <Text as="span" variant="bodySm" tone="subdued">
        Approved: <strong>{approved}</strong>
      </Text>
      <Text as="span" variant="bodySm" tone="subdued">
        Rejected: <strong>{denied}</strong>
      </Text>
    </InlineStack>
  );
}

function SetupGuideTask({
  complete,
  title,
  description,
  action,
}: {
  complete: boolean;
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <InlineStack gap="300" blockAlign="start" wrap={false}>
      <Box width="24px" flex="0 0 auto">
        <Box paddingBlockStart="050">
          {complete ? (
            <Icon source={CheckIcon} tone="success" accessibilityLabel="Completed" />
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
        <Text as="h3" variant="headingSm">
          {title}
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          {description}
        </Text>
        <Box>{action}</Box>
      </BlockStack>
    </InlineStack>
  );
}

export default function Index() {
  const {
    themeEditorUrl,
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

  return (
    <Page title="Approvefy" fullWidth>
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <div className="app-nav-tabs-mobile">
              <Box paddingBlockEnd="200">
                <BlockStack gap="200" inlineAlign="start">
                  <InlineStack gap="100" wrap>
                    <Button size="slim" variant="primary" onClick={() => navigate("/app")}>
                      Approvefy
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
              <Card padding="500">
                <BlockStack gap="500">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingLg">
                      Setup guide
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Use this guide to get your store registration form up and running.
                    </Text>
                  </BlockStack>

                  <BlockStack gap="200">
                    <Text id={progressLabelId} as="p" variant="bodySm" fontWeight="semibold">
                      {setupTasksComplete} of {setupTasksTotal} tasks complete
                    </Text>
                    <ProgressBar
                      progress={progressPercent}
                      tone="success"
                      size="small"
                      ariaLabelledBy={progressLabelId}
                    />
                  </BlockStack>

                  <Divider />

                  <BlockStack gap="500">
                    <SetupGuideTask
                      complete={false}
                      title="Enable app embed block"
                      description='Turn on the Approvefy app embed in your theme so the registration form appears on the Customer register page. Click the button below to open the theme editor (App embeds). Enable the Approvefy toggle, then click Save at the top right.'
                      action={
                        <Button url={themeEditorUrl} target="_blank" variant="primary">
                          Enable app embed
                        </Button>
                      }
                    />
                    <Divider />
                    <SetupGuideTask
                      complete={formsCount > 0}
                      title="Create a registration form"
                      description="Build your first form in Form Builder and choose which fields to collect."
                      action={
                        <Link to="/app/form-config" prefetch="render">
                          <Button variant={formsCount > 0 ? "secondary" : "primary"}>
                            {formsCount > 0 ? "Form Builder" : "Go to Form Builder"}
                          </Button>
                        </Link>
                      }
                    />
                    <Divider />
                    <SetupGuideTask
                      complete={hasSettings}
                      title="Configure settings"
                      description="Set languages, appearance, and approval rules for new registrations."
                      action={
                        <Link to="/app/settings" prefetch="render">
                          <Button variant={hasSettings ? "secondary" : "primary"}>
                            {hasSettings ? "Settings" : "Go to Settings"}
                          </Button>
                        </Link>
                      }
                    />
                  </BlockStack>

                  <Divider />

                  <Box paddingBlockStart="100">
                    <Suspense fallback={null}>
                      <Await
                        resolve={analytics}
                        errorElement={
                          <Text as="p" variant="bodySm" tone="subdued">
                            Customer counts unavailable.
                          </Text>
                        }
                      >
                        {(resolved) => <AnalyticsSummary analytics={resolved} />}
                      </Await>
                    </Suspense>
                  </Box>
                </BlockStack>
              </Card>
            </div>

            <div className="app-backend-card">
              {setupTasksComplete < 2 ? (
                <Card padding="500">
                  <BlockStack gap="300">
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Complete the 3 steps above to see and manage your customer registrations.
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      After you enable the app embed, create a form, and configure settings, click{" "}
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        Customers
                      </Text>{" "}
                      in the nav or the button below to view the list.
                    </Text>
                  </BlockStack>
                </Card>
              ) : (
                <Card padding="500">
                  <BlockStack gap="400">
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Setup complete. View and manage your customer registrations.
                    </Text>
                    <InlineStack gap="200" wrap>
                      <Link to="/app/customers" prefetch="render">
                        <Button variant="primary">View customers</Button>
                      </Link>
                    </InlineStack>
                  </BlockStack>
                </Card>
              )}
            </div>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
