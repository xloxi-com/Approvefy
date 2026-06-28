/** Convert admin.shopify.com theme editor URLs for embedded-app navigation. */
export function toShopifyAdminNavigationUrl(fullUrl: string): string {
  try {
    const url = new URL(fullUrl);
    if (url.hostname !== "admin.shopify.com") return fullUrl;
    const path = url.pathname.replace(/^\/store\/[^/]+/, "") || "/";
    return `shopify:admin${path}${url.search}`;
  } catch {
    return fullUrl;
  }
}

/** Open the theme editor in a new browser tab from the embedded Approvefy app. */
export function openThemeEditorUrl(fullUrl: string): void {
  if (!fullUrl?.trim()) return;

  const navigationUrl = toShopifyAdminNavigationUrl(fullUrl);
  const shopifyGlobal = (
    globalThis as { shopify?: { open?: (url: string, target?: string) => void } }
  ).shopify;

  if (shopifyGlobal?.open) {
    try {
      shopifyGlobal.open(navigationUrl, "_blank");
      return;
    } catch {
      try {
        shopifyGlobal.open(fullUrl, "_blank");
        return;
      } catch {
        // fall through to window.open
      }
    }
  }

  window.open(fullUrl, "_blank", "noopener,noreferrer");
}
