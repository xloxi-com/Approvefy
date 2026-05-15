import prisma from "../db.server";
import { invalidateAppSubscriptionCache } from "./app-subscription.server";
import { invalidateMerchantPlanCache, type MerchantPlanId } from "./merchant-plan.server";
import {
  queryActiveAppSubscriptionPlan,
  type AdminGraphql,
} from "./app-subscription.server";

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

  const detected = await queryActiveAppSubscriptionPlan(admin);
  if (!detected) return null;

  try {
    await prisma.appSettings.upsert({
      where: { shop },
      create: { shop, merchantPlan: detected },
      update: { merchantPlan: detected },
    });
    invalidateMerchantPlanCache(shop);
    invalidateAppSubscriptionCache(shop);
  } catch {
    /* ignore — still return detected so Pricing can show “Current” */
  }

  return detected;
}
