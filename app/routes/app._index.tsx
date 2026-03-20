import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, Link } from "react-router";
import { useCallback, useState } from "react";
import {
  Page,
  Text,
  LegacyCard,
  BlockStack,
  Frame,
  Button,
  Box,
  InlineStack,
  Icon,
  Banner,
  Toast,
  Divider,
} from "@shopify/polaris";
import { CheckIcon, ClipboardIcon } from "@shopify/polaris-icons";
import { registrationAppEmbedThemeEditorUrl } from "../registration-app-embed-theme-url.server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const PARTNERS_DASHBOARD_URL = "https://partners.shopify.com";
const APP_EMBEDS_HELP_URL =
  "https://help.shopify.com/manual/online-store/themes/theme-structure/extend/apps#app-embeds";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [formsCount, hasSettings] = await Promise.all([
    prisma.formConfig.count({ where: { shop } }),
    prisma.appSettings.findUnique({ where: { shop }, select: { id: true } }).then((r) => !!r),
  ]);

  const themeEditorUrl = registrationAppEmbedThemeEditorUrl(shop);
  const shopifyClientId = process.env.SHOPIFY_API_KEY ?? "";

  const setupTasksTotal = 3;
  const setupTasksComplete = (formsCount > 0 ? 1 : 0) + (hasSettings ? 1 : 0);

  return {
    themeEditorUrl,
    shopifyClientId,
    formsCount,
    hasSettings,
    setupTasksComplete,
    setupTasksTotal,
  };
};

export default function Index() {
  const {
    themeEditorUrl,
    shopifyClientId,
    formsCount,
    hasSettings,
    setupTasksComplete,
    setupTasksTotal,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [clientIdCopied, setClientIdCopied] = useState(false);

  const copyClientId = useCallback(() => {
    if (!shopifyClientId) return;
    void navigator.clipboard.writeText(shopifyClientId).then(() => {
      setClientIdCopied(true);
    });
  }, [shopifyClientId]);

  return (
    <Frame>
      <Page title="Approvefy" fullWidth>
        <div className="app-nav-tabs-mobile" style={{ marginBottom: 12 }}>
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
        </div>

        <Box paddingBlockEnd="400">
          <LegacyCard sectioned>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd" fontWeight="bold">Setup guide</Text>
              <Text as="p" tone="subdued">
                Use this guide to get your store registration form up and running.
              </Text>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" fontWeight="semibold">
                  {setupTasksComplete} of {setupTasksTotal} tasks complete
                </Text>
                <div
                  style={{
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: "var(--p-color-bg-fill-secondary)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${setupTasksTotal ? (100 * setupTasksComplete) / setupTasksTotal : 0}%`,
                      backgroundColor: "var(--p-color-bg-fill-success)",
                      borderRadius: 4,
                      transition: "width 0.2s ease",
                    }}
                  />
                </div>
              </BlockStack>
              <BlockStack gap="400">
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <span style={{ flexShrink: 0, marginTop: 2 }}>
                    <span style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid var(--p-color-border)", display: "inline-block" }} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text as="p" fontWeight="semibold">Enable app embed block</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Approvefy adds a theme app extension. You turn it on under{' '}
                      <strong>Online Store → Themes → Customize → App embeds</strong>, then enable{' '}
                      <strong>Custom registration</strong> and Save.
                    </Text>
                    {shopifyClientId ? (
                      <Box paddingBlockStart="300">
                        <Banner tone="warning" title="App embeds list is empty? Fix it in this order">
                          <BlockStack gap="300">
                            <Text as="p" variant="bodySm">
                              The theme editor only lists apps whose <strong>released</strong> version includes a{' '}
                              <strong>Theme app extension</strong>. Your hosting app (this session) uses this Client ID — it must match{' '}
                              <strong>Partners → Apps → Approvefy → Client credentials</strong> exactly (compare character by character).
                            </Text>
                            <Box
                              padding="300"
                              background="bg-surface-secondary"
                              borderWidth="025"
                              borderColor="border"
                              borderRadius="200"
                            >
                              <InlineStack gap="200" blockAlign="center" wrap>
                                <Text as="span" variant="bodySm" fontWeight="semibold">
                                  Client ID
                                </Text>
                                <code
                                  style={{
                                    fontSize: 13,
                                    flex: 1,
                                    minWidth: 0,
                                    wordBreak: "break-all",
                                    fontFamily: "ui-monospace, monospace",
                                  }}
                                >
                                  {shopifyClientId}
                                </code>
                                <Button
                                  icon={ClipboardIcon}
                                  size="slim"
                                  onClick={copyClientId}
                                  accessibilityLabel="Copy Client ID"
                                >
                                  Copy
                                </Button>
                              </InlineStack>
                            </Box>
                            <BlockStack gap="150">
                              <Text as="p" variant="bodySm" fontWeight="semibold">
                                Checklist
                              </Text>
                              <Text as="p" variant="bodySm">
                                1. In Partners, open <strong>Versions</strong> → select the <strong>Active</strong> version → confirm{' '}
                                <strong>Theme app extension</strong> (e.g. Approvefy Registration Form) is listed. If not, run{' '}
                                <code style={{ fontSize: "0.85em" }}>shopify app deploy</code> and <strong>release</strong> the new version.
                              </Text>
                              <Text as="p" variant="bodySm">
                                2. If you use a <strong>second</strong> Approvefy app (another Client ID), deploy extensions for that app:{' '}
                                <code style={{ fontSize: "0.85em" }}>npm run deploy:customer-b2b</code> then release (see repo{' '}
                                <code style={{ fontSize: "0.85em" }}>docs/APP_EMBEDS.md</code>).
                              </Text>
                              <Text as="p" variant="bodySm">
                                3. On this store: <strong>Settings → Apps and sales channels → Approvefy → Uninstall</strong>, then install again from the correct install link. Wait a few minutes, then open App embeds.
                              </Text>
                            </BlockStack>
                            <InlineStack gap="200" wrap>
                              <Button url={PARTNERS_DASHBOARD_URL} target="_blank" variant="secondary">
                                Open Partner Dashboard
                              </Button>
                              <Button url={APP_EMBEDS_HELP_URL} target="_blank" variant="plain">
                                Shopify: App embeds help
                              </Button>
                            </InlineStack>
                          </BlockStack>
                        </Banner>
                      </Box>
                    ) : (
                      <Box paddingBlockStart="200">
                        <Banner tone="critical" title="SHOPIFY_API_KEY is not set">
                          <Text as="p" variant="bodySm">
                            Your server is missing <strong>SHOPIFY_API_KEY</strong>. The app cannot match a Partner app until it is configured on hosting.
                          </Text>
                        </Banner>
                      </Box>
                    )}
                    <Box paddingBlockStart="200">
                      <InlineStack gap="200" wrap>
                        <Button url={themeEditorUrl} target="_blank" variant="primary">
                          Open theme editor (App embeds)
                        </Button>
                      </InlineStack>
                    </Box>
                  </div>
                </div>
                <Divider />
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <span style={{ flexShrink: 0, marginTop: 2 }}>
                    {formsCount > 0 ? (
                      <Icon source={CheckIcon} tone="base" />
                    ) : (
                      <span style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid var(--p-color-border)", display: "inline-block" }} />
                    )}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text as="p" fontWeight="semibold">Create a registration form</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Build your first form in Form Builder and choose which fields to collect.
                    </Text>
                    <Box paddingBlockStart="200">
                      <Link to="/app/form-config" prefetch="render">
                        <Button variant={formsCount > 0 ? "secondary" : "primary"}>
                          {formsCount > 0 ? "Form Builder" : "Go to Form Builder"}
                        </Button>
                      </Link>
                    </Box>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <span style={{ flexShrink: 0, marginTop: 2 }}>
                    {hasSettings ? (
                      <Icon source={CheckIcon} tone="base" />
                    ) : (
                      <span style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid var(--p-color-border)", display: "inline-block" }} />
                    )}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text as="p" fontWeight="semibold">Configure settings</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Set languages, appearance, and approval rules for new registrations.
                    </Text>
                    <Box paddingBlockStart="200">
                      <Link to="/app/settings" prefetch="render">
                        <Button variant={hasSettings ? "secondary" : "primary"}>
                          {hasSettings ? "Settings" : "Go to Settings"}
                        </Button>
                      </Link>
                    </Box>
                  </div>
                </div>
              </BlockStack>
            </BlockStack>
          </LegacyCard>
        </Box>

        {setupTasksComplete < 2 ? (
          <LegacyCard sectioned>
            <BlockStack gap="300">
              <Text as="p" tone="subdued">
                Complete the 3 steps above to see and manage your customer registrations.
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                After you enable the app embed, create a form, and configure settings, click <strong>Customers</strong> in the nav or the button below to view the list.
              </Text>
            </BlockStack>
          </LegacyCard>
        ) : (
          <LegacyCard sectioned>
            <BlockStack gap="300">
              <Text as="p" tone="subdued">
                Setup complete. View and manage your customer registrations.
              </Text>
              <Link to="/app/customers" prefetch="render">
                <Button variant="primary">View customers</Button>
              </Link>
            </BlockStack>
          </LegacyCard>
        )}
        {clientIdCopied ? (
          <Toast content="Client ID copied to clipboard" onDismiss={() => setClientIdCopied(false)} />
        ) : null}
      </Page>
    </Frame>
  );
}
