import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import {
  Outlet,
  useLoaderData,
  useRouteError,
  useSearchParams,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider, Frame } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";

import { authenticate } from "../shopify.server";
import { mergeEmbedParamsForAppPath } from "../lib/shopify-embed-navigation";
import { CrispChatWidget } from "../components/CrispChatWidget";
import "../styles/layout.css";

/** Default Crisp site; override with `CRISP_WEBSITE_ID` in `.env` for staging / white-label. */
const DEFAULT_CRISP_WEBSITE_ID = "37838a46-8fb5-457f-8976-f8ebfca547b1";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const crispWebsiteId =
    (process.env.CRISP_WEBSITE_ID || "").trim() || DEFAULT_CRISP_WEBSITE_ID;

  return { apiKey: process.env.SHOPIFY_API_KEY || "", crispWebsiteId };
};

export default function App() {
  const { apiKey, crispWebsiteId } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();

  /** Keep Shopify `shop` / `host` on nav URLs so Pricing + billing stay enabled inside admin. */
  const nav = (path: string) => mergeEmbedParamsForAppPath(path, searchParams);

  return (
    <AppProvider embedded apiKey={apiKey}>
      <CrispChatWidget websiteId={crispWebsiteId} />
      <PolarisAppProvider i18n={translations}>
        <s-app-nav>
          <s-link href={nav("/app/customers")}>Customers</s-link>
          <s-link href={nav("/app/form-config")}>Form Builder</s-link>
          <s-link href={nav("/app/pricing")}>Pricing</s-link>
          <s-link href={nav("/app/settings")}>Settings</s-link>
        </s-app-nav>
        <Frame>
          <Outlet />
        </Frame>
      </PolarisAppProvider>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
