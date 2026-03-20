/**
 * Opens the theme editor on App embeds (customer register preview).
 *
 * Omitting `activateAppId` avoids Shopify’s red banner “App embed does not exist”, which
 * appears when `activateAppId={apiKey}/app-embed` is used but this store’s **active app
 * version** does not yet include the theme app extension (or the server API key is for a
 * different Partner app than the one installed).
 *
 * After `shopify app deploy` has released the extension, you may set
 * `SHOPIFY_APP_EMBED_ACTIVATE_DEEPLINK=1` to append `activateAppId` (optional convenience).
 *
 * @see https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#app-embed-block-deep-linking
 */
export function registrationAppEmbedThemeEditorUrl(shop: string): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
  const base = `https://admin.shopify.com/store/${storeHandle}/themes/current/editor?context=apps&template=customers/register`;
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const useActivate =
    process.env.SHOPIFY_APP_EMBED_ACTIVATE_DEEPLINK === "1" && apiKey.length > 0;
  if (!useActivate) return base;
  return `${base}&activateAppId=${apiKey}/app-embed`;
}
