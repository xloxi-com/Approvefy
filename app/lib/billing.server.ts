/**
 * Billing / plan selection logic.
 * Plans and prices are created in Shopify Partner Dashboard (Managed Pricing).
 * This module only checks subscription status and builds the URL to Shopify's plan selection page.
 */

const APP_HANDLE = process.env.SHOPIFY_APP_HANDLE || "approvefy";

export function getPlanSelectionUrl(shop: string): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
  return `https://admin.shopify.com/store/${storeHandle}/charges/${APP_HANDLE}/pricing_plans`;
}

export type PlanType = "basic" | "pro";

export type BillingCheckResult = {
  hasActivePayment: boolean;
  pricingUrl: string;
  planType: PlanType;
};

/**
 * Determine plan type from subscription name. Basic = manual approval only; Pro = manual + auto approval.
 * Partner dashboard plan names containing "Pro" (case-insensitive) are treated as Pro; otherwise Basic.
 */
export function planTypeFromSubscriptionName(name: string | null | undefined): PlanType {
  if (!name || typeof name !== "string") return "basic";
  return name.toLowerCase().includes("pro") ? "pro" : "basic";
}

/**
 * Check if the shop has an active app subscription and return plan type (Basic vs Pro).
 * Uses currentAppInstallation.activeSubscriptions from Admin API.
 */
export async function checkBilling(admin: { graphql: (query: string) => Promise<Response> }, shop: string): Promise<BillingCheckResult> {
  const pricingUrl = getPlanSelectionUrl(shop);
  let planType: PlanType = "basic";
  try {
    const res = await admin.graphql(
      `#graphql
      query BillingCheck {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
          }
        }
      }`
    );
    const json = (await res.json()) as {
      data?: { currentAppInstallation?: { activeSubscriptions?: { id: string; name?: string }[] } };
      errors?: unknown[];
    };
    const list = json.data?.currentAppInstallation?.activeSubscriptions ?? [];
    if (list.length > 0) {
      const firstName = list[0].name;
      planType = planTypeFromSubscriptionName(firstName);
    }
    return { hasActivePayment: list.length > 0, pricingUrl, planType };
  } catch {
    return { hasActivePayment: false, pricingUrl, planType };
  }
}
