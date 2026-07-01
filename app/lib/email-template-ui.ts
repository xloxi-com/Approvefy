/** Logo URL must be PNG, JPG or WebP only. SVG is not allowed. */
export function isSvgLogoUrl(url: string): boolean {
  const u = url?.trim();
  if (!u) return false;
  return /\.svg(\?|#|$)/i.test(u);
}

export function isAllowedLogoUrl(url: string): boolean {
  const u = url?.trim();
  if (!u) return true;
  return /\.(png|jpe?g|webp)(\?|#|$)/i.test(u);
}

export function isValidHexColor(value: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test((value ?? "").trim());
}

export type EmailAlign = "left" | "center" | "right";

export function normalizeEmailAlign(value: string | undefined): EmailAlign {
  return value === "center" || value === "right" ? value : "left";
}

export function bodyHtmlFromPlain(raw: string): string {
  if (raw.includes("<")) return raw;
  return raw
    .split("\n")
    .map((line) =>
      line.trim()
        ? `<p style="margin:0 0 8px">${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`
        : "<br/>",
    )
    .join("");
}

export const DEFAULT_REJECT_SUBJECT = "Your account registration update";
export const DEFAULT_REJECT_BODY =
  "Unfortunately, your registration was not approved at this time. If you have questions, please contact us.";
export const DEFAULT_APPROVE_SUBJECT = "Your account has been approved";
export const DEFAULT_APPROVE_BODY =
  "Congratulations! Your customer account has been approved. Use the link below to log in to the store (Shopify may ask you to finish activating your account the first time).";

export const HEADER_TITLE_SIZE_OPTIONS = [
  { label: "16px", value: "16" },
  { label: "18px", value: "18" },
  { label: "20px", value: "20" },
  { label: "24px", value: "24" },
  { label: "28px", value: "28" },
];

export const LOGO_ALIGN_OPTIONS = [
  { label: "Left", value: "left" },
  { label: "Center", value: "center" },
  { label: "Right", value: "right" },
];

/** Demo storefront used in admin email previews only — never the merchant's real URL. */
export const EMAIL_PREVIEW_SHOP_HANDLE = "your-store";
export const EMAIL_PREVIEW_SHOP_URL = `https://${EMAIL_PREVIEW_SHOP_HANDLE}.myshopify.com`;

export function buildEmailPreviewLiquidVars(options: {
  shopDisplayName?: string;
  includeActivation?: boolean;
}) {
  return {
    email: "customer@example.com",
    shopName: options.shopDisplayName?.trim() || "Store",
    shopEmail: "hello@example.com",
    shopDomain: EMAIL_PREVIEW_SHOP_HANDLE,
    shopUrl: EMAIL_PREVIEW_SHOP_URL,
    customerFirstName: "Customer",
    customerEmail: "customer@example.com",
    currentYear: String(new Date().getFullYear()),
    ...(options.includeActivation ? { activationUrl: "https://example.com/account/activate" } : {}),
  };
}

/** Strip real Shopify store URLs from preview HTML (admin UI only; sent emails unchanged). */
export function sanitizeEmailPreviewHtml(html: string, realStoreDomain?: string): string {
  let out = html;
  out = out.replace(/https?:\/\/[a-z0-9-]+\.myshopify\.com(\/[^\s"'<>]*)?/gi, (_match, path?: string) => {
    return `${EMAIL_PREVIEW_SHOP_URL}${path ?? ""}`;
  });
  out = out.replace(/\b[a-z0-9-]+\.myshopify\.com(\/[^\s"'<>]*)?/gi, (_match, path?: string) => {
    return `${EMAIL_PREVIEW_SHOP_HANDLE}.myshopify.com${path ?? ""}`;
  });
  const handle = (realStoreDomain ?? "").replace(/\.myshopify\.com$/i, "").trim();
  if (handle && handle !== EMAIL_PREVIEW_SHOP_HANDLE) {
    const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "gi"), EMAIL_PREVIEW_SHOP_HANDLE);
  }
  return out;
}
