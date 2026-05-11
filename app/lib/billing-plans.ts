import type { PricingTierId } from "./pricing-tiers";
import { PRICING_TRIAL_CTA_NOTE } from "./pricing-tiers";

/** Recurring USD prices for Shopify `appSubscriptionCreate` (aligned with Pricing page copy). */
export const SUBSCRIPTION_AMOUNT_USD: Record<PricingTierId, string> = {
  basic: "4.99",
  standard: "14.99",
  premium: "24.99",
};

/** Display subscription names on the Shopify billing approval screen. */
export const SUBSCRIPTION_DISPLAY_NAMES: Record<PricingTierId, string> = {
  basic: "Approvefy Basic",
  standard: "Approvefy Standard",
  premium: "Approvefy Premium",
};

/** Parses `7-day free trial` → 7 */
export function trialDaysFromCopy(): number {
  const m = PRICING_TRIAL_CTA_NOTE.match(/(\d+)\s*-?\s*day/i);
  return m ? Math.min(365, Math.max(0, parseInt(m[1], 10))) : 7;
}

export function isPricingTierId(v: unknown): v is PricingTierId {
  return v === "basic" || v === "standard" || v === "premium";
}
