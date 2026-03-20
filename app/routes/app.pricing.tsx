import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import {
  Page,
  LegacyCard,
  BlockStack,
  Text,
  Box,
  Button,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getPlanSelectionUrl } from "../lib/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const pricingUrl = getPlanSelectionUrl(session.shop);
  return { pricingUrl };
};

export default function PricingPage() {
  const { pricingUrl } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const openPlanSelection = () => {
    if (typeof window !== "undefined" && window.top) {
      window.top.location.href = pricingUrl;
    }
  };

  return (
    <Page
      title="Pricing"
      backAction={{ content: "Approvefy", onAction: () => navigate("/app") }}
      fullWidth
    >
      <BlockStack gap="400">
        <LegacyCard sectioned>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd" fontWeight="bold">
              Select or manage your plan
            </Text>
            <Text as="p" tone="subdued">
              Plans, prices, and features are set in the Shopify Partner Dashboard. When you add or edit plans there, they appear here. Click the button below to open Shopify’s plan selection page where you can subscribe or change your plan.
            </Text>
            <Box paddingBlockStart="200">
              <Button variant="primary" onClick={openPlanSelection}>
                Open plan selection
              </Button>
            </Box>
            <Text as="p" variant="bodySm" tone="subdued">
              You can also manage your subscription from{" "}
              <Text as="span" fontWeight="semibold">Settings → Apps and sales channels</Text>
              {" "}in your Shopify admin.
            </Text>
          </BlockStack>
        </LegacyCard>
      </BlockStack>
    </Page>
  );
}
