import {
  Badge,
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

import { APP_URL } from "../lib/app-constants";
import {
  PRICING_COMPARE_ROWS,
  PRICING_COMPARE_TITLE,
  PRICING_PAGE_INTRO,
  PRICING_PAGE_TITLE,
  PRICING_TRIAL_CTA_NOTE,
  PRICING_TIERS,
} from "../lib/pricing-tiers";

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
  return (
    <div className="app-pricing-page">
      <Page fullWidth>
        <div className="app-pricing-wrap">
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
            {PRICING_TIERS.map((tier) => (
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
                            url={APP_URL}
                            external
                            variant={tier.highlight ? "primary" : "secondary"}
                            fullWidth
                          >
                            {tier.ctaLabel}
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
            ))}
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
