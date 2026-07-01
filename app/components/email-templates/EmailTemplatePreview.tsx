import { Box } from "@shopify/polaris";
import { replaceLiquidPlaceholders } from "../../lib/liquid-placeholders";
import { APP_DISPLAY_NAME, APP_URL } from "../../lib/app-constants";
import {
  bodyHtmlFromPlain,
  buildEmailPreviewLiquidVars,
  isValidHexColor,
  normalizeEmailAlign,
  sanitizeEmailPreviewHtml,
  type EmailAlign,
} from "../../lib/email-template-ui";

export type EmailTemplatePreviewData = {
  logoUrl: string;
  logoSize: string;
  logoAlign: EmailAlign;
  headerTitle: string;
  headerTitleSize: string;
  headerTitleColor: string;
  headerBgColor: string;
  body: string;
  defaultBody: string;
  buttonText: string;
  buttonUrl: string;
  buttonColor: string;
  buttonTextColor: string;
  buttonAlign: EmailAlign;
  footerText: string;
  showPoweredBy: boolean;
  allowActivationUrlFallback?: boolean;
};

type ShopPreviewContext = {
  storeName: string;
  storeEmail: string;
  storeDomain: string;
};

type Props = {
  data: EmailTemplatePreviewData;
  shop: ShopPreviewContext;
  variant?: "sidebar" | "modal";
};

function previewHtml(raw: string, shop: ShopPreviewContext, includeActivation: boolean): string {
  const previewVars = buildEmailPreviewLiquidVars({
    shopDisplayName: shop.storeName,
    includeActivation,
  });
  const replaced = replaceLiquidPlaceholders(raw, previewVars);
  const html = replaced.includes("<") ? replaced : bodyHtmlFromPlain(replaced);
  return sanitizeEmailPreviewHtml(html, shop.storeDomain);
}

function previewButtonColors(data: EmailTemplatePreviewData, isApproval: boolean) {
  const bg = isValidHexColor((data.buttonColor ?? "").trim())
    ? (data.buttonColor ?? "").trim()
    : isApproval
      ? "#2563eb"
      : "#dc2626";
  const fg = isValidHexColor((data.buttonTextColor ?? "").trim()) ? (data.buttonTextColor ?? "").trim() : "#ffffff";
  return { bg, fg };
}

export function EmailTemplatePreview({ data, shop, variant = "sidebar" }: Props) {
  const align = normalizeEmailAlign(data.logoAlign);
  const btnAlign = normalizeEmailAlign(data.buttonAlign);
  const headerBg = (data.headerBgColor ?? "").trim();
  const hasHeaderBg = isValidHexColor(headerBg);
  const titleColor = isValidHexColor((data.headerTitleColor ?? "").trim())
    ? (data.headerTitleColor ?? "").trim()
    : "#0f172a";
  const logoPx = Math.min(400, Math.max(80, Number(data.logoSize) || 200)) || 200;
  const isApproval = Boolean(data.allowActivationUrlFallback);

  const bodyHtml = previewHtml(data.body || data.defaultBody, shop, isApproval);

  const showHeader = Boolean((data.logoUrl ?? "").trim() || (data.headerTitle ?? "").trim());
  const showButton =
    Boolean(data.buttonText.trim()) &&
    (Boolean(data.buttonUrl.trim()) ||
      (isApproval && (data.body ?? "").includes("activation_url")));

  const { bg: btnBg, fg: btnFg } = previewButtonColors(data, isApproval);

  const emailCard = (
    <div className="email-preview-modern-card">
      {showHeader ? (
        <div
          className="email-preview-modern-header"
          style={{
            textAlign: align,
            ...(hasHeaderBg ? { backgroundColor: headerBg } : {}),
          }}
        >
          {(data.logoUrl ?? "").trim() ? (
            <div className="email-preview-modern-logo" style={{ textAlign: align }}>
              <img
                src={data.logoUrl.trim()}
                alt="Logo"
                style={{
                  maxWidth: logoPx,
                  width: "100%",
                  height: "auto",
                  display: "block",
                  ...(align === "center"
                    ? { marginLeft: "auto", marginRight: "auto" }
                    : align === "right"
                      ? { marginLeft: "auto", marginRight: 0 }
                      : {}),
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          ) : null}
          {(data.headerTitle ?? "").trim() ? (
            <h1
              className="email-preview-modern-title"
              style={{
                fontSize: `${Number(data.headerTitleSize) || 22}px`,
                color: titleColor,
                textAlign: align,
              }}
            >
              {data.headerTitle}
            </h1>
          ) : null}
        </div>
      ) : null}

      <div className="email-preview-modern-body">
        <div className="settings-email-preview-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />

        {showButton ? (
          <div
            className="email-preview-modern-cta"
            style={{ textAlign: btnAlign === "center" ? "center" : btnAlign === "right" ? "right" : "left" }}
          >
            <span className="email-preview-modern-btn" style={{ background: btnBg, color: btnFg }}>
              {data.buttonText}
            </span>
          </div>
        ) : null}

        {(data.footerText ?? "").trim() ? (
          <div className="email-preview-modern-footer">
            <span
              dangerouslySetInnerHTML={{
                __html: previewHtml(data.footerText, shop, isApproval),
              }}
            />
          </div>
        ) : null}

        {data.showPoweredBy ? (
          <div className="email-preview-modern-powered">
            Powered by{" "}
            <a href={APP_URL} target="_blank" rel="noopener noreferrer">
              {APP_DISPLAY_NAME}
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );

  const framed = (
    <div className="email-preview-modern-frame">
      <div className="email-preview-modern-inbox">{emailCard}</div>
    </div>
  );

  if (variant === "modal") {
    return (
      <Box padding="300">
        <Box maxWidth="560px" marginInline="auto">
          {framed}
        </Box>
      </Box>
    );
  }

  return framed;
}
