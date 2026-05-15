import { useEffect, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  Icon,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import { CheckIcon, XIcon } from "@shopify/polaris-icons";

import { authenticate } from "../shopify.server";
import { syncMerchantPlanFromActiveSubscription } from "../lib/sync-merchant-plan-from-billing.server";
import {
  type PricingTierId,
  PRICING_COMPARE_ROWS,
  PRICING_COMPARE_TITLE,
  PRICING_PAGE_INTRO,
  PRICING_PAGE_TITLE,
  PRICING_TRIAL_CTA_NOTE,
  PRICING_TIERS,
} from "../lib/pricing-tiers";
import { readStoredEmbedHost, SHOPIFY_EMBED_HOST_STORAGE_KEY } from "../lib/shopify-embed-navigation";

type BillingSubscribeResponse =
  | { ok: true; confirmationUrl: string }
  | { ok: false; error: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  /** Resolved from Shopify active subscription (Basic / Standard / Premium), or null if none. */
  const subscribedPlan = await syncMerchantPlanFromActiveSubscription(admin, shop);

  const url = new URL(request.url);
  const billingFlow = url.searchParams.get("billing");
  /** Set after Shopify sends the merchant back from the charge approval page. */
  const billingReturned = billingFlow === "callback";
  /** Required for billing return URL; client also persists this when URL params survive navigation. */
  const embeddedHost = url.searchParams.get("host")?.trim() ?? "";

  return { billingReturned, embeddedHost, subscribedPlan };
};

function CompareCell({ included }: { included: boolean }) {
  return (
    <div className="app-pricing-compare-cell">
      {included ? (
        <Icon source={CheckIcon} tone="success" accessibilityLabel="Included" />
      ) : (
        <Icon source={XIcon} tone="subdued" accessibilityLabel="Not included" />
      )}
    </div>
  );
}

export default function PricingPage() {
  const { billingReturned, embeddedHost: hostFromLoader, subscribedPlan } =
    useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const fetcher = useFetcher<BillingSubscribeResponse>();
  const [billingSubmittingTier, setBillingSubmittingTier] =
    useState<PricingTierId | null>(null);

  const hostFromUrl = searchParams.get("host")?.trim() ?? "";
  /** Read cache on first paint (client) — avoids Subscribe staying disabled until a late effect runs. */
  const [persistedEmbedHost, setPersistedEmbedHost] = useState(() => readStoredEmbedHost());

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(SHOPIFY_EMBED_HOST_STORAGE_KEY);
      if (cached) setPersistedEmbedHost((prev) => prev || cached);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const fromUrl = hostFromUrl || hostFromLoader;
    if (!fromUrl) return;
    setPersistedEmbedHost(fromUrl);
    try {
      sessionStorage.setItem(SHOPIFY_EMBED_HOST_STORAGE_KEY, fromUrl);
    } catch {
      /* ignore */
    }
  }, [hostFromLoader, hostFromUrl]);

  const resolvedEmbedHost = hostFromUrl || hostFromLoader || persistedEmbedHost;

  useEffect(() => {
    const d = fetcher.data;
    if (!d || !d.ok) return;
    if (d.confirmationUrl && typeof window !== "undefined") {
      const target = window.top ?? window;
      target.location.href = d.confirmationUrl;
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !billingSubmittingTier) return;
    if (fetcher.data && fetcher.data.ok !== true) {
      setBillingSubmittingTier(null);
    }
  }, [fetcher.state, fetcher.data, billingSubmittingTier]);

  const billingError =
    fetcher.state === "idle" && fetcher.data && !fetcher.data.ok
      ? fetcher.data.error
      : undefined;

  return (
    <div className="app-pricing-page">
      <Page fullWidth>
        <div className="app-pricing-wrap">
          {(billingReturned || billingError || !resolvedEmbedHost || subscribedPlan == null) && (
            <Box paddingBlockEnd="400">
              <BlockStack gap="300">
                {subscribedPlan == null && !billingReturned ? (
                  <Banner tone="info" title="Choose a plan to get started">
                    Select Basic, Standard, or Premium below to unlock Customers, Form Builder, Settings, and your
                    storefront registration form.
                  </Banner>
                ) : null}
                {billingReturned ? (
                  <Banner tone="info" title="Billing">
                    Thanks — If you approved the charge, your plan is updating. Reload this page if features
                    do not unlock right away.
                  </Banner>
                ) : null}
                {billingError ? (
                  <Banner tone="critical" title="Billing could not start">
                    {billingError}
                  </Banner>
                ) : null}
                {!resolvedEmbedHost ? (
                  <Banner tone="warning" title="Subscribe from Shopify admin">
                    Open Pricing from Apps → Approvefy inside your Shopify admin so subscription billing can return you
                    to the embedded app correctly.
                  </Banner>
                ) : null}
              </BlockStack>
            </Box>
          )}

          <div className="app-pricing-hero">
            <Card padding="500">
              <BlockStack gap="200">
                <Text as="h1" variant="headingXl">
                  {PRICING_PAGE_TITLE}
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  {PRICING_PAGE_INTRO}
                </Text>
              </BlockStack>
            </Card>
          </div>

          <div className="app-pricing-grid">
            {PRICING_TIERS.map((tier) => {
              const isCurrentPlan = subscribedPlan != null && tier.id === subscribedPlan;
              return (
              <div className="app-pricing-grid-cell" key={tier.id}>
                <div className="app-pricing-card-fill">
                  <Card padding="0">
                    <div className="app-pricing-tier-shell">
                      <div className="app-pricing-tier-body">
                        <BlockStack gap="400">
                          <BlockStack gap="200">
                            <InlineStack gap="200" wrap blockAlign="center">
                              <Text as="h2" variant="headingLg">
                                {tier.name}
                              </Text>
                              {tier.badge ? (
                                <Badge tone="attention">{tier.badge}</Badge>
                              ) : null}
                            </InlineStack>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {tier.tagline}
                            </Text>
                            <InlineStack gap="150" blockAlign="baseline">
                              <Text as="p" variant="heading2xl">
                                {tier.priceDisplay}
                              </Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                {tier.periodNote}
                              </Text>
                            </InlineStack>
                          </BlockStack>

                          <Divider />

                          <BlockStack as="ul" gap="200">
                            {tier.features.map((line) => (
                              <Box as="li" key={`${tier.id}:${line.slice(0, 48)}`}>
                                <Text as="span" variant="bodyMd">
                                  {line}
                                </Text>
                              </Box>
                            ))}
                          </BlockStack>
                        </BlockStack>
                      </div>

                      <div className="app-pricing-tier-footer">
                        <BlockStack gap="150" inlineAlign="center">
                          <Button
                            variant={
                              isCurrentPlan ? "secondary" : tier.highlight ? "primary" : "secondary"
                            }
                            fullWidth
                            loading={
                              !isCurrentPlan &&
                              fetcher.state !== "idle" &&
                              billingSubmittingTier === tier.id
                            }
                            disabled={
                              isCurrentPlan ||
                              fetcher.state !== "idle" ||
                              !resolvedEmbedHost
                            }
                            onClick={() => {
                              if (isCurrentPlan || !resolvedEmbedHost) return;
                              setBillingSubmittingTier(tier.id);
                              fetcher.submit(
                                { plan: tier.id, host: resolvedEmbedHost },
                                {
                                  method: "POST",
                                  action: "/app/billing/subscribe",
                                },
                              );
                            }}
                          >
                            {isCurrentPlan ? "Current" : tier.ctaLabel}
                          </Button>
                          <Text
                            as="p"
                            variant="bodySm"
                            tone="subdued"
                            alignment="center"
                          >
                            <span className="app-pricing-trial-caption">
                              {PRICING_TRIAL_CTA_NOTE}
                            </span>
                          </Text>
                        </BlockStack>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
              );
            })}
          </div>

          <div className="app-pricing-compare">
            <Card padding="0">
              <Box padding="500">
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">
                      {PRICING_COMPARE_TITLE}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      See which features are included with Basic, Standard, and Premium.
                    </Text>
                    <InlineStack gap="400" wrap>
                      <InlineStack gap="150" blockAlign="center" wrap={false}>
                        <Icon source={CheckIcon} tone="success" accessibilityLabel="Included" />
                        <Text as="span" variant="bodySm" tone="subdued">
                          Included
                        </Text>
                      </InlineStack>
                      <InlineStack gap="150" blockAlign="center" wrap={false}>
                        <Icon source={XIcon} tone="subdued" accessibilityLabel="Not included" />
                        <Text as="span" variant="bodySm" tone="subdued">
                          Not included
                        </Text>
                      </InlineStack>
                    </InlineStack>
                  </BlockStack>

                  <div className="app-pricing-compare-scroll">
                    <table className="app-pricing-compare-table">
                      <thead>
                        <tr>
                          <th scope="col" className="app-pricing-compare-th-feature">
                            <Text as="span" variant="bodySm" fontWeight="semibold">
                              Feature
                            </Text>
                          </th>
                          <th scope="col" className="app-pricing-compare-th-plan">
                            <Text as="span" variant="bodySm" fontWeight="semibold">
                              Basic
                            </Text>
                          </th>
                          <th scope="col" className="app-pricing-compare-th-plan">
                            <Text as="span" variant="bodySm" fontWeight="semibold">
                              Standard
                            </Text>
                          </th>
                          <th scope="col" className="app-pricing-compare-th-plan">
                            <Text as="span" variant="bodySm" fontWeight="semibold">
                              Premium
                            </Text>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {PRICING_COMPARE_ROWS.map((row) => (
                          <tr key={row.feature} className="app-pricing-compare-row">
                            <th scope="row" className="app-pricing-compare-td-feature">
                              <Text as="span" variant="bodyMd">
                                {row.feature}
                              </Text>
                            </th>
                            <td className="app-pricing-compare-td-icon">
                              <CompareCell included={row.basic} />
                            </td>
                            <td className="app-pricing-compare-td-icon">
                              <CompareCell included={row.standard} />
                            </td>
                            <td className="app-pricing-compare-td-icon">
                              <CompareCell included={row.premium} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </BlockStack>
              </Box>
            </Card>
          </div>
        </div>
      </Page>
    </div>
  );
}
