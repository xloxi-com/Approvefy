import { useEffect, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import {
  Outlet,
  useLoaderData,
  useRouteError,
  useNavigation,
  redirect,
  isRouteErrorResponse,
} from "react-router";
import { authenticatedFetch } from "../lib/authenticated-fetch.client";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";

import { authenticate } from "../shopify.server";
import { checkBilling } from "../lib/billing.server";
import prisma from "../db.server";
import { maybeThrowSessionTokenBounce } from "../lib/shopify-session-bounce.server";
import { LoadingIndicator } from "../components/application/loading-indicator";
import "../styles/layout.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let authContext: Awaited<ReturnType<typeof authenticate.admin>>;
  try {
    authContext = await authenticate.admin(request);
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      maybeThrowSessionTokenBounce(request);
      throw error;
    }
    if (error instanceof Response && error.status === 410) {
      const url = new URL(request.url);
      const search = url.searchParams.toString();
      throw redirect(search ? `/auth/login?${search}` : "/auth/login");
    }
    throw error;
  }

  const { admin, session } = authContext;
  const apiKey = (process.env.SHOPIFY_API_KEY || "").trim();
  const bypassBilling =
    process.env.BYPASS_BILLING === "true" || process.env.NODE_ENV !== "production";

  let redirectToPricing = false;
  let pricingUrl = "";
  let planType: "basic" | "pro" = "basic";

  if (!bypassBilling) {
    const billingResult = await checkBilling(admin, session.shop);
    pricingUrl = billingResult.pricingUrl;
    planType = billingResult.planType;

    if (!billingResult.hasActivePayment) {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/app/pricing")) {
        const search = url.searchParams.toString();
        throw redirect(search ? `/app/pricing?${search}` : "/app/pricing");
      }
      redirectToPricing = true;
    }
  }

  await prisma.appSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, appPlan: planType },
    update: { appPlan: planType },
  });

  return { apiKey, redirectToPricing, pricingUrl };
};

export default function App() {
  const { apiKey, redirectToPricing, pricingUrl } = useLoaderData<typeof loader>();
  const navigation = useNavigation();

  const isNavigating = navigation.state === "loading" || navigation.state === "submitting";
  const isLoading = isNavigating;

  // Trigger session-token API call on mount so Shopify's embedded app check detects token usage
  useEffect(() => {
    if (redirectToPricing) return;
    authenticatedFetch("/app/api/session-ping").catch(() => {});
  }, [redirectToPricing]);

  if (redirectToPricing && pricingUrl) {
    return <Outlet />;
  }

  if (!apiKey) {
    return (
      <PolarisAppProvider i18n={translations}>
        <div style={{ padding: 24 }}>
          Missing `SHOPIFY_API_KEY` environment variable. Add it to your app runtime env and
          restart the server.
        </div>
      </PolarisAppProvider>
    );
  }

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
      <script
        dangerouslySetInnerHTML={{
          __html: `window.__SHOPIFY_API_KEY__=${JSON.stringify(apiKey)};`,
        }}
      />
      <AppProvider embedded apiKey={apiKey}>
        <PolarisAppProvider i18n={translations}>
          <s-app-nav>
            {/*
              rel="home" sets the embedded app default route (hidden from the nav list per Shopify).
              Keep a visible Customers link so merchants can return after visiting other sections.
            */}
            <s-link href="/app/customers" rel="home">
              Customers
            </s-link>
            <s-link href="/app/home">Home</s-link>
            <s-link href="/app/customers">Customers</s-link>
            <s-link href="/app/form-config">Form Builder</s-link>
            <s-link href="/app/pricing">Pricing</s-link>
            <s-link href="/app/settings">Settings</s-link>
          </s-app-nav>
          {isLoading && (
            <LoadingIndicator type="line-simple" size="md" fullWidth />
          )}
          {/* App Home layout slot — without this, main content can render as an empty band in Admin */}
          <s-page>
            <Outlet />
          </s-page>
        </PolarisAppProvider>
      </AppProvider>
    </>
  );
}

function SessionTokenBounceRecovery() {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    const shop = url.searchParams.get("shop");
    const host = url.searchParams.get("host");
    if (!shop || !host) {
      setStuck(true);
      return;
    }
    const origin = window.location.origin.replace(/\/$/, "");
    const sp = new URLSearchParams(url.searchParams);
    sp.delete("id_token");
    const qs = sp.toString();
    const reload = `${origin}${url.pathname}${qs ? `?${qs}` : ""}`;
    sp.set("shopify-reload", reload);
    window.location.replace(`${origin}/auth/session-token?${sp.toString()}`);
  }, []);
  if (stuck) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 480 }}>
        <p>Open Approvefy from your Shopify admin (Apps). If 401 persists, confirm Vercel env vars match your Partner app:</p>
        <ul>
          <li>
            <code>SHOPIFY_API_KEY</code> = Client ID
          </li>
          <li>
            <code>SHOPIFY_API_SECRET</code> = Client secret
          </li>
          <li>
            <code>SHOPIFY_APP_URL</code> = your app URL (no trailing slash)
          </li>
        </ul>
      </div>
    );
  }
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <p>Refreshing session…</p>
    </div>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  const error = useRouteError();
  const is401 =
    (isRouteErrorResponse(error) && error.status === 401) ||
    (error instanceof Response && error.status === 401);
  if (is401) {
    return <SessionTokenBounceRecovery />;
  }
  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
