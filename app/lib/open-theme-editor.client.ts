/** Open the theme editor in a new tab from the embedded Approvefy app. */
export function openThemeEditorUrl(fullUrl: string): void {
  if (!fullUrl?.trim()) return;

  const shopifyGlobal = (
    globalThis as { shopify?: { open?: (url: string, target?: string) => void } }
  ).shopify;

  // Deep links (addAppBlockId, previewPath, template) require the full admin.shopify.com URL.
  if (shopifyGlobal?.open) {
    try {
      shopifyGlobal.open(fullUrl, "_blank");
      return;
    } catch {
      // fall through
    }
  }

  try {
    if (window.top && window.top !== window) {
      window.top.open(fullUrl, "_blank", "noopener,noreferrer");
      return;
    }
  } catch {
    // cross-origin iframe
  }

  window.open(fullUrl, "_blank", "noopener,noreferrer");
}
