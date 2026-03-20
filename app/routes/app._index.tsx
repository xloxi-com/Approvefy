import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, Link } from "react-router";
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
} from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";
import { registrationAppEmbedThemeEditorUrl } from "../registration-app-embed-theme-url.server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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
                      Turn on the <strong>Custom registration</strong> embed (under Approvefy in App embeds), then click Save.
                    </Text>
                    {shopifyClientId ? (
                      <Box paddingBlockStart="200">
                        <Banner tone="info" title="If Approvefy is missing under App embeds">
                          <BlockStack gap="200">
                            <Text as="p" variant="bodySm">
                              This admin session uses Partner app Client ID <strong>{shopifyClientId}</strong>. In{' '}
                              <strong>Partners → Apps → Approvefy → Client credentials</strong>, the ID must match exactly.
                              If you have a second Approvefy app (different Client ID), deploy the theme extension for that app too:{' '}
                              <strong>npm run deploy:customer-b2b</strong>, then release the version (see <strong>docs/APP_EMBEDS.md</strong>).
                            </Text>
                            <Text as="p" variant="bodySm">
                              After deploy, open the <strong>active</strong> app version in Partners and confirm a <strong>Theme app extension</strong> is listed. Then try uninstalling and reinstalling Approvefy on this store, wait a few minutes, and open App embeds again.
                            </Text>
                          </BlockStack>
                        </Banner>
                      </Box>
                    ) : null}
                    <Box paddingBlockStart="200">
                      <Button url={themeEditorUrl} target="_blank" variant="primary">
                        Enable app embed
                      </Button>
                    </Box>
                  </div>
                </div>
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
      </Page>
    </Frame>
  );
}
