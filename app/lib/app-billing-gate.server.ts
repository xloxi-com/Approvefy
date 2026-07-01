import { redirect } from "react-router";

import {
  isBillingExemptAppPath,
  isBillingGateSkipped,
  invalidateAppSubscriptionCache,
  shopHasActiveAppSubscription,
  type AdminGraphql,
} from "./app-subscription.server";
import { invalidateMerchantPlanCache } from "./merchant-plan.server";
import {
  syncMerchantPlanAfterBillingApproval,
  syncMerchantPlanFromActiveSubscription,
} from "./sync-merchant-plan-from-billing.server";
import {
  APP_EMBED_ENTRY_PATH,
  APP_PRICING_PATH,
  isLegacyPricingColdOpen,
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
  const onPricingPage = pathname === APP_PRICING_PATH;
  const appColdOpen = url.searchParams.has("appLoadId");

  if (billingCallback) {
    const plan = await syncMerchantPlanAfterBillingApproval(admin, shop);
    return plan != null;
  }

  /** Fresh Shopify read on install open or Pricing — avoids stale cached subscription. */
  if (onPricingPage || appColdOpen) {
    invalidateAppSubscriptionCache(shop);
    invalidateMerchantPlanCache(shop);
    const plan = await syncMerchantPlanFromActiveSubscription(admin, shop);
    if (plan != null) return true;
    return false;
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
    if (billingCallback && (pathname === APP_EMBED_ENTRY_PATH || pathname === APP_PRICING_PATH)) {
      throw redirect(mergeEmbedParamsForServerPath(APP_EMBED_ENTRY_PATH, url.searchParams));
    }
    /** Legacy application_url pointed at Pricing — subscribed merchants open Home instead. */
    if (pathname === APP_PRICING_PATH && isLegacyPricingColdOpen(request, url)) {
      throw redirect(mergeEmbedParamsForServerPath(APP_EMBED_ENTRY_PATH, url.searchParams));
    }
    return;
  }

  /** Shopify returns here after charge approval — keep activation on Pricing until subscribed. */
  if (billingCallback && pathname === APP_EMBED_ENTRY_PATH) {
    throw redirect(mergeEmbedParamsPreservingBilling(APP_PRICING_PATH, url.searchParams));
  }

  if (billingCallback && pathname === APP_PRICING_PATH) return;

  if (isBillingExemptAppPath(pathname)) return;

  throw redirect(mergeEmbedParamsPreservingBilling(APP_PRICING_PATH, url.searchParams));
}
