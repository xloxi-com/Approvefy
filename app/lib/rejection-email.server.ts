/**
 * Send rejection email via Custom SMTP using the "rejection" email template.
 * Builds full HTML with optional logo, header, body, button, footer from Settings.
 * SVG logos are converted to PNG for email client compatibility.
 */

import prisma from "../db.server";
import { getEmailTemplateBySlug } from "../models/email-template.server";
import { sendMailViaSmtp } from "./smtp.server";
import { replaceLiquidPlaceholders, type LiquidReplacementVars } from "./liquid-placeholders";
import { APP_DISPLAY_NAME, APP_URL } from "./app-constants";
import sharp from "sharp";

const DEFAULT_REJECT_SUBJECT = "Your account registration update";
const DEFAULT_REJECT_BODY = "Unfortunately, your registration was not approved at this time. If you have questions, please contact us.";

export type SendRejectionEmailResult = { sent: boolean; reason?: string };

const HEX_COLOR = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
type LogoAlign = "left" | "center" | "right";

function buildRejectionEmailHtml(
  bodyHtml: string,
  opts: {
    logoUrl?: string | null;
    logoSize?: string | number | null;
    headerTitle?: string | null;
    headerTitleSize?: string | number | null;
    headerTitleColor?: string | null;
    headerBgColor?: string | null;
    logoAlign?: LogoAlign | null;
    buttonText?: string | null;
    buttonUrl?: string | null;
    buttonColor?: string | null;
    buttonTextColor?: string | null;
    buttonAlign?: "left" | "center" | "right" | null;
    footerText?: string | null;
    showPoweredBy?: boolean;
    appName?: string | null;
  }
): string {
  const parts: string[] = [];
  const headerBg = opts.headerBgColor?.trim();
  const hasHeaderBg = headerBg && HEX_COLOR.test(headerBg);
  const align = opts.logoAlign === "center" || opts.logoAlign === "right" ? opts.logoAlign : "left";

  const logoSizeNum = opts.logoSize != null ? Number(opts.logoSize) : 200;
  const logoPx = (Number.isFinite(logoSizeNum) && logoSizeNum >= 80 && logoSizeNum <= 400 ? logoSizeNum : 200) + "px";
  const logoWrapperAlignCss =
    align === "center"
      ? "margin-left:auto;margin-right:auto;"
      : align === "right"
      ? "margin-left:auto;margin-right:0;"
      : "";
  const headerParts: string[] = [];
  const headerSize = opts.headerTitleSize != null ? Number(opts.headerTitleSize) : 24;
  const headerPx = (Number.isFinite(headerSize) && headerSize >= 12 && headerSize <= 48 ? headerSize : 24) + "px";
  const titleColor = opts.headerTitleColor?.trim();
  const titleColorCss = titleColor && HEX_COLOR.test(titleColor) ? titleColor : "#111";
  const hasTitle = !!(opts.headerTitle && opts.headerTitle.trim());
  if (opts.logoUrl && opts.logoUrl.trim()) {
    const marginBottom = hasTitle ? 16 : 0;
    headerParts.push(
      `<div style="margin-bottom:${marginBottom}px;${logoWrapperAlignCss}display:block;max-width:${logoPx}"><img src="${opts.logoUrl.trim()}" alt="Logo" style="max-width:100%;width:100%;height:auto;display:block" /></div>`
    );
  }
  if (hasTitle && opts.headerTitle) {
    headerParts.push(
      `<h1 style="margin:0 0 16px;font-size:${headerPx};line-height:1.35;font-weight:700;color:${titleColorCss}">${escapeHtml(opts.headerTitle.trim())}</h1>`
    );
  }
  if (headerParts.length) {
    const headerStyle = [
      "padding:20px 24px",
      "display:flex",
      "align-items:center",
      "min-height:60px",
      "box-sizing:border-box",
      hasHeaderBg ? `background-color:${headerBg}` : "",
    ].filter(Boolean).join(";");
    const wrapperStyle = `text-align:${align};width:100%`;
    parts.push(`<div style="${headerStyle}"><div style="${wrapperStyle}">${headerParts.join("")}</div></div>`);
  }
  parts.push(bodyHtml);
  const buttonBg = opts.buttonColor?.trim();
  const buttonBgCss = buttonBg && HEX_COLOR.test(buttonBg) ? buttonBg : "#dc2626";
  const buttonFg = opts.buttonTextColor?.trim();
  const buttonFgCss = buttonFg && HEX_COLOR.test(buttonFg) ? buttonFg : "#fff";
  const buttonAlign = opts.buttonAlign === "center" || opts.buttonAlign === "right" ? opts.buttonAlign : "left";
  if (opts.buttonText && opts.buttonText.trim() && opts.buttonUrl && opts.buttonUrl.trim()) {
    parts.push(
      `<div style="margin-top:20px;width:100%;text-align:${buttonAlign}"><a href="${opts.buttonUrl.trim()}" style="display:inline-block;padding:12px 24px;background:${buttonBgCss};color:${buttonFgCss};text-decoration:none;border-radius:6px;font-weight:600">${escapeHtml(opts.buttonText.trim())}</a></div>`
    );
  }
  if (opts.footerText && opts.footerText.trim()) {
    const footer = opts.footerText.trim();
    if (footer.includes("<")) {
      parts.push(`<div style="margin-top:24px;font-size:12px;color:#6b7280">${footer}</div>`);
    } else {
      parts.push(
        `<p style="margin-top:24px;font-size:12px;color:#6b7280">${escapeHtml(footer)}</p>`
      );
    }
  }
  if (opts.showPoweredBy && opts.appName && opts.appName.trim()) {
    parts.push(
      `<p style="margin-top:12px;font-size:11px;color:#9ca3af">Powered by <a href="${escapeHtml(APP_URL)}" style="color:#9ca3af;text-decoration:underline">${escapeHtml(opts.appName.trim())}</a></p>`
    );
  }
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">${parts.join("")}</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type { LiquidReplacementVars } from "./liquid-placeholders";

const LOGO_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; Shopify-App/1.0; +https://shopify.com)",
  Accept: "image/svg+xml,image/*,*/*",
} as const;

/** If logo is SVG, fetch and convert to PNG data URL so email clients display it. */
async function resolveLogoUrlForEmail(
  logoUrl: string | null | undefined,
  maxWidthPx: number = 400
): Promise<string> {
  const url = logoUrl?.trim();
  if (!url) return "";

  const isSvgByUrl = /\.svg(\?|#|$)/i.test(url);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(15000),
      headers: LOGO_FETCH_HEADERS,
      redirect: "follow",
    });
    if (!res.ok) {
      console.warn("[Rejection Email] Logo fetch failed:", res.status, url);
      return url;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return url;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const isSvg = isSvgByUrl || ct.includes("svg");
    if (!isSvg) return url;

    const w = Math.min(400, Math.max(80, maxWidthPx));
    const pngBuf = await sharp(buf, { density: 200 })
      .resize(w, Math.ceil(w / 2), { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    const dataUrl = `data:image/png;base64,${pngBuf.toString("base64")}`;
    return dataUrl;
  } catch (err) {
    console.warn("[Rejection Email] SVG→PNG conversion failed:", err instanceof Error ? err.message : String(err), url);
    return url;
  }
}

export type SendRejectionEmailOptions = {
  shopName?: string;
  shopEmail?: string;
  shopDomain?: string;
  customerFirstName?: string;
};

export async function sendRejectionEmail(
  shop: string,
  toEmail: string,
  opts?: SendRejectionEmailOptions
): Promise<SendRejectionEmailResult> {
  const email = toEmail?.trim();
  if (!email) return { sent: false, reason: "No email address." };

  try {
    const settings = await prisma.appSettings.findUnique({ where: { shop } });
    const cas = (settings as { customerApprovalSettings?: unknown })?.customerApprovalSettings;
    const emailOnReject =
      cas && typeof cas === "object" && !Array.isArray(cas)
        ? (cas as Record<string, unknown>).emailOnReject === true
        : false;
    if (!emailOnReject) return { sent: false, reason: "Rejection email is disabled in Settings." };

    const template = await getEmailTemplateBySlug(shop, "rejection");
    const shopDomain = shop.replace(/\.myshopify\.com$/i, "") || shop;
    const shopUrl = `https://${shop}`;
    const replVars: LiquidReplacementVars = {
      email,
      shopName: opts?.shopName ?? "Store",
      shopEmail: opts?.shopEmail ?? "",
      shopDomain: opts?.shopDomain ?? shopDomain,
      shopUrl,
      customerFirstName: opts?.customerFirstName ?? "Customer",
      customerEmail: email,
      currentYear: String(new Date().getFullYear()),
    };
    const subject = replaceLiquidPlaceholders(template?.subject?.trim() || DEFAULT_REJECT_SUBJECT, replVars);
    let body = template?.bodyHtml?.trim() || template?.bodyText?.trim() || DEFAULT_REJECT_BODY;
    body = replaceLiquidPlaceholders(body, replVars);
    const bodyHtml = body.includes("<") ? body : body.split("\n").map((line) => (line.trim() ? `<p style="margin:0 0 8px">${escapeHtml(line)}</p>` : "<br/>")).join("");

    const o = cas && typeof cas === "object" && !Array.isArray(cas) ? (cas as Record<string, unknown>) : {};
    let footerText = (o.rejectEmailFooterText as string | null | undefined)?.trim() ?? "";
    footerText = replaceLiquidPlaceholders(footerText, replVars);
    const rawLogoUrl = o.rejectEmailLogoUrl as string | null | undefined;
    const logoSizeNum = o.rejectEmailLogoSize != null ? Number(o.rejectEmailLogoSize) : 200;
    const maxLogoW = Number.isFinite(logoSizeNum) && logoSizeNum >= 80 && logoSizeNum <= 400 ? logoSizeNum : 400;
    const logoUrlForEmail = await resolveLogoUrlForEmail(rawLogoUrl, maxLogoW);
    const html = buildRejectionEmailHtml(bodyHtml, {
      logoUrl: logoUrlForEmail || rawLogoUrl || undefined,
      logoSize: o.rejectEmailLogoSize as string | number | null | undefined,
      headerTitle: o.rejectEmailHeaderTitle as string | null | undefined,
      headerTitleSize: o.rejectEmailHeaderTitleSize as string | number | null | undefined,
      headerTitleColor: o.rejectEmailHeaderTitleColor as string | null | undefined,
      headerBgColor: o.rejectEmailHeaderBgColor as string | null | undefined,
      logoAlign: (o.rejectEmailLogoAlign === "center" || o.rejectEmailLogoAlign === "right") ? o.rejectEmailLogoAlign : "left",
      buttonText: o.rejectEmailButtonText as string | null | undefined,
      buttonUrl: (() => {
        const raw = (o.rejectEmailButtonUrl as string | null | undefined)?.trim();
        return raw ? replaceLiquidPlaceholders(raw, replVars) : undefined;
      })(),
      buttonColor: o.rejectEmailButtonColor as string | null | undefined,
      buttonTextColor: o.rejectEmailButtonTextColor as string | null | undefined,
      buttonAlign: (o.rejectEmailButtonAlign === "center" || o.rejectEmailButtonAlign === "right") ? o.rejectEmailButtonAlign : "left",
      footerText: footerText || undefined,
      showPoweredBy: (o.rejectEmailShowPoweredBy as boolean | undefined) === true,
      appName: APP_DISPLAY_NAME,
    });

    const result = await sendMailViaSmtp(shop, {
      to: email,
      subject,
      html,
    });

    if (result.success) {
      console.log(`[Rejection Email] Sent to ${email} via SMTP`);
      return { sent: true };
    }
    return { sent: false, reason: result.error ?? "Send failed" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Rejection Email] Error:", err);
    return { sent: false, reason: msg };
  }
}
