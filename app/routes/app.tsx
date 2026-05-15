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

  isBillingExemptAppPath,

  shopHasActiveAppSubscription,

} from "../lib/app-subscription.server";

import {

  mergeEmbedParamsForAppPath,

  mergeEmbedParamsForServerPath,

} from "../lib/shopify-embed-navigation";

import { authenticate } from "../shopify.server";

import { CrispChatWidget } from "../components/CrispChatWidget";

import "../styles/layout.css";



/** Default Crisp site; override with `CRISP_WEBSITE_ID` in `.env` for staging / white-label. */

const DEFAULT_CRISP_WEBSITE_ID = "37838a46-8fb5-457f-8976-f8ebfca547b1";



export const loader = async ({ request }: LoaderFunctionArgs) => {

  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);

  const pathname = url.pathname;



  const hasActiveSubscription = await shopHasActiveAppSubscription(admin, session.shop);

  if (!isBillingExemptAppPath(pathname) && !hasActiveSubscription) {
    const pricingPath = mergeEmbedParamsForServerPath("/app/pricing", url.searchParams);
    throw redirect(pricingPath);
  }



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

  return boundary.error(useRouteError());

}



export const headers: HeadersFunction = (headersArgs) => {

  return boundary.headers(headersArgs);

};


