import {
  BlockStack,
  Button,
  Card,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import { useNavigate, useSearchParams } from "react-router";

import { APP_DISPLAY_NAME } from "../lib/app-constants";
import { getAppErrorDetails } from "../lib/route-error";
import { mergeEmbedParamsForAppPath } from "../lib/shopify-embed-navigation";

type AppErrorPageProps = {
  error: unknown;
  /** Defaults to embedded app Home. */
  homePath?: string;
  /** Optional page title shown in the Polaris header. */
  pageTitle?: string;
};

export function AppErrorPage({
  error,
  homePath = "/app",
  pageTitle = APP_DISPLAY_NAME,
}: AppErrorPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const details = getAppErrorDetails(error);
  const homeHref = mergeEmbedParamsForAppPath(homePath, searchParams);

  const statusLabel =
    details.status > 0 ? String(details.status) : details.kind === "network" ? "!" : "Error";

  return (
    <div className="app-error-page">
      <Page title={pageTitle} fullWidth>
        <div className="app-error-page-wrap">
          <Card padding="600">
            <BlockStack gap="500" inlineAlign="center">
              <div className="app-error-page-code" aria-hidden="true">
                {statusLabel}
              </div>

              <BlockStack gap="200" inlineAlign="center">
                <Text as="h1" variant="headingLg" alignment="center">
                  {details.title}
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                  {details.message}
                </Text>
              </BlockStack>

              <InlineStack gap="300" align="center">
                <Button variant="primary" onClick={() => navigate(homeHref)}>
                  Go to Home
                </Button>
                {details.showRetry ? (
                  <Button onClick={() => window.location.reload()}>Try again</Button>
                ) : null}
              </InlineStack>
            </BlockStack>
          </Card>
        </div>
      </Page>
    </div>
  );
}
