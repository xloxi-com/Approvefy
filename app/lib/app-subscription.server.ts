import type { MerchantPlanId } from "./merchant-plan.server";
import type { PricingTierId } from "./pricing-tiers";
import { SUBSCRIPTION_AMOUNT_USD } from "./billing-plans";
import { CACHE_TTL, getCache, invalidateCache, setCache, shopKey } from "./cache.server";

/** Map active subscription USD price to our plan id (matches Pricing page amounts). */
export function planFromRecurringUsd(amount: number, currencyCode: string): PricingTierId | null {
  if (currencyCode !== "USD") return null;
  const entries = Object.entries(SUBSCRIPTION_AMOUNT_USD) as [PricingTierId, string][];
  for (const [id, s] of entries) {
    if (Math.abs(amount - Number.parseFloat(s)) < 0.01) return id;
  }
  return null;
}

export type AdminGraphql = (
  query: string,
  options?: { variables?: Record<string, unknown> },
) => Promise<Response>;

const SUBSCRIPTION_CACHE_TTL_MS = CACHE_TTL.billingStatus;

function billingCacheKey(shop: string): string {
  return shopKey(shop, "billingStatus");
}

/** Local QA: skip install-time billing gate (does not affect Shopify billing itself). */
export function isBillingGateSkipped(): boolean {
  const skip = process.env.SKIP_APP_SUBSCRIPTION_REQUIREMENT?.trim().toLowerCase();
  if (skip === "1" || skip === "true" || skip === "yes") return true;

  const override = process.env.MERCHANT_PLAN_OVERRIDE?.trim().toLowerCase();
  return override === "basic" || override === "standard" || override === "premium";
}

export function isBillingExemptAppPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/app/pricing" || p.startsWith("/app/billing");
}

export function invalidateAppSubscriptionCache(shop: string): void {
  const key = (shop || "").trim().toLowerCase();
  if (key) invalidateCache(billingCacheKey(key));
}

/** Populate billing + merchant-plan caches after a fresh Shopify read (avoids invalidate-then-refetch). */
export function warmBillingCaches(shop: string, plan: MerchantPlanId | null): void {
  const key = (shop || "").trim().toLowerCase();
  if (!key) return;
  setCache(billingCacheKey(key), plan != null, SUBSCRIPTION_CACHE_TTL_MS);
  if (plan) {
    setCache(shopKey(key, "merchantPlan"), plan, CACHE_TTL.merchantPlan);
  }
}

const subscriptionInflight = new Map<string, Promise<MerchantPlanId | null>>();

function parseActiveSubscriptionPlan(
  subs: Array<{
    name?: string | null;
    status?: string;
    lineItems?: Array<{
      plan?: {
        pricingDetails?: {
          __typename?: string;
          price?: { amount?: unknown; currencyCode?: string };
        };
      };
    }>;
  }>,
): PricingTierId | null {
  const active = subs.find((s) => (s.status ?? "").toUpperCase() === "ACTIVE");
  if (!active) return null;

  let detected: PricingTierId | null = null;
  const subName = (active.name ?? "").toLowerCase();
  if (subName.includes("premium")) detected = "premium";
  else if (subName.includes("standard")) detected = "standard";
  else if (subName.includes("basic")) detected = "basic";

  if (!detected && active.lineItems?.length) {
    outer: for (const li of active.lineItems) {
      const d = li.plan?.pricingDetails;
      if (!d || d.__typename !== "AppRecurringPricing") continue;
      const amountRaw = d.price?.amount;
      const code = (d.price?.currencyCode ?? "").toUpperCase();
      const amount =
        typeof amountRaw === "number"
          ? amountRaw
          : typeof amountRaw === "string"
            ? Number.parseFloat(amountRaw)
            : NaN;
      if (!Number.isFinite(amount)) continue;
      const p = planFromRecurringUsd(amount, code);
      if (p) {
        detected = p;
        break outer;
      }
    }
  }

  return detected;
}

/** Reads Shopify active app subscription for the current installation (no DB write). */
export async function queryActiveAppSubscriptionPlan(
  admin: { graphql: AdminGraphql },
  shop?: string,
): Promise<MerchantPlanId | null> {
  const inflightKey = (shop || "").trim().toLowerCase() || "__session__";
  const existing = subscriptionInflight.get(inflightKey);
  if (existing) return existing;

  const promise = (async (): Promise<MerchantPlanId | null> => {
    try {
      const response = await admin.graphql(
        `#graphql
        query ActiveAppSubscriptionPrice {
          currentAppInstallation {
            activeSubscriptions {
              name
              status
              lineItems {
                plan {
                  pricingDetails {
                    __typename
                    ... on AppRecurringPricing {
                      price {
                        amount
                        currencyCode
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
      );
      const json = (await response.json()) as {
        data?: {
          currentAppInstallation?: {
            activeSubscriptions?: Array<{
              name?: string | null;
              status?: string;
              lineItems?: Array<{
                plan?: {
                  pricingDetails?: {
                    __typename?: string;
                    price?: { amount?: unknown; currencyCode?: string };
                  };
                };
              }>;
            }>;
          };
        };
      };

      const subs = json?.data?.currentAppInstallation?.activeSubscriptions ?? [];
      return parseActiveSubscriptionPlan(subs);
    } catch {
      return null;
    }
  })();

  subscriptionInflight.set(inflightKey, promise);
  try {
    return await promise;
  } finally {
    subscriptionInflight.delete(inflightKey);
  }
}

export async function shopHasActiveAppSubscription(
  admin: { graphql: AdminGraphql },
  shop: string,
): Promise<boolean> {
  if (isBillingGateSkipped()) return true;

  const key = (shop || "").trim().toLowerCase();
  if (!key) return false;

  const cacheKey = billingCacheKey(key);
  const cached = getCache<boolean>(cacheKey);
  if (cached !== undefined) return cached;

  const plan = await queryActiveAppSubscriptionPlan(admin, key);
  const active = plan != null;
  warmBillingCaches(key, plan);
  return active;
}

