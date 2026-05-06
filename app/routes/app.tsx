import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import {
  Outlet,
  useLoaderData,
  useRouteError,
} from "react-router";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider, Frame } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";

import { authenticate } from "../shopify.server";
import "../styles/layout.css";

declare global {
  interface Window {
    Tawk_API?: Record<string, unknown>;
    Tawk_LoadStart?: Date;
  }
}

const TAWK_SCRIPT_ID = "tawk-chat-widget-script";
const TAWK_WIDGET_URL = "https://embed.tawk.to/69faeddbaf892f1c31395f15/1jnu3297a";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (document.getElementById(TAWK_SCRIPT_ID)) return;

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    const script = document.createElement("script");
    script.id = TAWK_SCRIPT_ID;
    script.async = true;
    script.src = TAWK_WIDGET_URL;
    script.charset = "UTF-8";
    script.setAttribute("crossorigin", "*");
    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={translations}>
        <s-app-nav>
          <s-link href="/app/customers">Customers</s-link>
          <s-link href="/app/form-config">Form Builder</s-link>
          <s-link href="/app/pricing">Pricing</s-link>
          <s-link href="/app/settings">Settings</s-link>
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
