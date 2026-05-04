/**
 * Registration counts for admin dashboard — isolated so routes like `/app` do not import the full approval model.
 */
import prisma from "../db.server";

export interface AnalyticsResponse {
    total: number;
    pending: number;
    denied: number;
}

const ANALYTICS_CACHE_TTL_MS = 30_000;
const analyticsCache = new Map<string, { value: AnalyticsResponse; at: number }>();

function setBoundedCacheEntry<V>(map: Map<string, V>, key: string, value: V, max: number): void {
    map.set(key, value);
    if (map.size > max) {
        const oldest = map.keys().next().value;
        if (oldest != null) map.delete(oldest);
    }
}

export function invalidateAnalyticsCache(shop: string): void {
    const key = (shop || "").trim().toLowerCase();
    if (key) analyticsCache.delete(key);
}

export async function getAnalytics(shop: string): Promise<AnalyticsResponse> {
    try {
        const key = (shop || "").trim().toLowerCase();
        if (key) {
            const cached = analyticsCache.get(key);
            if (cached && Date.now() - cached.at < ANALYTICS_CACHE_TTL_MS) {
                return cached.value;
            }
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
        if (key) {
            setBoundedCacheEntry(analyticsCache, key, { value: result, at: Date.now() }, 200);
        }
        return result;
    } catch (error) {
        console.error("Error fetching analytics:", error);
        return { total: 0, pending: 0, denied: 0 };
    }
}
