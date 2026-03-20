/**
 * Shared (client + server) placeholder replacement for rejection email templates.
 * Replaces Shopify Liquid-style tags like {{ shop.name }}, {{ customer.first_name }} with actual values.
 */

export type LiquidReplacementVars = {
  email?: string;
  shopName?: string;
  shopEmail?: string;
  shopDomain?: string;
  shopUrl?: string;
  customerFirstName?: string;
  customerEmail?: string;
  currentYear?: string;
  /** For approval emails: link for customer to set password and activate account */
  activationUrl?: string;
};

/** Replace Liquid-style placeholders with store/customer values. Supports {{ }}, (( )), [[ ]]. */
export function replaceLiquidPlaceholders(
  text: string,
  vars: LiquidReplacementVars
): string {
  if (!text || typeof text !== "string") return text;
  const email = vars.email ?? "";
  const shopName = vars.shopName ?? "Store";
  const shopEmail = vars.shopEmail ?? "";
  const shopDomain = vars.shopDomain ?? "";
  const shopUrl = vars.shopUrl ?? "";
  const customerFirstName = vars.customerFirstName ?? "Customer";
  const customerEmail = vars.customerEmail ?? email;
  const currentYear = vars.currentYear ?? String(new Date().getFullYear());
  const activationUrl = vars.activationUrl ?? "";

  const repl = (t: string) =>
    t
      .replace(/\{\{\s*activation_url\s*\}\}/gi, activationUrl)
      .replace(/\{\{\s*email\s*\}\}/gi, email)
      .replace(/\{\{\s*shop\.name\s*\}\}/gi, shopName)
      .replace(/\{\{\s*shop\.email\s*\}\}/gi, shopEmail)
      .replace(/\{\{\s*shop\.domain\s*\}\}/gi, shopDomain)
      .replace(/\{\{\s*shop\.url\s*\}\}/gi, shopUrl)
      .replace(/\{\{\s*customer\.email\s*\}\}/gi, customerEmail)
      .replace(/\{\{\s*customer\.first_name\s*\|\s*default:\s*["']([^"']*)["']\s*\}\}/gi, (_, defaultVal) => customerFirstName || defaultVal || "Customer")
      .replace(/\{\{\s*customer\.first_name\s*\}\}/gi, customerFirstName)
      .replace(/\{\{\s*['"]now['"]\s*\|\s*date:\s*["']%Y["']\s*\}\}/gi, currentYear)
      .replace(/\{\{\s*['"]now['"]\s*\|\s*date:\s*['"]%Y['"]\s*\}\}/gi, currentYear)
      .replace(/\{\{\s*'now'\s*\|\s*date:\s*"%Y"\s*\}\}/g, currentYear)
      .replace(/\{\{\s*"now"\s*\|\s*date:\s*'%Y'\s*\}\}/g, currentYear)
      .replace(/\(\(\s*email\s*\)\)/gi, email)
      .replace(/\(\(\s*shop\.name\s*\)\)/gi, shopName)
      .replace(/\(\(\s*shop\.email\s*\)\)/gi, shopEmail)
      .replace(/\(\(\s*shop\.domain\s*\)\)/gi, shopDomain)
      .replace(/\(\(\s*shop\.url\s*\)\)/gi, shopUrl)
      .replace(/\(\(\s*customer\.email\s*\)\)/gi, customerEmail)
      .replace(/\(\(\s*customer\.first_name\s*\|\s*default:\s*["']([^"']*)["']\s*\)\)/gi, (_, defaultVal) => customerFirstName || defaultVal || "Customer")
      .replace(/\(\(\s*customer\.first_name\s*\)\)/gi, customerFirstName)
      .replace(/\(\(\s*['"]now['"]\s*\|\s*date:\s*["']%Y["']\s*\)\)/gi, currentYear)
      .replace(/\(\(\s*activation_url\s*\)\)/gi, activationUrl)
      .replace(/\[\[\s*activation_url\s*\]\]/gi, activationUrl)
      .replace(/\[\[\s*shop\.name\s*\]\]/gi, shopName)
      .replace(/\[\[\s*shop\.email\s*\]\]/gi, shopEmail)
      .replace(/\[\[\s*shop\.domain\s*\]\]/gi, shopDomain)
      .replace(/\[\[\s*shop\.url\s*\]\]/gi, shopUrl)
      .replace(/\[\[\s*customer\.email\s*\]\]/gi, customerEmail);
  return repl(text);
}

type ShopGraphqlPayload = { data?: { shop?: { name?: string; contactEmail?: string } } };

/**
 * Resolve display name for {{ shop.name }}: use API name if valid, else derive from shop host (e.g. xloxi-2243 → "Xloxi 2243").
 * Use this for both Settings preview and sent rejection emails so "Store" is never shown when we have a host.
 */
export function getShopDisplayName(shopHost: string, nameFromApi?: string): string {
  const trimmed = typeof nameFromApi === "string" ? nameFromApi.trim() : "";
  if (trimmed && trimmed !== "Store") return trimmed;
  const handle = (shopHost || "").replace(/\.myshopify\.com$/i, "").trim();
  if (!handle) return "Store";
  return handle
    .split(/[-_.]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Parse shop name and email from admin.graphql(shop { name contactEmail }) result.
 * Handles both Response (with .json()) and already-parsed object.
 */
export async function parseShopFromGraphqlResponse(
  res: Response | ShopGraphqlPayload
): Promise<{ shopName: string; shopEmail: string }> {
  let data: ShopGraphqlPayload | null = null;
  if (res != null && typeof (res as Response).json === "function") {
    data = (await (res as Response).json()) as ShopGraphqlPayload;
  } else if (res != null && typeof res === "object" && "data" in res) {
    data = res as ShopGraphqlPayload;
  }
  const name = data?.data?.shop?.name;
  const email = data?.data?.shop?.contactEmail ?? "";
  return {
    shopName: typeof name === "string" && name.trim() ? name.trim() : "Store",
    shopEmail: typeof email === "string" ? email.trim() : "",
  };
}
