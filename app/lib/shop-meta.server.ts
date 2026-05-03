/**
 * Cached resolver for `shop { name contactEmail }` from the Admin API.
 *
 * The query was being fired 6+ times per request across customer detail, customers list,
 * api.register, settings page — each costing ~150–400ms (cross-region GraphQL). Shop name and
 * contact email rarely change, so this helper caches per shop with a short TTL while still
 * deduping concurrent in-flight calls (multiple emails sent in the same action only fetch once).
 */

import { getShopDisplayName, parseShopFromGraphqlResponse } from "./liquid-placeholders";

export type ShopNameAndEmail = {
    shopName: string;
    shopEmail: string;
};

interface AdminGraphQL {
    graphql: (query: string) => Promise<Response>;
}

const SHOP_META_TTL_MS = 5 * 60_000;
const SHOP_META_MAX = 200;

type ShopMetaEntry = ShopNameAndEmail & { at: number };

const cache = new Map<string, ShopMetaEntry>();
const inflight = new Map<string, Promise<ShopNameAndEmail>>();

function setEntry(key: string, value: ShopNameAndEmail): void {
    cache.set(key, { ...value, at: Date.now() });
    if (cache.size > SHOP_META_MAX) {
        // Evict oldest insertion (Map iteration is insertion-ordered).
        const oldestKey = cache.keys().next().value;
        if (oldestKey != null) cache.delete(oldestKey);
    }
}

/**
 * Resolve {storeName, contactEmail} for a shop. Caches per-shop; falls back to a derived
 * store handle ("xloxi-2243" → "Xloxi 2243") when the API is unavailable.
 */
export async function getShopNameAndEmail(
    admin: AdminGraphQL | null | undefined,
    shop: string
): Promise<ShopNameAndEmail> {
    const key = (shop || "").trim().toLowerCase();
    if (!key) {
        return { shopName: "Store", shopEmail: "" };
    }
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < SHOP_META_TTL_MS) {
        return { shopName: cached.shopName, shopEmail: cached.shopEmail };
    }
    const existing = inflight.get(key);
    if (existing) return existing;

    const fallback: ShopNameAndEmail = {
        shopName: getShopDisplayName(shop, "Store"),
        shopEmail: "",
    };

    if (!admin) {
        return fallback;
    }

    const promise = (async () => {
        try {
            const res = await admin.graphql(
                `#graphql query getShopMeta { shop { name contactEmail } }`
            );
            const parsed = await parseShopFromGraphqlResponse(res);
            const result: ShopNameAndEmail = {
                shopName: getShopDisplayName(shop, parsed.shopName),
                shopEmail: parsed.shopEmail,
            };
            setEntry(key, result);
            return result;
        } catch (e) {
            console.warn(
                "[shop-meta] Shop name/email fetch failed (using fallback):",
                e instanceof Error ? e.message : String(e)
            );
            return fallback;
        } finally {
            inflight.delete(key);
        }
    })();
    inflight.set(key, promise);
    return promise;
}

/** Invalidate cache (e.g. after a webhook updates store settings, if you wire one up). */
export function invalidateShopMeta(shop: string): void {
    const key = (shop || "").trim().toLowerCase();
    if (!key) return;
    cache.delete(key);
}
