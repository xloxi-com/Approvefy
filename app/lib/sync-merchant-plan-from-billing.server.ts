import prisma from "../db.server";
import {
  invalidateAppSubscriptionCache,
  queryActiveAppSubscriptionPlan,
  warmBillingCaches,
  type AdminGraphql,
} from "./app-subscription.server";
import { invalidateMerchantPlanCache } from "./merchant-plan.server";
import type { MerchantPlanId } from "./merchant-plan.server";

export type { AdminGraphql };
export { planFromRecurringUsd } from "./app-subscription.server";

/**
 * Reads Shopify active app subscription and persists `merchantPlan` on AppSettings.
 * Matches subscription display `name` (set in billing flow) first, then recurring USD amount.
 */
export async function syncMerchantPlanFromActiveSubscription(
  admin: { graphql: AdminGraphql },
  shop: string,
): Promise<MerchantPlanId | null> {
  if (!shop?.trim()) return null;

  const detected = await queryActiveAppSubscriptionPlan(admin, shop);
  warmBillingCaches(shop, detected);
  if (!detected) return null;

  try {
    await prisma.appSettings.upsert({
      where: { shop },
      create: { shop, merchantPlan: detected },
      update: { merchantPlan: detected },
    });
  } catch {
    /* ignore — still return detected so Pricing can show “Current” */
  }

  return detected;
}

/** After Shopify charge approval, subscription can take a moment to become ACTIVE. */
export async function syncMerchantPlanAfterBillingApproval(
  admin: { graphql: AdminGraphql },
  shop: string,
): Promise<MerchantPlanId | null> {
  if (!shop?.trim()) return null;

  invalidateAppSubscriptionCache(shop);
  invalidateMerchantPlanCache(shop);

  const retryDelaysMs = [0, 750, 1500];
  for (let i = 0; i < retryDelaysMs.length; i++) {
    const delay = retryDelaysMs[i] ?? 0;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      invalidateAppSubscriptionCache(shop);
    }
    const plan = await syncMerchantPlanFromActiveSubscription(admin, shop);
    if (plan != null) return plan;
  }

  return null;
}
