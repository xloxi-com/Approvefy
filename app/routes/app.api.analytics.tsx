import type { LoaderFunctionArgs } from "react-router";
import { createHash } from "node:crypto";
import { authenticate } from "../shopify.server";
import { getAnalytics } from "../models/approval.server";

const ANALYTICS_CACHE_TTL_MS = 20 * 1000;
const ANALYTICS_CACHE_CONTROL = "private, max-age=0, s-maxage=20, stale-while-revalidate=60";

type CachedAnalytics = {
  payload: string;
  etag: string;
  expiresAt: number;
};

const analyticsCache = new Map<string, CachedAnalytics>();

function makeEtag(payload: string): string {
  return `"${createHash("sha1").update(payload).digest("hex")}"`;
}

function makeHeaders(etag: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Cache-Control": ANALYTICS_CACHE_CONTROL,
    ETag: etag,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session?.shop ?? "";
  if (!shop) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const now = Date.now();
    const cached = analyticsCache.get(shop);
    if (cached && cached.expiresAt > now) {
      const ifNoneMatch = request.headers.get("if-none-match");
      if (ifNoneMatch && ifNoneMatch === cached.etag) {
        return new Response(null, { status: 304, headers: makeHeaders(cached.etag) });
      }
      return new Response(cached.payload, {
        headers: makeHeaders(cached.etag),
      });
    }

    const analytics = await getAnalytics(shop);
    const payload = JSON.stringify(analytics);
    const etag = makeEtag(payload);
    analyticsCache.set(shop, {
      payload,
      etag,
      expiresAt: now + ANALYTICS_CACHE_TTL_MS,
    });

    return new Response(payload, {
      headers: makeHeaders(etag),
    });
  } catch (error) {
    console.error("Error loading analytics", error);
    return new Response(JSON.stringify({ error: "Failed to load analytics" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
};

