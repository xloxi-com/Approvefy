/**
 * Embedded Shopify admin URLs must keep `shop` and `host` (and related params)
 * across in-app navigations; dropping them triggers OAuth / login again.
 */

export const SHOPIFY_EMBED_HOST_STORAGE_KEY = "approvefy_shopify_embed_host";

/** Set before Shopify billing confirmation; cleared after redirect to Home. */
export const BILLING_RETURN_PENDING_STORAGE_KEY = "approvefy_billing_return_pending";

/** Default embedded app entry — Home; billing gate sends unsubscribed merchants to Pricing. */
export const APP_EMBED_ENTRY_PATH = "/app";

/** Plan selection screen for merchants without an active subscription. */
export const APP_PRICING_PATH = "/app/pricing";

export function markBillingReturnPending(): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(BILLING_RETURN_PENDING_STORAGE_KEY, "1");
    } catch {
        /* ignore */
    }
}

export function readBillingReturnPending(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return sessionStorage.getItem(BILLING_RETURN_PENDING_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

export function clearBillingReturnPending(): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.removeItem(BILLING_RETURN_PENDING_STORAGE_KEY);
    } catch {
        /* ignore */
    }
}

/** Root `/` must not render the public landing page when Shopify opens the embedded app. */
export function isEmbeddedShopifyAdminEntry(request: Request, url: URL): boolean {
    if (url.searchParams.get("shop")?.trim()) return true;
    if (url.searchParams.get("host")?.trim()) return true;
    if (url.searchParams.get("embedded") === "1") return true;
    if (url.searchParams.get("appLoadId")) return true;
    const auth = request.headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) return true;
    return false;
}

/** Query string for `/app` entry — drops Shopify-only load correlation params. */
export function redirectSearchParamsForAppEntry(searchParams: URLSearchParams): string {
    const params = new URLSearchParams(searchParams);
    params.delete("appLoadId");
    return params.toString();
}

/** Client-only: read cached embed `host` (used when URL lost it after in-app nav). */
export function readStoredEmbedHost(): string {
    if (typeof window === "undefined") return "";
    try {
        return sessionStorage.getItem(SHOPIFY_EMBED_HOST_STORAGE_KEY)?.trim() ?? "";
    } catch {
        return "";
    }
}

/** Route-only params that shouldn’t leak onto other embedded app URLs. */
const APP_NAV_SEARCH_PARAM_DROP = new Set(["formId", "billing"]);

/** Server-side redirect helper — preserves Shopify embed params from the incoming request. */
export function mergeEmbedParamsForServerPath(
    pathname: string,
    searchParams: URLSearchParams,
): string {
    const next = new URLSearchParams();
    searchParams.forEach((value, key) => {
        if (!APP_NAV_SEARCH_PARAM_DROP.has(key)) next.append(key, value);
    });
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
}

/** Like mergeEmbedParamsForServerPath but keeps `billing=callback` (Pricing activation flow). */
export function mergeEmbedParamsPreservingBilling(
    pathname: string,
    searchParams: URLSearchParams,
): string {
    const next = new URLSearchParams();
    searchParams.forEach((value, key) => {
        if (key === "formId") return;
        next.append(key, value);
    });
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
}

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
