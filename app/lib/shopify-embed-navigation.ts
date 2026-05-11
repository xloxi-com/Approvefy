/**
 * Embedded Shopify admin URLs must keep `shop` and `host` (and related params)
 * across in-app navigations; dropping them triggers OAuth / login again.
 */

export const SHOPIFY_EMBED_HOST_STORAGE_KEY = "approvefy_shopify_embed_host";

/** Route-only params that shouldn’t leak onto other embedded app URLs. */
const APP_NAV_SEARCH_PARAM_DROP = new Set(["formId", "billing"]);

/**
 * Builds a relative path (`/app/...`) with the same embed context as the current page.
 * Use with React Router `navigate()`, not `<a href="/app/foo">`.
 */
export function mergeEmbedParamsForAppPath(pathname: string, currentSearchParams: URLSearchParams): string {
    const next = new URLSearchParams();
    currentSearchParams.forEach((value, key) => {
        if (!APP_NAV_SEARCH_PARAM_DROP.has(key)) next.append(key, value);
    });
    try {
        if (!next.get("host") && typeof sessionStorage !== "undefined") {
            const stored = sessionStorage.getItem(SHOPIFY_EMBED_HOST_STORAGE_KEY)?.trim();
            if (stored) next.set("host", stored);
        }
    } catch {
        /* ignore storage */
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
}
