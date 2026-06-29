import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { billingSubscribeAction } from "../lib/billing-subscribe.server";
import { mergeEmbedParamsForServerPath } from "../lib/shopify-embed-navigation";

/** Legacy POST target — prefer submitting to /app/pricing action from the Pricing page. */
export const action = (args: ActionFunctionArgs) => billingSubscribeAction(args);

/** GET bookmarks still land on Pricing instead of a blank 405. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  throw redirect(mergeEmbedParamsForServerPath("/app/pricing", url.searchParams));
};
