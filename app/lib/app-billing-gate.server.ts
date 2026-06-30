import { redirect } from "react-router";

import {
  isBillingExemptAppPath,
  isBillingGateSkipped,
  invalidateAppSubscriptionCache,
  shopHasActiveAppSubscription,
  type AdminGraphql,
} from "./app-subscription.server";
import { invalidateMerchantPlanCache } from "./merchant-plan.server";
import { syncMerchantPlanFromActiveSubscription } from "./sync-merchant-plan-from-billing.server";
import {
  APP_EMBED_ENTRY_PATH,
  mergeEmbedParamsForServerPath,
  mergeEmbedParamsPreservingBilling,
} from "./shopify-embed-navigation";

/** Resolve whether the shop has an active paid plan (Shopify subscription). */
export async function resolveHasActiveAppSubscription(
  request: Request,
  admin: { graphql: AdminGraphql },
  shop: string,
): Promise<boolean> {
  if (isBillingGateSkipped()) return true;

  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const billingCallback = url.searchParams.get("billing") === "callback";
  const onPricingPage = pathname === APP_EMBED_ENTRY_PATH;

  /** Fresh Shopify read on Pricing / billing return — avoids stale cached `false` after subscribe. */
  if (billingCallback || onPricingPage) {
    invalidateAppSubscriptionCache(shop);
    invalidateMerchantPlanCache(shop);
    let plan = await syncMerchantPlanFromActiveSubscription(admin, shop);
    if (plan == null && billingCallback) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      invalidateAppSubscriptionCache(shop);
      plan = await syncMerchantPlanFromActiveSubscription(admin, shop);
    }
    if (plan != null) return true;
  }

  return shopHasActiveAppSubscription(admin, shop);
}

/** Redirect to Pricing until subscribed; send subscribed merchants Home after billing return. */
export function enforceAppBillingGate(
  request: Request,
  hasActiveSubscription: boolean,
): void {
  if (isBillingGateSkipped()) return;

  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const billingCallback = url.searchParams.get("billing") === "callback";

  if (hasActiveSubscription) {
    if (billingCallback && (pathname === "/app" || pathname === APP_EMBED_ENTRY_PATH)) {
      throw redirect(mergeEmbedParamsForServerPath("/app", url.searchParams));
    }
    return;
  }

  /** Shopify returns here after charge approval — stay on Home while subscription activates. */
  if (billingCallback && pathname === "/app") return;

  if (isBillingExemptAppPath(pathname)) return;

  throw redirect(mergeEmbedParamsPreservingBilling(APP_EMBED_ENTRY_PATH, url.searchParams));
}
