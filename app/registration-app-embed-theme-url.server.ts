/**
 * Theme editor deep link for Approvefy's app embed (app-embed.liquid).
 * @see https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#app-embed-block-deep-linking
 */
export function registrationAppEmbedThemeEditorUrl(shop: string): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const base = `https://admin.shopify.com/store/${storeHandle}/themes/current/editor?template=customers/register&context=apps`;
  if (!apiKey) return base;
  return `${base}&activateAppId=${apiKey}/app-embed`;
}
