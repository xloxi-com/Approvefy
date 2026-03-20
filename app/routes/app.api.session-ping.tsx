import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * Lightweight session-token ping for Shopify’s “Using session tokens” automated check.
 * Uses `authenticate.admin` only (same validation as document loads) — avoids a second
 * JWT path that could disagree and return 401 with `X-Shopify-Retry-Invalid-Session-Request`.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session?.shop ?? "";
    if (!shop) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Retry-Invalid-Session-Request": "1",
        },
      });
    }
    return new Response(JSON.stringify({ ok: true, shop }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
};
