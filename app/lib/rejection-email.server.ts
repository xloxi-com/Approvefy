/**
 * Send rejection email via Custom SMTP using the "rejection" email template.
 * Builds full HTML with optional logo, header, body, button, footer from Settings.
 * SVG logos are converted to PNG for email client compatibility.
 */

import prisma from "../db.server";
import { getEmailTemplateBySlug } from "../models/email-template.server";
import { getSmtpRowForSend, sendMailViaSmtp } from "./smtp.server";
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
  const titleColorCss = titleColor && HEX_COLOR.test(titleColor) ? titleColor : "#0f172a";
  const hasTitle = !!(opts.headerTitle && opts.headerTitle.trim());
  if (opts.logoUrl && opts.logoUrl.trim()) {
    const marginBottom = hasTitle ? 16 : 0;
    headerParts.push(
      `<div style="margin-bottom:${marginBottom}px;${logoWrapperAlignCss}display:block;max-width:${logoPx}"><img src="${opts.logoUrl.trim()}" alt="Logo" style="max-width:100%;width:100%;height:auto;display:block;border-radius:8px" /></div>`
    );
  }
  if (hasTitle && opts.headerTitle) {
    headerParts.push(
      `<h1 style="margin:0;font-size:${headerPx};line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:${titleColorCss}">${escapeHtml(opts.headerTitle.trim())}</h1>`
    );
  }
  let headerHtml = "";
  if (headerParts.length) {
    const headerStyle = [
      "padding:24px 28px",
      "display:flex",
      "align-items:center",
      "min-height:56px",
      "box-sizing:border-box",
      hasHeaderBg ? `background-color:${headerBg}` : "background:linear-gradient(180deg,#f8fafc 0%,#ffffff 100%)",
      "border-bottom:1px solid #e2e8f0",
    ].join(";");
    const wrapperStyle = `text-align:${align};width:100%`;
    headerHtml = `<div style="${headerStyle}"><div style="${wrapperStyle}">${headerParts.join("")}</div></div>`;
  }

  const buttonBg = opts.buttonColor?.trim();
  const buttonBgCss = buttonBg && HEX_COLOR.test(buttonBg) ? buttonBg : "#dc2626";
  const buttonFg = opts.buttonTextColor?.trim();
  const buttonFgCss = buttonFg && HEX_COLOR.test(buttonFg) ? buttonFg : "#fff";
  const buttonAlign = opts.buttonAlign === "center" || opts.buttonAlign === "right" ? opts.buttonAlign : "left";
  let buttonHtml = "";
  if (opts.buttonText && opts.buttonText.trim() && opts.buttonUrl && opts.buttonUrl.trim()) {
    buttonHtml = `<div style="margin-top:28px;width:100%;text-align:${buttonAlign}"><a href="${opts.buttonUrl.trim()}" style="display:inline-block;padding:14px 28px;background:${buttonBgCss};color:${buttonFgCss};text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;letter-spacing:0.01em;box-shadow:0 1px 2px rgba(15,23,42,0.06)">${escapeHtml(opts.buttonText.trim())}</a></div>`;
  }

  let footerHtml = "";
  if (opts.footerText && opts.footerText.trim()) {
    const footer = opts.footerText.trim();
    if (footer.includes("<")) {
      footerHtml = `<div style="margin-top:28px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b">${footer}</div>`;
    } else {
      footerHtml = `<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b">${escapeHtml(footer)}</p>`;
    }
  }
  if (opts.showPoweredBy && opts.appName && opts.appName.trim()) {
    footerHtml += `<p style="margin-top:16px;font-size:11px;color:#94a3b8">Powered by <a href="${escapeHtml(APP_URL)}" style="color:#94a3b8;text-decoration:underline">${escapeHtml(opts.appName.trim())}</a></p>`;
  }

  const contentInner = `${bodyHtml}${buttonHtml}${footerHtml}`;
  const font =
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";
  return `<div style="font-family:${font};background:#f1f5f9;padding:32px 16px;margin:0;">
  <div style="max-width:600px;margin:0 auto;">
    <div style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 6px -1px rgba(15,23,42,0.06),0 12px 32px -8px rgba(15,23,42,0.1);">
      ${headerHtml}
      <div style="padding:28px 32px 36px;color:#334155;font-size:15px;line-height:1.65;">
        ${contentInner}
      </div>
    </div>
  </div>
</div>`;
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
    // Three independent reads (settings flag, template, SMTP row) — fan out in parallel.
    const [settings, template, smtpRow] = await Promise.all([
      prisma.appSettings.findUnique({
        where: { shop },
        select: { customerApprovalSettings: true },
      }),
      getEmailTemplateBySlug(shop, "rejection"),
      getSmtpRowForSend(shop),
    ]);
    const cas = (settings as { customerApprovalSettings?: unknown })?.customerApprovalSettings;
    const emailOnReject =
      cas && typeof cas === "object" && !Array.isArray(cas)
        ? (cas as Record<string, unknown>).emailOnReject === true
        : false;
    if (!emailOnReject) return { sent: false, reason: "Rejection email is disabled in Settings." };
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
    const bodyHtml = body.includes("<") ? body : body.split("\n").map((line) => (line.trim() ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#334155">${escapeHtml(line)}</p>` : "<br/>")).join("");

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
      smtpRow,
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
