import type { HeadersFunction, LoaderFunctionArgs } from "react-router";

import {

  Outlet,

  redirect,

  useLoaderData,

  useRouteError,

  useSearchParams,

} from "react-router";

import { boundary } from "@shopify/shopify-app-react-router/server";

import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { AppProvider as PolarisAppProvider, Frame } from "@shopify/polaris";

import translations from "@shopify/polaris/locales/en.json";



import {

  invalidateAppSubscriptionCache,

  isBillingExemptAppPath,

  shopHasActiveAppSubscription,

} from "../lib/app-subscription.server";

import { syncMerchantPlanFromActiveSubscription } from "../lib/sync-merchant-plan-from-billing.server";

import {

  mergeEmbedParamsForAppPath,

  mergeEmbedParamsForServerPath,

} from "../lib/shopify-embed-navigation";

import { authenticate } from "../shopify.server";
import { runAppInstallSetup } from "../lib/app-install.server";

import { AppErrorPage } from "../components/AppErrorPage";
import { CrispChatWidget } from "../components/CrispChatWidget";
import { shouldUseShopifyBoundary } from "../lib/route-error";

import "../styles/layout.css";



/** Default Crisp site; override with `CRISP_WEBSITE_ID` in `.env` for staging / white-label. */

const DEFAULT_CRISP_WEBSITE_ID = "37838a46-8fb5-457f-8976-f8ebfca547b1";

/** Vercel serverless: theme template creation and install setup can exceed the default 10s limit. */
export const config = { maxDuration: 60 };

export const loader = async ({ request }: LoaderFunctionArgs) => {

  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);

  const pathname = url.pathname;

  const billingCallback = url.searchParams.get("billing") === "callback";

  if (billingCallback) {
    invalidateAppSubscriptionCache(session.shop);
  }

  /** Sync before nav/gating so Pricing "Current" and sidebar links stay aligned (avoids stale 60s cache). */
  const subscribedPlan = await syncMerchantPlanFromActiveSubscription(admin, session.shop);
  invalidateAppSubscriptionCache(session.shop);

  const hasActiveSubscription =
    subscribedPlan != null ||
    (await shopHasActiveAppSubscription(admin, session.shop));

  /** After plan approval, land on Home (not Pricing). */
  if (billingCallback && hasActiveSubscription) {
    throw redirect(mergeEmbedParamsForServerPath("/app", url.searchParams));
  }

  if (!isBillingExemptAppPath(pathname) && !hasActiveSubscription) {
    /** Allow Home while Shopify activates the charge (return URL includes billing=callback). */
    const awaitingBillingActivation = billingCallback && pathname === "/app";
    if (!awaitingBillingActivation) {
      const pricingPath = mergeEmbedParamsForServerPath("/app/pricing", url.searchParams);
      throw redirect(pricingPath);
    }
  }

  void runAppInstallSetup(admin, session.shop, session.accessToken, session.scope);



  const crispWebsiteId =

    (process.env.CRISP_WEBSITE_ID || "").trim() || DEFAULT_CRISP_WEBSITE_ID;



  return {

    apiKey: process.env.SHOPIFY_API_KEY || "",

    crispWebsiteId,

    hasActiveSubscription,

  };

};



export default function App() {

  const { apiKey, crispWebsiteId, hasActiveSubscription } = useLoaderData<typeof loader>();

  const [searchParams] = useSearchParams();



  /** Keep Shopify `shop` / `host` on nav URLs so Pricing + billing stay enabled inside admin. */

  const nav = (path: string) => mergeEmbedParamsForAppPath(path, searchParams);



  return (

    <AppProvider embedded apiKey={apiKey}>

      <CrispChatWidget websiteId={crispWebsiteId} />

      <PolarisAppProvider i18n={translations}>

        <s-app-nav>

          {hasActiveSubscription ? (

            <>

              <s-link href={nav("/app")}>Home</s-link>

              <s-link href={nav("/app/customers")}>Customers</s-link>

              <s-link href={nav("/app/form-config")}>Form Builder</s-link>

              <s-link href={nav("/app/pricing")}>Pricing</s-link>

              <s-link href={nav("/app/settings")}>Settings</s-link>

            </>

          ) : (

            <s-link href={nav("/app/pricing")}>Pricing</s-link>

          )}

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
  const error = useRouteError();

  if (shouldUseShopifyBoundary(error)) {
    return boundary.error(error);
  }

  return <AppErrorPage error={error} />;
}



export const headers: HeadersFunction = (headersArgs) => {

  return boundary.headers(headersArgs);

};


