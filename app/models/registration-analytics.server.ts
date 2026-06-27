/**
 * Registration counts for admin dashboard — isolated so routes like `/app` do not import the full approval model.
 */
import prisma from "../db.server";
import { CACHE_TTL, getCache, setCache, shopKey, invalidateCache } from "../lib/cache.server";

export interface AnalyticsResponse {
    total: number;
    pending: number;
    denied: number;
}

export function invalidateAnalyticsCache(shop: string): void {
    invalidateCache(shopKey(shop, "analytics"));
}

export async function getAnalytics(shop: string): Promise<AnalyticsResponse> {
    try {
        const key = shopKey(shop, "analytics");
        if (shop) {
            const cached = getCache<AnalyticsResponse>(key);
            if (cached) return cached;
        }

        const groups = await prisma.registration.groupBy({
            by: ["status"],
            where: { shop },
            _count: { status: true },
        });

        let total = 0;
        let pending = 0;
        let denied = 0;

        for (const g of groups) {
            total += g._count.status;
            const st = (g.status || "").toLowerCase();
            if (st === "pending") pending += g._count.status;
            else if (st === "denied") denied += g._count.status;
        }

        const result = { total, pending, denied };
        if (shop) {
            setCache(key, result, CACHE_TTL.analytics);
        }
        return result;
    } catch (error) {
        console.error("Error fetching analytics:", error);
        return { total: 0, pending: 0, denied: 0 };
    }
}
