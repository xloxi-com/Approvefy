import prisma from "../db.server";
import {
  queryActiveAppSubscriptionPlan,
  warmBillingCaches,
  type AdminGraphql,
} from "./app-subscription.server";
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
