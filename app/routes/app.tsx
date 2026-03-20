import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, useNavigation, useFetchers } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";

import { authenticate } from "../shopify.server";
import "../styles/layout.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const fetchers = useFetchers();

  const isLoading =
    navigation.state === "loading" ||
    navigation.state === "submitting" ||
    fetchers.some((f) => f.state === "loading" || f.state === "submitting");

  return (
    <>
      {/* Keyframes injected once at top-level so inline animation works */}
      <style>
        {`
          @keyframes b2b-progress-move {
            0% {
              transform: translateX(-100%);
            }
            50% {
              transform: translateX(40%);
            }
            100% {
              transform: translateX(120%);
            }
          }
        `}
      </style>
      <AppProvider embedded apiKey={apiKey}>
        <PolarisAppProvider i18n={translations}>
          <s-app-nav>
            <s-link href="/app/customers">Customers</s-link>
            <s-link href="/app/form-config">Form Builder</s-link>
            <s-link href="/app/pricing">Pricing</s-link>
            <s-link href="/app/settings">Settings</s-link>
          </s-app-nav>
          {isLoading && (
            <div
              role="progressbar"
              aria-hidden="true"
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                height: "3px",
                backgroundColor: "var(--p-color-bg-fill-secondary, #e5e7eb)",
                overflow: "hidden",
                zIndex: 9999,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  height: "100%",
                  width: "35%",
                  background:
                    "linear-gradient(90deg, #4b6fff, #22c55e, #4b6fff)",
                  boxShadow: "0 0 4px rgba(0,0,0,0.25)",
                  transform: "translateX(-100%)",
                  animation: "b2b-progress-move 1.1s ease-in-out infinite",
                }}
              />
            </div>
          )}
          <Outlet />
        </PolarisAppProvider>
      </AppProvider>
    </>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
