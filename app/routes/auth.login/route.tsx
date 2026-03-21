import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import {
  Banner,
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
import { verifyMerchantLoginGate } from "./merchant-gate.server";

function parseEmbedded(request: Request): boolean {
  const url = new URL(request.url);
  const e = url.searchParams.get("embedded");
  if (e === "1" || e === "true") return true;
  // Shopify often sends `host` when loading auth inside Admin (embedded)
  if (url.searchParams.get("host")) return true;
  return false;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const openedFromEmbeddedAdmin = parseEmbedded(request);
  const errors = loginErrorMessage(await login(request));
  return { errors, openedFromEmbeddedAdmin };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const embedded = parseEmbedded(request);

  if (request.method === "POST") {
    const formData = await request.clone().formData();
    const rawShop = formData.get("shop")?.toString()?.trim() || "";
    const shop = normalizeShopDomain(rawShop);
    const email = formData.get("email")?.toString() ?? "";
    const password = formData.get("password")?.toString() ?? "";

    if (!shop) {
      return {
        errors: { shop: "Please enter your shop domain to log in" },
        openedFromEmbeddedAdmin: embedded,
      };
    }

    const gateErrors = await verifyMerchantLoginGate(shop, email, password);
    if (gateErrors.email || gateErrors.password) {
      return { errors: { ...gateErrors }, openedFromEmbeddedAdmin: embedded };
    }

    const newFormData = new FormData();
    for (const [key, value] of formData) {
      if (key === "email" || key === "password") continue;
      newFormData.set(key, key === "shop" ? shop : value instanceof File ? value : String(value));
    }
    newFormData.set("shop", shop);

    const normalizedRequest = new Request(request.url, {
      method: "POST",
      body: newFormData,
      headers: request.headers,
    });
    const oauthErrors = loginErrorMessage(await login(normalizedRequest));
    return { errors: { ...oauthErrors, ...gateErrors }, openedFromEmbeddedAdmin: embedded };
  }

  const errors = loginErrorMessage(await login(request));
  return { errors, openedFromEmbeddedAdmin: parseEmbedded(request) };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const openedFromEmbeddedAdmin =
    actionData?.openedFromEmbeddedAdmin ?? loaderData.openedFromEmbeddedAdmin;
  const errors = actionData?.errors ?? loaderData.errors ?? {};

  /* OAuth must run with embedded=false so redirects work; main /app uses embedded=true */
  return (
    <AppProvider embedded={false}>
      <PolarisAppProvider i18n={translations}>
        <Page>
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <Box paddingBlockEnd="800" paddingInline="400">
            <BlockStack gap="600">
              <Card>
                <BlockStack gap="400">
                  <Text as="h1" variant="headingXl">
                    Log in to Approvefy
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Enter your <strong>shop domain</strong>, optional <strong>email</strong> and{" "}
                    <strong>password</strong> (if enabled in Settings), then continue with Shopify OAuth.
                  </Text>
                  {openedFromEmbeddedAdmin ? (
                    <Banner tone="info" title="Opened from Shopify Admin">
                      <p style={{ margin: 0 }}>
                        Embedded apps use this page when a session is missing. After you continue, Shopify will
                        finish authorization; the app runs embedded again inside Admin.
                      </p>
                    </Banner>
                  ) : null}
                  <Banner tone="info">
                    <p style={{ margin: 0 }}>
                      Shopify still requires secure OAuth after this step. Email and password are an{" "}
                      <strong>optional extra gate</strong> you can turn on under{" "}
                      <strong>Settings → Language → App login (optional)</strong> after installing the app.
                    </p>
                  </Banner>
                  <Form method="post">
                    <BlockStack gap="400">
                      <TextField
                        label="Shop domain"
                        type="text"
                        name="shop"
                        value={shop}
                        onChange={setShop}
                        placeholder="your-store.myshopify.com"
                        helpText="Store subdomain or full myshopify.com domain"
                        autoComplete="organization"
                        error={errors?.shop}
                        requiredIndicator
                      />
                      <TextField
                        label="Email"
                        type="email"
                        name="email"
                        value={email}
                        onChange={setEmail}
                        placeholder="owner@yourstore.com"
                        helpText="Required only if app login is enabled in Settings for this store"
                        autoComplete="email"
                        error={errors?.email}
                      />
                      <TextField
                        label="Password"
                        type="password"
                        name="password"
                        value={password}
                        onChange={setPassword}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        error={errors?.password}
                      />
                      <InlineStack gap="300">
                        <Button variant="primary" submit>
                          Continue to Shopify
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Form>
                </BlockStack>
              </Card>
            </BlockStack>
          </Box>
          </div>
        </Page>
      </PolarisAppProvider>
    </AppProvider>
  );
}
