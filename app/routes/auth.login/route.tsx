import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import {
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage, normalizeShopDomain } from "./error.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Normalize shop domain (e.g. "mystore" -> "mystore.myshopify.com")
  if (request.method === "POST") {
    const formData = await request.clone().formData();
    const rawShop = formData.get("shop")?.toString()?.trim() || "";
    const shop = normalizeShopDomain(rawShop);
    const newFormData = new FormData();
    for (const [key, value] of formData) {
      newFormData.set(key, key === "shop" ? shop : value instanceof File ? value : String(value));
    }
    const normalizedRequest = new Request(request.url, {
      method: "POST",
      body: newFormData,
      headers: request.headers,
    });
    const errors = loginErrorMessage(await login(normalizedRequest));
    return { errors };
  }
  const errors = loginErrorMessage(await login(request));
  return { errors };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors } = (actionData || loaderData) ?? { errors: {} };

  return (
    <AppProvider embedded={false}>
      <PolarisAppProvider i18n={translations}>
      <Page>
        <Box paddingBlockEnd="800" maxWidth="400px" marginInline="auto">
          <BlockStack gap="800">
            <Card>
              <BlockStack gap="400">
                <Text as="h1" variant="headingXl">
                  Log in to Approvefy
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Enter your Shopify store domain to connect and manage B2B
                  customer registrations.
                </Text>
                <Form method="post">
                  <BlockStack gap="400">
                    <TextField
                      label="Shop domain"
                      type="text"
                      name="shop"
                      value={shop}
                      onChange={setShop}
                      placeholder="your-store.myshopify.com"
                      helpText="Enter your store name (e.g. mystore) or full domain (mystore.myshopify.com)"
                      autoComplete="on"
                      error={errors?.shop}
                    />
                    <InlineStack gap="300">
                      <Button variant="primary" submit>
                        Log in
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Form>
              </BlockStack>
            </Card>
          </BlockStack>
        </Box>
      </Page>
      </PolarisAppProvider>
    </AppProvider>
  );
}
