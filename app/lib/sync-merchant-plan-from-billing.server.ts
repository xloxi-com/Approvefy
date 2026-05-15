import prisma from "../db.server";
import { invalidateMerchantPlanCache, type MerchantPlanId } from "./merchant-plan.server";
import type { PricingTierId } from "./pricing-tiers";
import { SUBSCRIPTION_AMOUNT_USD } from "./billing-plans";

type AdminGraphql = (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;

/** Map active subscription USD price to our plan id (matches Pricing page amounts). */
export function planFromRecurringUsd(amount: number, currencyCode: string): PricingTierId | null {
  if (currencyCode !== "USD") return null;
  const entries = Object.entries(SUBSCRIPTION_AMOUNT_USD) as [PricingTierId, string][];
  for (const [id, s] of entries) {
    if (Math.abs(amount - Number.parseFloat(s)) < 0.01) return id;
  }
  return null;
}

/**
 * Reads Shopify active app subscription and persists `merchantPlan` on AppSettings.
 * Matches subscription display `name` (set in billing flow) first, then recurring USD amount.
 */
export async function syncMerchantPlanFromActiveSubscription(
  admin: { graphql: AdminGraphql },
  shop: string,
): Promise<MerchantPlanId | null> {
  if (!shop?.trim()) return null;

  let detected: PricingTierId | null = null;

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
    const active = subs.find((s) => (s.status ?? "").toUpperCase() === "ACTIVE");
    if (!active) return null;

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
  } catch {
    return null;
  }

  if (!detected) return null;

  try {
    await prisma.appSettings.upsert({
      where: { shop },
      create: { shop, merchantPlan: detected },
      update: { merchantPlan: detected },
    });
    invalidateMerchantPlanCache(shop);
  } catch {
    /* ignore — still return detected so Pricing can show “Current” */
  }

  return detected;
}
