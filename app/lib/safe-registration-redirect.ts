/**
 * Post-registration redirects to /account (home) or OAuth callback-style URLs often
 * send shoppers into broken Customer Account flows. We still allow /account/login and
 * /account/register (including locale-prefixed paths) since merchants commonly use them.
 */
function isAllowedStorefrontAccountRedirectPath(pathLower: string): boolean {
    const p = pathLower.startsWith("/") ? pathLower : `/${pathLower}`;
    return /\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?account\/(?:login|register)(?:\/|\?|$)/.test(p);
}

export function isUnsafeRegistrationRedirectUrl(raw: string): boolean {
    const t = (raw || "").trim();
    if (!t) return true;
    const lower = t.toLowerCase();
    if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) {
        return true;
    }

    try {
        if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("//")) {
            const u = new URL(lower.startsWith("//") ? `https:${lower}` : t);
            const host = (u.hostname || "").toLowerCase();
            if (host === "shopify.com" || host === "www.shopify.com") return true;
            const path = (u.pathname || "/").toLowerCase();
            if (isAllowedStorefrontAccountRedirectPath(path)) return false;
            if (path === "/account" || path.startsWith("/account/")) return true;
            return false;
        }
        const pathPart = t.split("?")[0];
        const path = (pathPart.startsWith("/") ? pathPart : `/${pathPart}`).toLowerCase();
        if (isAllowedStorefrontAccountRedirectPath(path)) return false;
        if (path === "/account" || path.startsWith("/account/")) return true;
        return false;
    } catch {
        return true;
    }
}

export function sanitizeRegistrationRedirectForResponse(
    afterSubmit: "redirect" | "message",
    redirectUrl: string
): { afterSubmit: "redirect" | "message"; redirectUrl: string } {
    if (afterSubmit !== "redirect") {
        return { afterSubmit, redirectUrl: "" };
    }
    const u = (redirectUrl || "").trim();
    if (!u || isUnsafeRegistrationRedirectUrl(u)) {
        return { afterSubmit: "message", redirectUrl: "" };
    }
    return { afterSubmit: "redirect", redirectUrl: u };
}
