import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, Link } from "react-router";
import {
  Page,
  LegacyCard,
  BlockStack,
  Text,
  Frame,
  Box,
  Button,
  InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return {};
};

export default function PricingPage() {
  const {} = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <Frame>
      <Page title="Pricing" fullWidth>
        <div className="app-nav-tabs-mobile" style={{ marginBottom: 12 }}>
          <BlockStack gap="200" inlineAlign="start">
            <InlineStack gap="100" wrap>
              <Button size="slim" onClick={() => navigate("/app")}>
                Approvefy
              </Button>
              <Link to="/app/customers" prefetch="render">
                <Button size="slim">Customers</Button>
              </Link>
              <Link to="/app/form-config" prefetch="render">
                <Button size="slim">Form Builder</Button>
              </Link>
              <Button size="slim" variant="primary">
                Pricing
              </Button>
              <Link to="/app/settings" prefetch="render">
                <Button size="slim">Settings</Button>
              </Link>
            </InlineStack>
          </BlockStack>
        </div>

        <Box paddingBlockEnd="400">
          <LegacyCard sectioned>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Approvefy pricing
              </Text>
              <Text as="p" tone="subdued">
                Approvefy is currently running on a single plan for all stores.
              </Text>
              <Box paddingBlockStart="300">
                <Text as="p" variant="bodyMd">
                  You can manage your subscription from{" "}
                  <Text as="span" fontWeight="semibold">
                    Settings &gt; Apps and sales channels
                  </Text>{" "}
                  in your Shopify admin.
                </Text>
              </Box>
            </BlockStack>
          </LegacyCard>
        </Box>
      </Page>
    </Frame>
  );
}

