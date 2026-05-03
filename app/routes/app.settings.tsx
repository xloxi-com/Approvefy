import { useState, useEffect, useMemo, useCallback, useRef, useId, lazy, Suspense, type FormEvent } from "react";
import { flushSync } from "react-dom";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import type { Prisma } from "@prisma/client";
import { Await, useLoaderData, useSubmit, useNavigation, useActionData, useNavigate } from "react-router";
import {
    Page,
    Card,
    Select,
    Banner,
    Toast,
    Tabs,
    TextField,
    BlockStack,
    InlineStack,
    Box,
    Text,
    Popover,
    OptionList,
    Button,
    EmptySearchResult,
    Icon,
    ChoiceList,
    Divider,
    Checkbox,
    RangeSlider,
    Collapsible,
    Modal,
    ColorPicker,
    hexToRgb,
    rgbToHsb,
    hsbToHex,
} from "@shopify/polaris";
import { SectionCard } from "../components/SectionCard";
import {
    SearchIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    StoreIcon,
    LanguageIcon,
    CheckCircleIcon,
    EmailIcon,
    SendIcon,
    ThemeTemplateIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getSmtpSettings, upsertSmtpSettings, verifySmtpCredentials } from "../lib/smtp.server";
import { getEmailTemplateBySlug, upsertRejectionTemplate, upsertApprovalTemplate } from "../models/email-template.server";
import { CORE_LANGUAGES, normalizeLangCode, coreLanguageName, type LanguageOption as CoreLanguageOption } from "../lib/languages";
import { normalizeThemeSettings, THEME_DEFAULTS, type ThemeSettings } from "../lib/theme-settings";
import { getAppearanceTemplateId } from "../lib/appearance-templates";
import type { RichTextEditorProps } from "../components/RichTextEditor";
import { getShopDisplayName, parseShopFromGraphqlResponse, replaceLiquidPlaceholders } from "../lib/liquid-placeholders";
import { APP_DISPLAY_NAME, APP_URL } from "../lib/app-constants";
import {
    BUILTIN_EN_LOGGED_IN_BLOCKED_MESSAGE,
    getSettingsStoreUiStrings,
} from "../lib/settings-ui-i18n";
import "../styles/settings.css";
import { REJECTION_EMAIL_PRESETS, getRejectionPresetById } from "../lib/rejection-email-presets";
import { APPROVAL_EMAIL_PRESETS, getApprovalPresetById } from "../lib/approval-email-presets";
import { Skeleton } from "@/components/ui/skeleton";

const LazyRichTextEditor = lazy(() =>
    import("../components/RichTextEditor").then((m) => ({ default: m.RichTextEditor })),
);

function DeferredRichTextEditor(props: RichTextEditorProps) {
    const min = props.minHeight ?? 120;
    return (
        <Suspense
            fallback={
                <Box paddingBlockStart="200" minHeight={`${min}px`}>
                    <Skeleton className="h-24 w-full rounded-md" />
                </Box>
            }
        >
            <LazyRichTextEditor {...props} />
        </Suspense>
    );
}

/** Normalize for preset matching: strip HTML tags (e.g. <p>...</p>), decode entities, collapse whitespace to plain text. */
function normalizeForPresetMatch(s: string): string {
    if (s == null || typeof s !== "string") return "";
    let t = s.trim();
    t = t.replace(/<[^>]+>/g, " ");
    t = t.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"');
    return t.replace(/\s+/g, " ").trim();
}

/** Find rejection preset id from body and optionally subject (so reload shows correct template name). Avoid matching short custom text to first long preset. */
function inferRejectionPresetId(body: string, subject?: string): string {
    const bodyNorm = normalizeForPresetMatch(body);
    const subjectNorm = subject != null ? normalizeForPresetMatch(subject) : "";
    for (const p of REJECTION_EMAIL_PRESETS) {
        const presetBody = normalizeForPresetMatch(p.bodyHtml ?? "");
        const presetSubj = normalizeForPresetMatch(p.subject ?? "");
        const bodyMatch =
            bodyNorm &&
            presetBody &&
            (bodyNorm === presetBody ||
                bodyNorm.includes(presetBody) ||
                (presetBody.includes(bodyNorm) && bodyNorm.length >= 60)); // avoid short custom text matching long preset
        const subjectMatch = subjectNorm && presetSubj && (subjectNorm === presetSubj || subjectNorm.includes(presetSubj) || presetSubj.includes(subjectNorm));
        if (bodyMatch || subjectMatch) return p.id;
    }
    return "";
}

/** Find approval preset id from body and optionally subject. Avoid matching short custom text to first long preset. */
function inferApprovalPresetId(body: string, subject?: string): string {
    const bodyNorm = normalizeForPresetMatch(body);
    const subjectNorm = subject != null ? normalizeForPresetMatch(subject) : "";
    for (const p of APPROVAL_EMAIL_PRESETS) {
        const presetBody = normalizeForPresetMatch(p.bodyHtml ?? "");
        const presetSubj = normalizeForPresetMatch(p.subject ?? "");
        const bodyMatch =
            bodyNorm &&
            presetBody &&
            (bodyNorm === presetBody ||
                bodyNorm.includes(presetBody) ||
                (presetBody.includes(bodyNorm) && bodyNorm.length >= 60));
        const subjectMatch = subjectNorm && presetSubj && (subjectNorm === presetSubj || subjectNorm.includes(presetSubj) || presetSubj.includes(subjectNorm));
        if (bodyMatch || subjectMatch) return p.id;
    }
    return "";
}

type LanguageOption = CoreLanguageOption;
const CORE_CODE_SET = new Set(CORE_LANGUAGES.map((l) => l.code));

function sanitizeLanguageOptions(options: Array<{ code?: string; name?: string }>): LanguageOption[] {
    const out: LanguageOption[] = [];
    for (const o of options) {
        const code = normalizeLangCode(o?.code ?? o?.name);
        if (!code) continue;
        const name = String(o?.name ?? coreLanguageName(code) ?? o?.code ?? code).trim() || code;
        out.push({ code, name });
    }
    // de-dupe by code preserving first
    const seen = new Set<string>();
    return out.filter((l) => {
        const c = normalizeLangCode(l.code);
        if (!c || seen.has(c)) return false;
        seen.add(c);
        return true;
    });
}

function ensureCoreLanguagesEnabled(options: LanguageOption[]): LanguageOption[] {
    const byCode = new Map(options.map((l) => [normalizeLangCode(l.code), l]));
    for (const core of CORE_LANGUAGES) {
        if (!byCode.has(core.code)) byCode.set(core.code, core);
    }
    return Array.from(byCode.values());
}

function sanitizeFormTranslations(input: unknown): Record<string, Record<string, string>> {
    const out: Record<string, Record<string, string>> = {};
    if (!input || typeof input !== "object" || Array.isArray(input)) return out;
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
        const code = normalizeLangCode(k);
        if (!code || !v || typeof v !== "object" || Array.isArray(v)) continue;
        out[code] = v as Record<string, string>;
    }
    // Ensure core language keys exist in JSON (even if empty)
    for (const core of CORE_LANGUAGES) {
        if (!out[core.code]) out[core.code] = {};
    }
    return out;
}

export type CustomerApprovalSettings = {
    approvalMode: "manual" | "auto";
    approvedTag: string;
    afterSubmit: "redirect" | "message";
    redirectUrl: string;
    successMessage: string;
    /** Centered pending-approval card on register (logged-in pending, etc.). Plain text; empty = translation default. */
    pendingRegistrationScreenTitle: string;
    pendingRegistrationScreenMessage: string;
    /** Storefront registration form appearance template id (applied when Custom CSS is empty). */
    appearanceTemplateId: string;
    emailOnReject: boolean;
    /** Preset id from dropdown; "" = Custom (edit below). Persisted so refresh shows correct selection. */
    rejectionEmailPresetId: string;
    rejectEmailSubject: string;
    rejectEmailBody: string;
    rejectEmailLogoUrl: string;
    rejectEmailLogoSize: string;
    rejectEmailHeaderTitle: string;
    rejectEmailHeaderTitleSize: string;
    rejectEmailHeaderTitleColor: string;
    rejectEmailHeaderBgColor: string;
    rejectEmailLogoAlign: "left" | "center" | "right";
    rejectEmailButtonText: string;
    rejectEmailButtonUrl: string;
    rejectEmailButtonColor: string;
    rejectEmailButtonTextColor: string;
    rejectEmailButtonAlign: "left" | "center" | "right";
    rejectEmailFooterText: string;
    rejectEmailShowPoweredBy: boolean;
    emailOnApprove: boolean;
    approveEmailSubject: string;
    approveEmailBody: string;
    approveEmailLogoUrl: string;
    approveEmailLogoSize: string;
    approveEmailHeaderTitle: string;
    approveEmailHeaderTitleSize: string;
    approveEmailHeaderTitleColor: string;
    approveEmailHeaderBgColor: string;
    approveEmailLogoAlign: "left" | "center" | "right";
    approveEmailButtonText: string;
    approveEmailButtonUrl: string;
    approveEmailButtonColor: string;
    approveEmailButtonTextColor: string;
    approveEmailButtonAlign: "left" | "center" | "right";
    approveEmailFooterText: string;
    approveEmailShowPoweredBy: boolean;
    /** Preset id from dropdown; "" = Custom (edit below). Persisted so refresh shows correct selection. */
    approvalEmailPresetId: string;
    /** When true, guests clicking checkout / Buy it now are redirected to `guestCheckoutRedirectUrl` instead. */
    redirectGuestsFromCheckout: boolean;
    /** Storefront redirect for guests (same source as admin; loaded via app proxy config). */
    guestCheckoutRedirectUrl: string;
    /** Logged-in customers without `approvedTag` see `loggedInCheckoutBlockedMessage` then go to `guestCheckoutRedirectUrl`. */
    blockLoggedInWithoutApprovedTag: boolean;
    /** Alert shown before redirect when blocking logged-in customers without the approved tag (Buy it now / checkout). */
    loggedInCheckoutBlockedMessage: string;
};

const DEFAULT_REJECT_SUBJECT = "Your account registration update";
const DEFAULT_REJECT_BODY = "Unfortunately, your registration was not approved at this time. If you have questions, please contact us.";
const DEFAULT_APPROVE_SUBJECT = "Your account has been approved";
const DEFAULT_APPROVE_BODY =
  "Congratulations! Your customer account has been approved. Use the link below to log in to the store (Shopify may ask you to finish activating your account the first time).";

/** Logo URL must be PNG, JPG or WebP only. SVG is not allowed. */
function isSvgLogoUrl(url: string): boolean {
  const u = url?.trim();
  if (!u) return false;
  return /\.svg(\?|#|$)/i.test(u);
}
function isAllowedLogoUrl(url: string): boolean {
  const u = url?.trim();
  if (!u) return true;
  return /\.(png|jpe?g|webp)(\?|#|$)/i.test(u);
}

const CUSTOMER_APPROVAL_DEFAULTS: CustomerApprovalSettings = {
    approvalMode: "manual",
    approvedTag: "status:approved",
    afterSubmit: "message",
    redirectUrl: "",
    successMessage: "Registration successful! Your account is pending approval. You will receive an email once approved.",
    pendingRegistrationScreenTitle: "Your registration has been submitted successfully.",
    pendingRegistrationScreenMessage:
        "Your account is currently pending approval. Please check your email for updates and further instructions.",
    appearanceTemplateId: "clean",
    emailOnReject: true,
    rejectionEmailPresetId: "",
    rejectEmailSubject: DEFAULT_REJECT_SUBJECT,
    rejectEmailBody: DEFAULT_REJECT_BODY,
    rejectEmailLogoUrl: "",
    rejectEmailLogoSize: "200",
    rejectEmailHeaderTitle: "",
    rejectEmailHeaderTitleSize: "24",
    rejectEmailHeaderTitleColor: "",
    rejectEmailHeaderBgColor: "",
    rejectEmailLogoAlign: "left",
    rejectEmailButtonText: "",
    rejectEmailButtonUrl: "",
    rejectEmailButtonColor: "",
    rejectEmailButtonTextColor: "",
    rejectEmailButtonAlign: "left",
    rejectEmailFooterText: "",
    rejectEmailShowPoweredBy: true,
    emailOnApprove: false,
    approveEmailSubject: DEFAULT_APPROVE_SUBJECT,
    approveEmailBody: DEFAULT_APPROVE_BODY,
    approveEmailLogoUrl: "",
    approveEmailLogoSize: "200",
    approveEmailHeaderTitle: "",
    approveEmailHeaderTitleSize: "24",
    approveEmailHeaderTitleColor: "",
    approveEmailHeaderBgColor: "",
    approveEmailLogoAlign: "left",
    approveEmailButtonText: "Login",
    approveEmailButtonUrl: "",
    approveEmailButtonColor: "",
    approveEmailButtonTextColor: "",
    approveEmailButtonAlign: "left",
    approveEmailFooterText: "",
    approveEmailShowPoweredBy: true,
    approvalEmailPresetId: "",
    redirectGuestsFromCheckout: false,
    guestCheckoutRedirectUrl: "",
    blockLoggedInWithoutApprovedTag: false,
    loggedInCheckoutBlockedMessage: BUILTIN_EN_LOGGED_IN_BLOCKED_MESSAGE,
};

type ShopMetaCacheEntry = {
    storeName: string;
    storeEmail: string;
    storeLogoUrl: string | null;
    shopCountryCode: string | null;
    expiresAt: number;
};

const SHOP_META_TTL_MS = 120_000;
const shopMetaCache = new Map<string, ShopMetaCacheEntry>();

function getCachedShopMeta(shop: string): ShopMetaCacheEntry | null {
    const entry = shopMetaCache.get(shop);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
        shopMetaCache.delete(shop);
        return null;
    }
    return entry;
}

function setCachedShopMeta(shop: string, value: Omit<ShopMetaCacheEntry, "expiresAt">) {
    shopMetaCache.set(shop, { ...value, expiresAt: Date.now() + SHOP_META_TTL_MS });
}

/** Storefront / email preview labels from Admin API — deferred so DB-backed settings stream first. */
type ShopMetaForClient = {
    storeName: string;
    storeEmail: string;
    storeLogoUrl: string | null;
};

async function fetchShopMetaFromAdmin(
    admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
    shop: string,
    settings: Awaited<ReturnType<typeof prisma.appSettings.findUnique>>,
): Promise<ShopMetaForClient> {
    let storeName = "Store";
    let storeEmail = "";
    let storeLogoUrl: string | null = null;
    let shopCountryCode: string | null = null;
    if (!admin) {
        return { storeName, storeEmail, storeLogoUrl };
    }
    try {
        const [shopInfoRes, brandRes, shopCountryRes] = await Promise.all([
            admin.graphql(`#graphql query getShopInfo { shop { name contactEmail } }`),
            admin.graphql(`#graphql query getShopBrandLogo { shop { brand { logo { image { url } } } } }`),
            admin.graphql(`#graphql query getShopCountry { shop { billingAddress { countryCodeV2 } } }`),
        ]);
        try {
            const parsed = await parseShopFromGraphqlResponse(shopInfoRes);
            storeName = getShopDisplayName(shop, parsed.shopName);
            if (parsed.shopEmail) storeEmail = parsed.shopEmail;
        } catch (e) {
            console.warn("[Settings] Shop info fetch failed:", e instanceof Error ? e.message : String(e));
            storeName = getShopDisplayName(shop, "Store");
        }
        try {
            const brandData = (await brandRes.json()) as {
                errors?: unknown;
                data?: { shop?: { brand?: { logo?: { image?: { url?: string } } } } } };
            if (!brandData.errors && brandData?.data?.shop?.brand?.logo?.image?.url) {
                const url = brandData.data.shop.brand.logo.image.url;
                if (typeof url === "string" && url.trim()) storeLogoUrl = url.trim();
            }
        } catch {
            // ignore — brand may be unavailable on some API versions
        }
        try {
            const shopData = (await shopCountryRes.json()) as {
                data?: { shop?: { billingAddress?: { countryCodeV2?: string } } };
            };
            const code = shopData?.data?.shop?.billingAddress?.countryCodeV2;
            if (code && typeof code === "string") shopCountryCode = code.toUpperCase();
        } catch {
            /* ignore */
        }
        setCachedShopMeta(shop, {
            storeName,
            storeEmail,
            storeLogoUrl,
            shopCountryCode,
        });
    } catch (e) {
        console.warn("[Settings] Shop GraphQL batch failed:", e instanceof Error ? e.message : String(e));
    }
    if (shopCountryCode && settings) {
        prisma.appSettings.update({ where: { shop }, data: { shopCountryCode } }).catch(() => {});
    } else if (shopCountryCode) {
        prisma.appSettings
            .upsert({
                where: { shop },
                create: { shop, defaultLanguage: "en", shopCountryCode },
                update: { shopCountryCode },
            })
            .catch(() => {});
    }
    return { storeName, storeEmail, storeLogoUrl };
}

// Removed Shopify locales fetch + auto-translate API usage. Manual translations only.

/** Loader returns only the last-saved state from DB. Reset-to-defaults and other UI changes are not persisted until the user clicks Save; refresh or navigate-away shows this saved state. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const [{ DEFAULT_TRANSLATIONS_EN, DEFAULT_TRANSLATIONS_BY_LANG, TRANSLATION_KEYS }, { admin, session }] = await Promise.all([
        import("../lib/translations.server"),
        authenticate.admin(request),
    ]);
    const shop = session?.shop || "";

    const shopMetaDefault: ShopMetaForClient = { storeName: "Store", storeEmail: "", storeLogoUrl: null };
    let shopMetaPromise: Promise<ShopMetaForClient> = Promise.resolve(shopMetaDefault);

    let defaultLanguage = "en";
    let languageOptions: LanguageOption[] = [...CORE_LANGUAGES];

    let formTranslations: Record<string, Record<string, string>> = {};
    let customerApprovalSettings: CustomerApprovalSettings = CUSTOMER_APPROVAL_DEFAULTS;
    let smtpSettings: Awaited<ReturnType<typeof getSmtpSettings>> = null;
    let appSettingsUpdatedAt: string | null = null;
    if (shop) {
        let settings: Awaited<ReturnType<typeof prisma.appSettings.findUnique>> = null;
        let smtp: Awaited<ReturnType<typeof getSmtpSettings>> = null;
        let rejectionTemplate: Awaited<ReturnType<typeof getEmailTemplateBySlug>> = null;
        let approvalTemplate: Awaited<ReturnType<typeof getEmailTemplateBySlug>> = null;
        const cachedShopMeta = getCachedShopMeta(shop);
        try {
            const [settingsResult, smtpResult, rejectionTemplateResult, approvalTemplateResult] = await Promise.all([
                prisma.appSettings.findUnique({ where: { shop } }),
                getSmtpSettings(shop),
                getEmailTemplateBySlug(shop, "rejection"),
                getEmailTemplateBySlug(shop, "approval"),
            ]);
            settings = settingsResult;
            smtp = smtpResult;
            rejectionTemplate = rejectionTemplateResult;
            approvalTemplate = approvalTemplateResult;
            smtpSettings = smtp;
            if (cachedShopMeta) {
                shopMetaPromise = Promise.resolve({
                    storeName: cachedShopMeta.storeName,
                    storeEmail: cachedShopMeta.storeEmail,
                    storeLogoUrl: cachedShopMeta.storeLogoUrl,
                });
                const shopCountryCode = cachedShopMeta.shopCountryCode;
                if (shopCountryCode && settings) {
                    prisma.appSettings.update({ where: { shop }, data: { shopCountryCode } }).catch(() => {});
                } else if (shopCountryCode) {
                    prisma.appSettings
                        .upsert({
                            where: { shop },
                            create: { shop, defaultLanguage: "en", shopCountryCode },
                            update: { shopCountryCode },
                        })
                        .catch(() => {});
                }
            } else {
                shopMetaPromise = fetchShopMetaFromAdmin(admin, shop, settings);
            }
        } catch (dbErr) {
            console.warn("Settings load failed:", dbErr);
        }
        if (settings) {
                appSettingsUpdatedAt = settings.updatedAt.toISOString();
                defaultLanguage = (settings.defaultLanguage as string) || "en";
                const opts = settings.languageOptions as unknown;
                if (Array.isArray(opts) && opts.length > 0) {
                    languageOptions = sanitizeLanguageOptions(opts as Array<{ code?: string; name?: string }>);
                    if (languageOptions.length === 0) languageOptions = [{ code: "en", name: "English" }];
                }
                const ft = settings.formTranslations as unknown;
                if (ft && typeof ft === "object" && !Array.isArray(ft)) {
                    formTranslations = sanitizeFormTranslations(ft);
                }
                let cas = (settings as { customerApprovalSettings?: unknown }).customerApprovalSettings;
                if (typeof cas === "string") {
                    try {
                        cas = JSON.parse(cas) as Record<string, unknown>;
                    } catch {
                        cas = undefined;
                    }
                }
                if (cas && typeof cas === "object" && !Array.isArray(cas)) {
                    const o = cas as Record<string, unknown>;
                    customerApprovalSettings = {
                        approvalMode: (o.approvalMode === "auto" ? "auto" : "manual") as "manual" | "auto",
                        approvedTag:
                            typeof o.approvedTag === "string" && o.approvedTag.trim()
                                ? o.approvedTag.trim()
                                : CUSTOMER_APPROVAL_DEFAULTS.approvedTag,
                        afterSubmit: (o.afterSubmit === "redirect" ? "redirect" : "message") as "redirect" | "message",
                        redirectUrl: typeof o.redirectUrl === "string" ? o.redirectUrl : CUSTOMER_APPROVAL_DEFAULTS.redirectUrl,
                        successMessage: typeof o.successMessage === "string" ? o.successMessage : CUSTOMER_APPROVAL_DEFAULTS.successMessage,
                        pendingRegistrationScreenTitle:
                            typeof o.pendingRegistrationScreenTitle === "string"
                                ? o.pendingRegistrationScreenTitle.trim()
                                : CUSTOMER_APPROVAL_DEFAULTS.pendingRegistrationScreenTitle,
                        pendingRegistrationScreenMessage:
                            typeof o.pendingRegistrationScreenMessage === "string"
                                ? o.pendingRegistrationScreenMessage.trim()
                                : CUSTOMER_APPROVAL_DEFAULTS.pendingRegistrationScreenMessage,
                        appearanceTemplateId: getAppearanceTemplateId(o.appearanceTemplateId),
                        redirectGuestsFromCheckout: o.redirectGuestsFromCheckout === true,
                        guestCheckoutRedirectUrl:
                            typeof o.guestCheckoutRedirectUrl === "string" ? o.guestCheckoutRedirectUrl : CUSTOMER_APPROVAL_DEFAULTS.guestCheckoutRedirectUrl,
                        blockLoggedInWithoutApprovedTag: o.blockLoggedInWithoutApprovedTag === true,
                        loggedInCheckoutBlockedMessage:
                            typeof o.loggedInCheckoutBlockedMessage === "string" && o.loggedInCheckoutBlockedMessage.trim()
                                ? o.loggedInCheckoutBlockedMessage.trim()
                                : CUSTOMER_APPROVAL_DEFAULTS.loggedInCheckoutBlockedMessage,
                        emailOnReject: o.emailOnReject === true,
                        rejectionEmailPresetId: typeof o.rejectionEmailPresetId === "string" ? o.rejectionEmailPresetId.trim() : "",
                        // Prefer email_template table for subject/body so reload always shows last-saved template
                        rejectEmailSubject: (rejectionTemplate?.subject?.trim() ?? "") !== ""
                            ? (rejectionTemplate?.subject ?? DEFAULT_REJECT_SUBJECT)
                            : (typeof o.rejectEmailSubject === "string" ? o.rejectEmailSubject : DEFAULT_REJECT_SUBJECT),
                        rejectEmailBody: ((rejectionTemplate?.bodyHtml ?? rejectionTemplate?.bodyText)?.trim() ?? "") !== ""
                            ? (rejectionTemplate?.bodyHtml ?? rejectionTemplate?.bodyText ?? DEFAULT_REJECT_BODY)
                            : (typeof o.rejectEmailBody === "string" ? o.rejectEmailBody : (rejectionTemplate?.bodyHtml ?? rejectionTemplate?.bodyText ?? DEFAULT_REJECT_BODY)),
                        rejectEmailLogoUrl: typeof o.rejectEmailLogoUrl === "string" ? o.rejectEmailLogoUrl : "",
                        rejectEmailLogoSize: typeof o.rejectEmailLogoSize === "string" && o.rejectEmailLogoSize ? o.rejectEmailLogoSize : "200",
                        rejectEmailHeaderTitle: typeof o.rejectEmailHeaderTitle === "string" ? o.rejectEmailHeaderTitle : "",
                        rejectEmailHeaderTitleSize: typeof o.rejectEmailHeaderTitleSize === "string" && o.rejectEmailHeaderTitleSize ? o.rejectEmailHeaderTitleSize : "24",
                        rejectEmailHeaderTitleColor: typeof o.rejectEmailHeaderTitleColor === "string" ? o.rejectEmailHeaderTitleColor : "",
                        rejectEmailHeaderBgColor: typeof o.rejectEmailHeaderBgColor === "string" ? o.rejectEmailHeaderBgColor : "",
                        rejectEmailLogoAlign: (o.rejectEmailLogoAlign === "center" || o.rejectEmailLogoAlign === "right") ? o.rejectEmailLogoAlign : "left",
                        rejectEmailButtonText: typeof o.rejectEmailButtonText === "string" ? o.rejectEmailButtonText : "",
                        rejectEmailButtonUrl: typeof o.rejectEmailButtonUrl === "string" ? o.rejectEmailButtonUrl : "",
                        rejectEmailButtonColor: typeof o.rejectEmailButtonColor === "string" ? o.rejectEmailButtonColor : "",
                        rejectEmailButtonTextColor: typeof o.rejectEmailButtonTextColor === "string" ? o.rejectEmailButtonTextColor : "",
                        rejectEmailButtonAlign: (o.rejectEmailButtonAlign === "center" || o.rejectEmailButtonAlign === "right") ? o.rejectEmailButtonAlign : "left",
                        rejectEmailFooterText: typeof o.rejectEmailFooterText === "string" ? o.rejectEmailFooterText : "",
                        rejectEmailShowPoweredBy: o.rejectEmailShowPoweredBy !== false,
                        emailOnApprove: o.emailOnApprove === true,
                        approveEmailSubject: (approvalTemplate?.subject?.trim() ?? "") !== ""
                            ? (approvalTemplate?.subject ?? DEFAULT_APPROVE_SUBJECT)
                            : (typeof o.approveEmailSubject === "string" ? o.approveEmailSubject : DEFAULT_APPROVE_SUBJECT),
                        approveEmailBody: ((approvalTemplate?.bodyHtml ?? approvalTemplate?.bodyText)?.trim() ?? "") !== ""
                            ? (approvalTemplate?.bodyHtml ?? approvalTemplate?.bodyText ?? DEFAULT_APPROVE_BODY)
                            : (typeof o.approveEmailBody === "string" ? o.approveEmailBody : (approvalTemplate?.bodyHtml ?? approvalTemplate?.bodyText ?? DEFAULT_APPROVE_BODY)),
                        approveEmailLogoUrl: typeof o.approveEmailLogoUrl === "string" ? o.approveEmailLogoUrl : "",
                        approveEmailLogoSize: typeof o.approveEmailLogoSize === "string" && o.approveEmailLogoSize ? o.approveEmailLogoSize : "200",
                        approveEmailHeaderTitle: typeof o.approveEmailHeaderTitle === "string" ? o.approveEmailHeaderTitle : "",
                        approveEmailHeaderTitleSize: typeof o.approveEmailHeaderTitleSize === "string" && o.approveEmailHeaderTitleSize ? o.approveEmailHeaderTitleSize : "24",
                        approveEmailHeaderTitleColor: typeof o.approveEmailHeaderTitleColor === "string" ? o.approveEmailHeaderTitleColor : "",
                        approveEmailHeaderBgColor: typeof o.approveEmailHeaderBgColor === "string" ? o.approveEmailHeaderBgColor : "",
                        approveEmailLogoAlign: (o.approveEmailLogoAlign === "center" || o.approveEmailLogoAlign === "right") ? o.approveEmailLogoAlign : "left",
                        approveEmailButtonText: typeof o.approveEmailButtonText === "string" ? o.approveEmailButtonText : "",
                        approveEmailButtonUrl: typeof o.approveEmailButtonUrl === "string" ? o.approveEmailButtonUrl : "",
                        approveEmailButtonColor: typeof o.approveEmailButtonColor === "string" ? o.approveEmailButtonColor : "",
                        approveEmailButtonTextColor: typeof o.approveEmailButtonTextColor === "string" ? o.approveEmailButtonTextColor : "",
                        approveEmailButtonAlign: (o.approveEmailButtonAlign === "center" || o.approveEmailButtonAlign === "right") ? o.approveEmailButtonAlign : "left",
                        approveEmailFooterText: typeof o.approveEmailFooterText === "string" ? o.approveEmailFooterText : "",
                        approveEmailShowPoweredBy: o.approveEmailShowPoweredBy !== false,
                        approvalEmailPresetId: typeof o.approvalEmailPresetId === "string" ? o.approvalEmailPresetId.trim() : "",
                    };
                } else if (rejectionTemplate || approvalTemplate) {
                    customerApprovalSettings = {
                        ...customerApprovalSettings,
                        rejectionEmailPresetId: "",
                        approvalEmailPresetId: "",
                        ...(rejectionTemplate && {
                            rejectEmailSubject: rejectionTemplate.subject ?? DEFAULT_REJECT_SUBJECT,
                            rejectEmailBody: rejectionTemplate.bodyHtml ?? rejectionTemplate.bodyText ?? DEFAULT_REJECT_BODY,
                        }),
                        ...(approvalTemplate && {
                            approveEmailSubject: approvalTemplate.subject ?? DEFAULT_APPROVE_SUBJECT,
                            approveEmailBody: approvalTemplate.bodyHtml ?? approvalTemplate.bodyText ?? DEFAULT_APPROVE_BODY,
                        }),
                    };
                }
            } else if (rejectionTemplate || approvalTemplate) {
                // No AppSettings row (settings is null): load from EmailTemplate so reload shows last-saved template
                customerApprovalSettings = {
                    ...CUSTOMER_APPROVAL_DEFAULTS,
                    rejectionEmailPresetId: "",
                    approvalEmailPresetId: "",
                    ...(rejectionTemplate && {
                        rejectEmailSubject: rejectionTemplate.subject ?? DEFAULT_REJECT_SUBJECT,
                        rejectEmailBody: rejectionTemplate.bodyHtml ?? rejectionTemplate.bodyText ?? DEFAULT_REJECT_BODY,
                    }),
                    ...(approvalTemplate && {
                        approveEmailSubject: approvalTemplate.subject ?? DEFAULT_APPROVE_SUBJECT,
                        approveEmailBody: approvalTemplate.bodyHtml ?? approvalTemplate.bodyText ?? DEFAULT_APPROVE_BODY,
                    }),
                };
            }
            // Infer preset id when empty (run whether we had settings or not): strip HTML from stored body, compare as plain text; if no body match, use subject. So last-saved template shows after reload.
            if (customerApprovalSettings.rejectionEmailPresetId === "" && ((customerApprovalSettings.rejectEmailBody ?? "").trim() || (customerApprovalSettings.rejectEmailSubject ?? "").trim())) {
                const inferred = inferRejectionPresetId(customerApprovalSettings.rejectEmailBody ?? "", customerApprovalSettings.rejectEmailSubject);
                if (inferred) customerApprovalSettings = { ...customerApprovalSettings, rejectionEmailPresetId: inferred };
            }
            if (customerApprovalSettings.approvalEmailPresetId === "" && ((customerApprovalSettings.approveEmailBody ?? "").trim() || (customerApprovalSettings.approveEmailSubject ?? "").trim())) {
                const inferred = inferApprovalPresetId(customerApprovalSettings.approveEmailBody ?? "", customerApprovalSettings.approveEmailSubject);
                if (inferred) customerApprovalSettings = { ...customerApprovalSettings, approvalEmailPresetId: inferred };
            }
            // Email preview: when preset id is set but stored body is empty or default, fill from preset so preview shows full template (log evidence: casRejectBodyLen 0, templateBodyLen 0, finalBody was DEFAULT_REJECT_BODY)
            const rid = (customerApprovalSettings.rejectionEmailPresetId ?? "").trim();
            if (rid) {
                const rPreset = getRejectionPresetById(rid);
                const currentRejectBody = (customerApprovalSettings.rejectEmailBody ?? "").trim();
                if (rPreset && (currentRejectBody === "" || currentRejectBody === DEFAULT_REJECT_BODY)) {
                    customerApprovalSettings = {
                        ...customerApprovalSettings,
                        rejectEmailSubject: rPreset.subject ?? customerApprovalSettings.rejectEmailSubject,
                        rejectEmailBody: rPreset.bodyHtml ?? customerApprovalSettings.rejectEmailBody,
                        rejectEmailFooterText: rPreset.footerText ?? customerApprovalSettings.rejectEmailFooterText,
                        rejectEmailButtonText: rPreset.buttonText ?? customerApprovalSettings.rejectEmailButtonText,
                        rejectEmailButtonUrl: rPreset.buttonUrl ?? customerApprovalSettings.rejectEmailButtonUrl,
                        rejectEmailHeaderTitle: rPreset.headerTitle ?? customerApprovalSettings.rejectEmailHeaderTitle ?? "",
                        rejectEmailHeaderTitleSize: rPreset.headerTitleSize ?? customerApprovalSettings.rejectEmailHeaderTitleSize ?? "24",
                        rejectEmailHeaderTitleColor: rPreset.headerTitleColor ?? customerApprovalSettings.rejectEmailHeaderTitleColor ?? "",
                        rejectEmailHeaderBgColor: rPreset.headerBgColor ?? customerApprovalSettings.rejectEmailHeaderBgColor ?? "",
                        rejectEmailLogoAlign: (rPreset.logoAlign as "left" | "center" | "right") ?? customerApprovalSettings.rejectEmailLogoAlign ?? "left",
                        rejectEmailButtonColor: rPreset.buttonColor ?? customerApprovalSettings.rejectEmailButtonColor ?? "",
                        rejectEmailButtonTextColor: rPreset.buttonTextColor ?? customerApprovalSettings.rejectEmailButtonTextColor ?? "",
                        rejectEmailButtonAlign: (rPreset.buttonAlign as "left" | "center" | "right") ?? customerApprovalSettings.rejectEmailButtonAlign ?? "left",
                    };
                }
            }
            const aid = (customerApprovalSettings.approvalEmailPresetId ?? "").trim();
            if (aid) {
                const aPreset = getApprovalPresetById(aid);
                const currentApproveBody = (customerApprovalSettings.approveEmailBody ?? "").trim();
                if (aPreset && (currentApproveBody === "" || currentApproveBody === DEFAULT_APPROVE_BODY)) {
                    customerApprovalSettings = {
                        ...customerApprovalSettings,
                        approveEmailSubject: aPreset.subject ?? customerApprovalSettings.approveEmailSubject,
                        approveEmailBody: aPreset.bodyHtml ?? customerApprovalSettings.approveEmailBody,
                        approveEmailFooterText: aPreset.footerText ?? customerApprovalSettings.approveEmailFooterText,
                        approveEmailButtonText: aPreset.buttonText ?? customerApprovalSettings.approveEmailButtonText,
                        approveEmailButtonUrl: aPreset.buttonUrl ?? customerApprovalSettings.approveEmailButtonUrl,
                        approveEmailHeaderTitle: aPreset.headerTitle ?? customerApprovalSettings.approveEmailHeaderTitle ?? "",
                        approveEmailHeaderTitleSize: aPreset.headerTitleSize ?? customerApprovalSettings.approveEmailHeaderTitleSize ?? "24",
                        approveEmailHeaderTitleColor: aPreset.headerTitleColor ?? customerApprovalSettings.approveEmailHeaderTitleColor ?? "",
                        approveEmailHeaderBgColor: aPreset.headerBgColor ?? customerApprovalSettings.approveEmailHeaderBgColor ?? "",
                        approveEmailLogoAlign: (aPreset.logoAlign as "left" | "center" | "right") ?? customerApprovalSettings.approveEmailLogoAlign ?? "left",
                        approveEmailButtonColor: aPreset.buttonColor ?? customerApprovalSettings.approveEmailButtonColor ?? "",
                        approveEmailButtonTextColor: aPreset.buttonTextColor ?? customerApprovalSettings.approveEmailButtonTextColor ?? "",
                        approveEmailButtonAlign: (aPreset.buttonAlign as "left" | "center" | "right") ?? customerApprovalSettings.approveEmailButtonAlign ?? "left",
                    };
                }
            }
        }

    defaultLanguage = normalizeLangCode(defaultLanguage) || "en";
    languageOptions = ensureCoreLanguagesEnabled(languageOptions);
    formTranslations = sanitizeFormTranslations(formTranslations);

    const uiDefaultsForShop = getSettingsStoreUiStrings(defaultLanguage);
    if (
        customerApprovalSettings.loggedInCheckoutBlockedMessage.trim() ===
        BUILTIN_EN_LOGGED_IN_BLOCKED_MESSAGE.trim()
    ) {
        customerApprovalSettings = {
            ...customerApprovalSettings,
            loggedInCheckoutBlockedMessage: uiDefaultsForShop.defaultLoggedInBlockedMessage,
        };
    }

    const allLangs = [...CORE_LANGUAGES];

    const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
    return {
        defaultLanguage,
        languageOptions,
        allLanguages: allLangs,
        formTranslations,
        translationKeys: TRANSLATION_KEYS,
        defaultTranslationsEn: DEFAULT_TRANSLATIONS_EN,
        defaultTranslationsByLang: DEFAULT_TRANSLATIONS_BY_LANG,
        customerApprovalSettings,
        smtpSettings,
        appSettingsUpdatedAt,
        storeDomain: storeHandle,
        /** Resolved after DB work — stream first paint via `<Await>` + `<Suspense>`. */
        shopMeta: shopMetaPromise,
    };
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shop = session?.shop || "";
    if (!shop) {
        return { error: "No shop" };
    }

    const formData = await request.formData();
    const intent = formData.get("intent") as string;
    if (intent === "saveTranslations") {
        const translationsJson = formData.get("formTranslations") as string;
        try {
            const parsed = translationsJson ? (JSON.parse(translationsJson) as Record<string, Record<string, string>>) : {};
            const formTranslations = sanitizeFormTranslations(parsed);
            const existing = await prisma.appSettings.findUnique({ where: { shop } });
            const base = existing || { defaultLanguage: "en", languageOptions: [] };
            await prisma.appSettings.upsert({
                where: { shop },
                update: { formTranslations, updatedAt: new Date() },
                create: {
                    shop,
                    defaultLanguage: (base as { defaultLanguage?: string }).defaultLanguage || "en",
                    languageOptions: (base as { languageOptions?: unknown }).languageOptions || [],
                    formTranslations,
                },
            });
            const fresh = await prisma.appSettings.findUnique({ where: { shop }, select: { updatedAt: true } });
            return {
                success: true,
                translationsSaved: true,
                formTranslations,
                settingsUpdatedAt: fresh?.updatedAt.toISOString() ?? null,
            };
        } catch (e) {
            console.error("Translations save failed:", e);
            return { error: "Failed to save translations" };
        }
    }

    if (intent !== "save") {
        return { error: "Invalid request" };
    }

    const existingRow = await prisma.appSettings.findUnique({ where: { shop } });

    const defaultLanguage = (formData.get("defaultLanguage") as string) || "en";
    let themeSettings: ThemeSettings = THEME_DEFAULTS;
    const rawTheme = formData.get("themeSettings") as string | null;
    if (rawTheme && rawTheme.length > 0) {
        try {
            themeSettings = normalizeThemeSettings(JSON.parse(rawTheme) as unknown);
        } catch {
            themeSettings = THEME_DEFAULTS;
        }
    } else if (existingRow?.themeSettings) {
        try {
            themeSettings = normalizeThemeSettings(existingRow.themeSettings);
        } catch {
            themeSettings = THEME_DEFAULTS;
        }
    }
    let customCss = "";
    const rawCustomCss = formData.get("customCss");
    if (rawCustomCss !== null && typeof rawCustomCss === "string") {
        customCss = rawCustomCss;
    } else if (typeof existingRow?.customCss === "string") {
        customCss = existingRow.customCss;
    }
    const enabledCodes = formData.getAll("languageEnabled[]") as string[];
    const customLangCodes = formData.getAll("customLangCode[]") as string[];
    const customLangNames = formData.getAll("customLangName[]") as string[];
    let formTranslations: Record<string, Record<string, string>> | undefined;
    try {
        const translationsJson = formData.get("formTranslations") as string | null;
        if (translationsJson && typeof translationsJson === "string") {
            const parsed = JSON.parse(translationsJson);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) formTranslations = parsed as Record<string, Record<string, string>>;
        }
    } catch {
        formTranslations = undefined;
    }

    const coreByCode = new Map(CORE_LANGUAGES.map((l) => [l.code, l]));
    const customByCode = new Map<string, string>();
    customLangCodes.forEach((code, i) => {
        const c = code?.trim().toLowerCase();
        if (c) customByCode.set(c, (customLangNames[i] || code).trim() || c);
    });

    let languageOptions: LanguageOption[] = enabledCodes
        .map((code) => {
            const c = normalizeLangCode(code);
            const fromCore = coreByCode.get(c);
            if (fromCore) return fromCore;
            const customName = customByCode.get(c);
            if (customName) return { code: c, name: customName };
            return { code: c, name: c };
        })
        .filter((l): l is LanguageOption => !!l);
    languageOptions = ensureCoreLanguagesEnabled(sanitizeLanguageOptions(languageOptions));

    const safeDefaultLanguage = normalizeLangCode(defaultLanguage) || "en";

    if (formTranslations && typeof formTranslations === "object" && !Array.isArray(formTranslations)) {
        formTranslations = sanitizeFormTranslations(formTranslations);
    }

    let customerApprovalSettings: CustomerApprovalSettings | undefined;
    const rawCas = formData.get("customerApprovalSettings") as string | null;
    if (rawCas && typeof rawCas === "string") {
        try {
            const parsed = JSON.parse(rawCas) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                const o = parsed as Record<string, unknown>;
                customerApprovalSettings = {
                    approvalMode: o.approvalMode === "auto" ? "auto" : "manual",
                    approvedTag:
                        typeof o.approvedTag === "string" && o.approvedTag.trim()
                            ? o.approvedTag.trim()
                            : CUSTOMER_APPROVAL_DEFAULTS.approvedTag,
                    afterSubmit: o.afterSubmit === "redirect" ? "redirect" : "message",
                    redirectUrl: typeof o.redirectUrl === "string" ? o.redirectUrl : "",
                    successMessage: typeof o.successMessage === "string" ? o.successMessage : CUSTOMER_APPROVAL_DEFAULTS.successMessage,
                    pendingRegistrationScreenTitle:
                        typeof o.pendingRegistrationScreenTitle === "string"
                            ? o.pendingRegistrationScreenTitle.trim()
                            : CUSTOMER_APPROVAL_DEFAULTS.pendingRegistrationScreenTitle,
                    pendingRegistrationScreenMessage:
                        typeof o.pendingRegistrationScreenMessage === "string"
                            ? o.pendingRegistrationScreenMessage.trim()
                            : CUSTOMER_APPROVAL_DEFAULTS.pendingRegistrationScreenMessage,
                    appearanceTemplateId: getAppearanceTemplateId(o.appearanceTemplateId),
                    redirectGuestsFromCheckout: o.redirectGuestsFromCheckout === true,
                    guestCheckoutRedirectUrl: typeof o.guestCheckoutRedirectUrl === "string" ? o.guestCheckoutRedirectUrl : "",
                    blockLoggedInWithoutApprovedTag: o.blockLoggedInWithoutApprovedTag === true,
                    loggedInCheckoutBlockedMessage:
                        typeof o.loggedInCheckoutBlockedMessage === "string" && o.loggedInCheckoutBlockedMessage.trim()
                            ? o.loggedInCheckoutBlockedMessage.trim()
                            : CUSTOMER_APPROVAL_DEFAULTS.loggedInCheckoutBlockedMessage,
                    emailOnReject: o.emailOnReject === true,
                    rejectionEmailPresetId: typeof o.rejectionEmailPresetId === "string" ? o.rejectionEmailPresetId.trim() : "",
                    rejectEmailSubject: typeof o.rejectEmailSubject === "string" ? o.rejectEmailSubject : DEFAULT_REJECT_SUBJECT,
                    rejectEmailBody: typeof o.rejectEmailBody === "string" ? o.rejectEmailBody : DEFAULT_REJECT_BODY,
                    rejectEmailLogoUrl: typeof o.rejectEmailLogoUrl === "string" ? o.rejectEmailLogoUrl : "",
                    rejectEmailLogoSize: typeof o.rejectEmailLogoSize === "string" && o.rejectEmailLogoSize ? o.rejectEmailLogoSize : "200",
                    rejectEmailHeaderTitle: typeof o.rejectEmailHeaderTitle === "string" ? o.rejectEmailHeaderTitle : "",
                    rejectEmailHeaderTitleSize: typeof o.rejectEmailHeaderTitleSize === "string" && o.rejectEmailHeaderTitleSize ? o.rejectEmailHeaderTitleSize : "24",
                    rejectEmailHeaderTitleColor: typeof o.rejectEmailHeaderTitleColor === "string" ? o.rejectEmailHeaderTitleColor : "",
                    rejectEmailHeaderBgColor: typeof o.rejectEmailHeaderBgColor === "string" ? o.rejectEmailHeaderBgColor : "",
                    rejectEmailLogoAlign: (o.rejectEmailLogoAlign === "center" || o.rejectEmailLogoAlign === "right") ? o.rejectEmailLogoAlign : "left",
                    rejectEmailButtonText: typeof o.rejectEmailButtonText === "string" ? o.rejectEmailButtonText : "",
                    rejectEmailButtonUrl: typeof o.rejectEmailButtonUrl === "string" ? o.rejectEmailButtonUrl : "",
                    rejectEmailButtonColor: typeof o.rejectEmailButtonColor === "string" ? o.rejectEmailButtonColor : "",
                    rejectEmailButtonTextColor: typeof o.rejectEmailButtonTextColor === "string" ? o.rejectEmailButtonTextColor : "",
                    rejectEmailButtonAlign: (o.rejectEmailButtonAlign === "center" || o.rejectEmailButtonAlign === "right") ? o.rejectEmailButtonAlign : "left",
                    rejectEmailFooterText: typeof o.rejectEmailFooterText === "string" ? o.rejectEmailFooterText : "",
                    rejectEmailShowPoweredBy: o.rejectEmailShowPoweredBy !== false,
                    emailOnApprove: o.emailOnApprove === true,
                    approveEmailSubject: typeof o.approveEmailSubject === "string" ? o.approveEmailSubject : DEFAULT_APPROVE_SUBJECT,
                    approveEmailBody: typeof o.approveEmailBody === "string" ? o.approveEmailBody : DEFAULT_APPROVE_BODY,
                    approveEmailLogoUrl: typeof o.approveEmailLogoUrl === "string" ? o.approveEmailLogoUrl : "",
                    approveEmailLogoSize: typeof o.approveEmailLogoSize === "string" && o.approveEmailLogoSize ? o.approveEmailLogoSize : "200",
                    approveEmailHeaderTitle: typeof o.approveEmailHeaderTitle === "string" ? o.approveEmailHeaderTitle : "",
                    approveEmailHeaderTitleSize: typeof o.approveEmailHeaderTitleSize === "string" && o.approveEmailHeaderTitleSize ? o.approveEmailHeaderTitleSize : "24",
                    approveEmailHeaderTitleColor: typeof o.approveEmailHeaderTitleColor === "string" ? o.approveEmailHeaderTitleColor : "",
                    approveEmailHeaderBgColor: typeof o.approveEmailHeaderBgColor === "string" ? o.approveEmailHeaderBgColor : "",
                    approveEmailLogoAlign: (o.approveEmailLogoAlign === "center" || o.approveEmailLogoAlign === "right") ? o.approveEmailLogoAlign : "left",
                    approveEmailButtonText: typeof o.approveEmailButtonText === "string" ? o.approveEmailButtonText : "",
                    approveEmailButtonUrl: typeof o.approveEmailButtonUrl === "string" ? o.approveEmailButtonUrl : "",
                    approveEmailButtonColor: typeof o.approveEmailButtonColor === "string" ? o.approveEmailButtonColor : "",
                    approveEmailButtonTextColor: typeof o.approveEmailButtonTextColor === "string" ? o.approveEmailButtonTextColor : "",
                    approveEmailButtonAlign: (o.approveEmailButtonAlign === "center" || o.approveEmailButtonAlign === "right") ? o.approveEmailButtonAlign : "left",
                    approveEmailFooterText: typeof o.approveEmailFooterText === "string" ? o.approveEmailFooterText : "",
                    approveEmailShowPoweredBy: o.approveEmailShowPoweredBy !== false,
                    approvalEmailPresetId: typeof o.approvalEmailPresetId === "string" ? o.approvalEmailPresetId.trim() : "",
                };
            }
        } catch {
            // ignore invalid JSON
        }
    }
    const settingsToPersist = customerApprovalSettings ?? CUSTOMER_APPROVAL_DEFAULTS;

    function isValidGuestCheckoutRedirectUrl(s: string): boolean {
        const t = s.trim();
        if (!t) return false;
        if (t.startsWith("/") && !t.startsWith("//")) return true;
        try {
            const u = new URL(t);
            return u.protocol === "http:" || u.protocol === "https:";
        } catch {
            return false;
        }
    }
    if (settingsToPersist.redirectGuestsFromCheckout || settingsToPersist.blockLoggedInWithoutApprovedTag) {
        const u = (settingsToPersist.guestCheckoutRedirectUrl ?? "").trim();
        if (!isValidGuestCheckoutRedirectUrl(u)) {
            return {
                error: "Enter a valid redirect URL (https://... or a path like /pages/contact) when guest redirect and/or blocking customers without the approved tag is enabled.",
            };
        }
    }

    const logoUrl = (settingsToPersist.rejectEmailLogoUrl ?? "").trim();
    if (logoUrl && isSvgLogoUrl(logoUrl)) {
        return { error: "Rejection email logo URL must be PNG, JPG or WebP only. SVG is not allowed." };
    }
    if (logoUrl && !isAllowedLogoUrl(logoUrl)) {
        return { error: "Rejection email logo URL must be a PNG, JPG or WebP image link." };
    }
    const approveLogoUrl = (settingsToPersist.approveEmailLogoUrl ?? "").trim();
    if (approveLogoUrl && isSvgLogoUrl(approveLogoUrl)) {
        return { error: "Approval email logo URL must be PNG, JPG or WebP only. SVG is not allowed." };
    }
    if (approveLogoUrl && !isAllowedLogoUrl(approveLogoUrl)) {
        return { error: "Approval email logo URL must be a PNG, JPG or WebP image link." };
    }

    let smtpHost = (formData.get("smtpHost") as string)?.trim() ?? "";
    const smtpPort = parseInt((formData.get("smtpPort") as string) || "587", 10) || 587;
    const smtpSecure = formData.get("smtpSecure") === "true" || formData.get("smtpSecure") === "on";
    let smtpUser = (formData.get("smtpUser") as string)?.trim() ?? "";
    const smtpPassword = (formData.get("smtpPassword") as string) || "";
    const smtpFromEmail = (formData.get("smtpFromEmail") as string)?.trim() ?? "";
    const smtpFromName = (formData.get("smtpFromName") as string)?.trim() ?? "";

    // Infer Gmail SMTP when From email is Gmail but host was not filled (so save is not skipped)
    if (smtpFromEmail && /@gmail\.com$/i.test(smtpFromEmail) && !smtpHost) {
        smtpHost = "smtp.gmail.com";
        if (!smtpUser) smtpUser = smtpFromEmail;
    }

    const smtpPasswordTrimmed = smtpPassword.trim();
    let smtpPasswordVerifiedFlag = false;
    if (smtpPasswordTrimmed && smtpHost && smtpFromEmail) {
        if (!smtpUser) {
            return {
                error: "Enter SMTP username (your full email address, usually the same as From email).",
            };
        }
        const verified = await verifySmtpCredentials({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            user: smtpUser,
            password: smtpPasswordTrimmed,
        });
        if (!verified.ok) {
            return { error: verified.message };
        }
        smtpPasswordVerifiedFlag = true;
    }

    try {
        // Theme/appearance (including reset-to-defaults) persist only when user clicks Save; no other path writes these.
        type AppSettingsUpsertUpdate = Parameters<typeof prisma.appSettings.upsert>[0]["update"];
        type AppSettingsUpsertCreate = Parameters<typeof prisma.appSettings.upsert>[0]["create"];

        const updatePayload = {
            defaultLanguage: safeDefaultLanguage,
            languageOptions: languageOptions as unknown as Prisma.InputJsonValue,
            updatedAt: new Date(),
            customCss,
            themeSettings: themeSettings as unknown as Prisma.InputJsonValue,
        } as AppSettingsUpsertUpdate;
        if (formTranslations && typeof formTranslations === "object" && !Array.isArray(formTranslations)) {
            updatePayload.formTranslations = formTranslations;
        }
        // Store full customerApprovalSettings (subject, body, preset id) so loader can show last-saved template after reload
        updatePayload.customerApprovalSettings = settingsToPersist as unknown as Prisma.InputJsonValue;
        await prisma.appSettings.upsert({
            where: { shop },
            update: updatePayload,
            create: {
                shop,
                defaultLanguage: safeDefaultLanguage,
                languageOptions: languageOptions as unknown as Prisma.InputJsonValue,
                formTranslations: formTranslations ?? undefined,
                customCss,
                themeSettings: themeSettings as unknown as Prisma.InputJsonValue,
                customerApprovalSettings: settingsToPersist as unknown as Prisma.InputJsonValue,
            } as AppSettingsUpsertCreate,
        });
        if (smtpHost && smtpFromEmail) {
            await upsertSmtpSettings(shop, {
                host: smtpHost,
                port: smtpPort,
                secure: smtpSecure,
                user: smtpUser || undefined,
                password: smtpPasswordTrimmed || undefined,
                fromEmail: smtpFromEmail,
                fromName: smtpFromName || undefined,
            });
        }
        // Store subject + body in email_template so loader can read last-saved template and infer preset if needed
        await upsertRejectionTemplate(shop, {
            subject: settingsToPersist.rejectEmailSubject,
            bodyHtml: settingsToPersist.rejectEmailBody,
        });
        await upsertApprovalTemplate(shop, {
            subject: settingsToPersist.approveEmailSubject,
            bodyHtml: settingsToPersist.approveEmailBody,
        });
        const fresh = await prisma.appSettings.findUnique({ where: { shop }, select: { updatedAt: true } });
        return {
            success: true,
            settingsUpdatedAt: fresh?.updatedAt.toISOString() ?? null,
            ...(smtpPasswordVerifiedFlag && { smtpPasswordVerified: true }),
        };
    } catch (e) {
        console.error("Settings save failed:", e);
        return { error: "Failed to save settings" };
    }
};

function getLangTranslations(
    formTranslations: Record<string, Record<string, string>>,
    lang: string,
    defaultTranslationsEn: Record<string, string>,
    defaultTranslationsByLang: Record<string, Record<string, string>>
): Record<string, string> {
    const defaults = defaultTranslationsByLang[lang] ?? defaultTranslationsEn;
    return { ...defaults, ...(formTranslations[lang] || {}) };
}

function ColorPickerField({
    label,
    value,
    onChange,
    helpText,
}: {
    label: string;
    value: string;
    onChange: (val: string) => void;
    helpText?: string;
}) {
    const fieldId = useId();
    const [popoverActive, setPopoverActive] = useState(false);
    const safe =
        typeof value === "string" && value.trim().match(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
            ? value.trim()
            : "#000000";

    const hsbColor = useMemo(() => {
        const rgb = hexToRgb(safe);
        if (
            !Number.isFinite(rgb.red) ||
            !Number.isFinite(rgb.green) ||
            !Number.isFinite(rgb.blue)
        ) {
            return rgbToHsb({ red: 0, green: 0, blue: 0 });
        }
        return rgbToHsb(rgb);
    }, [safe]);

    return (
        <div className="settings-appearance-color-field">
            <BlockStack gap="150">
                <label htmlFor={fieldId} className="settings-appearance-color-label">
                    {label}
                </label>
                <InlineStack gap="200" blockAlign="center" wrap={false}>
                    <Box minWidth="0" width="100%">
                        <TextField
                            id={fieldId}
                            label={label}
                            labelHidden
                            value={value}
                            onChange={onChange}
                            autoComplete="off"
                        />
                    </Box>
                    <Box flexShrink="0">
                        <Popover
                            active={popoverActive}
                            autofocusTarget="first-node"
                            preferredPosition="below"
                            preferredAlignment="right"
                            onClose={() => setPopoverActive(false)}
                            activator={
                                <button
                                    type="button"
                                    onClick={() => setPopoverActive((a) => !a)}
                                    aria-label={`Open color picker for ${label}`}
                                    className="settings-appearance-color-swatch"
                                    style={{ background: safe }}
                                />
                            }
                        >
                            <Box padding="300">
                                <ColorPicker color={hsbColor} onChange={(color) => onChange(hsbToHex(color))} />
                            </Box>
                        </Popover>
                    </Box>
                </InlineStack>
                {helpText ? (
                    <Text as="p" variant="bodySm" tone="subdued">
                        {helpText}
                    </Text>
                ) : null}
            </BlockStack>
        </div>
    );
}

/** Programmatic Save Bar id (do not combine with data-save-bar on the same form). */
const SETTINGS_SAVE_BAR_ID = "approvefy-settings-save-bar";

type SettingsPageLoaderData = {
    defaultLanguage: string;
    languageOptions: LanguageOption[];
    allLanguages: LanguageOption[];
    formTranslations: Record<string, Record<string, string>>;
    translationKeys: readonly string[];
    defaultTranslationsEn: Record<string, string>;
    defaultTranslationsByLang: Record<string, Record<string, string>>;
    customerApprovalSettings: CustomerApprovalSettings;
    smtpSettings: Awaited<ReturnType<typeof getSmtpSettings>>;
    /** Server `AppSettings.updatedAt` when a row exists (for “last saved” + discard reset). */
    appSettingsUpdatedAt: string | null;
    storeDomain: string;
    storeName: string;
    storeEmail: string;
    storeLogoUrl: string | null;
};

function SettingsRouteSkeleton() {
    return (
        <Page title="Settings">
            <div
                className="settings-route-loading"
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "min(60vh, 480px)",
                    width: "100%",
                }}
            >
                <s-spinner accessibilityLabel="Loading" size="large-100" />
            </div>
        </Page>
    );
}

export default function Settings() {
    const raw = useLoaderData<typeof loader>();
    const { shopMeta, ...staticPart } = raw;
    return (
        <Suspense fallback={<SettingsRouteSkeleton />}>
            <Await resolve={shopMeta}>
                {(meta) => <SettingsPage data={{ ...staticPart, ...meta } as SettingsPageLoaderData} />}
            </Await>
        </Suspense>
    );
}

function SettingsPage({ data }: { data: SettingsPageLoaderData }) {
    const {
        defaultLanguage,
        languageOptions,
        allLanguages,
        formTranslations,
        translationKeys,
        defaultTranslationsEn,
        defaultTranslationsByLang,
        customerApprovalSettings: initialCustomerApprovalSettings,
        smtpSettings: initialSmtpSettings,
        appSettingsUpdatedAt: initialAppSettingsUpdatedAt,
        storeLogoUrl: initialStoreLogoUrl,
        storeName: initialStoreName,
        storeEmail: initialStoreEmail,
        storeDomain: initialStoreDomain,
    } = data;
    const actionData = useActionData<typeof action>();
    const submit = useSubmit();
    const navigation = useNavigation();
    const navigate = useNavigate();
    const [selectedDefault, setSelectedDefault] = useState(defaultLanguage);
    const [enabledCodes, setEnabledCodes] = useState<Set<string>>(
        () => new Set(languageOptions.map((l) => l.code))
    );
    const [customLanguages, setCustomLanguages] = useState<LanguageOption[]>(() =>
        languageOptions.filter((l) => !CORE_CODE_SET.has(normalizeLangCode(l.code)))
    );
    const [newLangCode, setNewLangCode] = useState("");
    const [newLangName, setNewLangName] = useState("");
    const [mainTabIndex, setMainTabIndex] = useState(0);
    const [emailSettingSubIndex, setEmailSettingSubIndex] = useState<0 | 1>(0); // 0 = SMTP, 1 = TEMPLATE
    const handleBack = useCallback(() => {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate("/app");
        }
    }, [navigate]);
    const [customerApprovalSettings, setCustomerApprovalSettings] = useState<CustomerApprovalSettings>(
        initialCustomerApprovalSettings ?? CUSTOMER_APPROVAL_DEFAULTS
    );
    const [smtpHost, setSmtpHost] = useState(initialSmtpSettings?.host ?? "");
    const [smtpPort, setSmtpPort] = useState(String(initialSmtpSettings?.port ?? 587));
    const [smtpSecure, setSmtpSecure] = useState(initialSmtpSettings?.secure ?? false);
    const [smtpUser, setSmtpUser] = useState(initialSmtpSettings?.user ?? "");
    const [smtpPassword, setSmtpPassword] = useState("");
    const [smtpFromEmail, setSmtpFromEmail] = useState(initialSmtpSettings?.fromEmail ?? "");
    const [smtpFromName, setSmtpFromName] = useState(initialSmtpSettings?.fromName ?? "");
    /** Shown as “Last saved”; restored to server/save-bar baseline on Discard. */
    const [lastSavedAtDisplay, setLastSavedAtDisplay] = useState<string | null>(initialAppSettingsUpdatedAt ?? null);
    const [selectedRejectionPresetId, setSelectedRejectionPresetId] = useState<string | null>(null);
    const [selectedApprovalPresetId, setSelectedApprovalPresetId] = useState<string | null>(null);
    const [isTemplateSelectionLoading, setIsTemplateSelectionLoading] = useState(true);
    const [approvedSectionOpen, setApprovedSectionOpen] = useState(false);
    const [rejectedSectionOpen, setRejectedSectionOpen] = useState(false);
    const [approvalTemplatePopoverActive, setApprovalTemplatePopoverActive] = useState(false);
    const [rejectionTemplatePopoverActive, setRejectionTemplatePopoverActive] = useState(false);
    // Keep preset ids on the main settings object in sync with the selected preset state so
    // baseline comparison and discard detection treat a saved template as "no unsaved changes".
    useEffect(() => {
        if (selectedRejectionPresetId === null || selectedApprovalPresetId === null) return;
        setCustomerApprovalSettings((prev) => ({
            ...prev,
            rejectionEmailPresetId: (selectedRejectionPresetId ?? "").trim(),
            approvalEmailPresetId: (selectedApprovalPresetId ?? "").trim(),
        }));
    }, [selectedRejectionPresetId, selectedApprovalPresetId]);

    useEffect(() => {
        let isMounted = true;
        const fallbackRejectionId = (initialCustomerApprovalSettings?.rejectionEmailPresetId ?? "").trim();
        const fallbackApprovalId = (initialCustomerApprovalSettings?.approvalEmailPresetId ?? "").trim();
        async function loadTemplateSelection() {
            try {
                const response = await fetch("/app/api/template-selection", {
                    method: "GET",
                    headers: { Accept: "application/json" },
                });
                if (!response.ok) {
                    throw new Error(`Template selection fetch failed: ${response.status}`);
                }
                const data = (await response.json()) as {
                    rejectionEmailPresetId?: unknown;
                    approvalEmailPresetId?: unknown;
                };
                if (!isMounted) return;
                const loadedRejectionId =
                    typeof data?.rejectionEmailPresetId === "string"
                        ? data.rejectionEmailPresetId.trim()
                        : fallbackRejectionId;
                const loadedApprovalId =
                    typeof data?.approvalEmailPresetId === "string"
                        ? data.approvalEmailPresetId.trim()
                        : fallbackApprovalId;
                setSelectedRejectionPresetId(loadedRejectionId);
                setSelectedApprovalPresetId(loadedApprovalId);
                setCustomerApprovalSettings((prev) => {
                    const rejectionPreset = loadedRejectionId ? getRejectionPresetById(loadedRejectionId) : undefined;
                    const approvalPreset = loadedApprovalId ? getApprovalPresetById(loadedApprovalId) : undefined;
                    return {
                        ...prev,
                        rejectionEmailPresetId: loadedRejectionId,
                        approvalEmailPresetId: loadedApprovalId,
                        ...(rejectionPreset
                            ? {
                                  rejectEmailSubject: rejectionPreset.subject,
                                  rejectEmailBody: rejectionPreset.bodyHtml,
                                  rejectEmailFooterText: rejectionPreset.footerText,
                                  rejectEmailButtonText: rejectionPreset.buttonText,
                                  rejectEmailButtonUrl: rejectionPreset.buttonUrl,
                                  rejectEmailHeaderTitle: rejectionPreset.headerTitle ?? "",
                                  rejectEmailHeaderTitleSize: rejectionPreset.headerTitleSize ?? "24",
                                  rejectEmailHeaderTitleColor: rejectionPreset.headerTitleColor ?? "",
                                  rejectEmailHeaderBgColor: rejectionPreset.headerBgColor ?? "",
                                  rejectEmailLogoAlign: rejectionPreset.logoAlign ?? "left",
                                  rejectEmailButtonColor: rejectionPreset.buttonColor ?? "",
                                  rejectEmailButtonTextColor: rejectionPreset.buttonTextColor ?? "",
                                  rejectEmailButtonAlign: rejectionPreset.buttonAlign ?? "left",
                              }
                            : {}),
                        ...(approvalPreset
                            ? {
                                  approveEmailSubject: approvalPreset.subject,
                                  approveEmailBody: approvalPreset.bodyHtml,
                                  approveEmailFooterText: approvalPreset.footerText,
                                  approveEmailButtonText: approvalPreset.buttonText,
                                  approveEmailButtonUrl: approvalPreset.buttonUrl,
                                  approveEmailHeaderTitle: approvalPreset.headerTitle ?? "",
                                  approveEmailHeaderTitleSize: approvalPreset.headerTitleSize ?? "24",
                                  approveEmailHeaderTitleColor: approvalPreset.headerTitleColor ?? "",
                                  approveEmailHeaderBgColor: approvalPreset.headerBgColor ?? "",
                                  approveEmailLogoAlign: approvalPreset.logoAlign ?? "left",
                                  approveEmailButtonColor: approvalPreset.buttonColor ?? "",
                                  approveEmailButtonTextColor: approvalPreset.buttonTextColor ?? "",
                                  approveEmailButtonAlign: approvalPreset.buttonAlign ?? "left",
                              }
                            : {}),
                    };
                });
            } catch {
                if (!isMounted) return;
                setSelectedRejectionPresetId(fallbackRejectionId);
                setSelectedApprovalPresetId(fallbackApprovalId);
            } finally {
                if (isMounted) setIsTemplateSelectionLoading(false);
            }
        }
        loadTemplateSelection();
        return () => {
            isMounted = false;
        };
    }, [
        initialCustomerApprovalSettings?.rejectionEmailPresetId,
        initialCustomerApprovalSettings?.approvalEmailPresetId,
    ]);
    const buildTranslationsFromLoader = useCallback(() => {
        const init: Record<string, Record<string, string>> = {};
        const langs = new Set(["en", ...languageOptions.map((l) => l.code), ...Object.keys(formTranslations || {})]);
        langs.forEach((lang) => {
            init[lang] = getLangTranslations(formTranslations || {}, lang, defaultTranslationsEn, defaultTranslationsByLang);
        });
        return init;
    }, [formTranslations, languageOptions, defaultTranslationsEn, defaultTranslationsByLang]);
    const [translations, setTranslations] = useState<Record<string, Record<string, string>>>(buildTranslationsFromLoader);

    const enabledCodesList = useMemo(() => {
        const codesArray = Array.from(enabledCodes);
        return codesArray.length > 0 ? codesArray : ["en"];
    }, [enabledCodes]);
    const [selectedLangTab, setSelectedLangTab] = useState<string>(() => enabledCodesList[0] ?? "en");
    const [translationSearch, setTranslationSearch] = useState("");

    const filteredTranslationKeys = useMemo(() => {
        const raw = translationSearch.trim();
        if (!raw) return translationKeys;
        const q = raw.toLowerCase();
        const qNormalized = raw.normalize().toLowerCase();
        return translationKeys.filter((key) => {
            const label = (defaultTranslationsEn[key] ?? key.replace(/_/g, " ")).toLowerCase();
            const translated = ((translations[selectedLangTab] || {})[key] ?? "").trim();
            const translatedLower = translated.toLowerCase();
            const translatedNorm = translated.normalize().toLowerCase();
            return (
                label.includes(q) ||
                key.toLowerCase().includes(q) ||
                translatedLower.includes(q) ||
                translatedNorm.includes(qNormalized) ||
                translated.includes(raw)
            );
        });
    }, [translationKeys, defaultTranslationsEn, translationSearch, translations, selectedLangTab]);

    useEffect(() => {
        setTranslations(buildTranslationsFromLoader());
    }, [buildTranslationsFromLoader]);

    useEffect(() => {
        if (!enabledCodesList.includes(selectedLangTab)) {
            setSelectedLangTab(enabledCodesList[0] ?? "en");
        }
    }, [enabledCodesList, selectedLangTab]);

    useEffect(() => {
        if (!enabledCodes.has(selectedDefault)) {
            const firstEnabled = Array.from(enabledCodes)[0] ?? "en";
            setSelectedDefault(firstEnabled);
        }
    }, [enabledCodes, selectedDefault]);

    useEffect(() => {
        const data = actionData as
            | {
                  success?: boolean;
                  translationsSaved?: boolean;
                  formTranslations?: Record<string, Record<string, string>>;
              }
            | undefined;
        if (data?.translationsSaved && data?.formTranslations) {
            const init: Record<string, Record<string, string>> = {};
            const langs = new Set(["en", ...Object.keys(data.formTranslations)]);
            langs.forEach((lang) => {
                init[lang] = getLangTranslations(data.formTranslations!, lang, defaultTranslationsEn, defaultTranslationsByLang);
            });
            setTranslations(init);
        }
    }, [actionData, defaultTranslationsEn, defaultTranslationsByLang]);

    const [showToast, setShowToast] = useState(false);
    const [translationsSavedToast, setTranslationsSavedToast] = useState(false);
    const [langDropdownActive, setLangDropdownActive] = useState(false);
    const [langSearchQuery, setLangSearchQuery] = useState("");

    const isSaving = navigation.state === "submitting";
    const settingsFormRef = useRef<HTMLFormElement>(null);

    useEffect(() => {
        if (actionData && (actionData as { success?: boolean }).success) {
            setShowToast(true);
        }
    }, [actionData]);

    useEffect(() => {
        const data = actionData as { translationsSaved?: boolean } | undefined;
        if (data?.translationsSaved) {
            setTranslationsSavedToast(true);
        }
    }, [actionData]);

    const handleAddCustomLanguage = () => {
        const code = newLangCode.trim().toLowerCase();
        const name = newLangName.trim() || code;
        if (!code) return;
        if (customLanguages.some((l) => l.code === code) || allLanguages.some((l) => l.code === code)) return;
        setCustomLanguages((prev) => [...prev, { code, name }]);
        setEnabledCodes((prev) => new Set([...prev, code]));
        setNewLangCode("");
        setNewLangName("");
    };

    const handleRemoveCustomLanguage = (code: string) => {
        setCustomLanguages((prev) => prev.filter((l) => l.code !== code));
        setEnabledCodes((prev) => {
            const next = new Set(prev);
            next.delete(code);
            return next.size > 0 ? next : new Set(["en"]);
        });
    };

    const initialApprovalForCompare = useMemo(() => initialCustomerApprovalSettings ?? CUSTOMER_APPROVAL_DEFAULTS, [initialCustomerApprovalSettings]);
    const initialTranslations = useMemo(() => buildTranslationsFromLoader(), [buildTranslationsFromLoader]);

    // After a successful save, don't overwrite form with loader data (revalidation may still have stale data).
    const skipSyncAfterSaveRef = useRef(false);
    // Sync email/SMTP and rejection-email state from loader so saved data appears on refresh or when not just saved
    useEffect(() => {
        const justSaved = actionData && (actionData as { success?: boolean }).success;
        if (justSaved) {
            skipSyncAfterSaveRef.current = true;
            return;
        }
        if (skipSyncAfterSaveRef.current) {
            skipSyncAfterSaveRef.current = false;
        }
        if (initialSmtpSettings) {
            setSmtpHost(initialSmtpSettings.host ?? "");
            setSmtpPort(String(initialSmtpSettings.port ?? 587));
            setSmtpSecure(initialSmtpSettings.secure ?? false);
            setSmtpUser(initialSmtpSettings.user ?? "");
            setSmtpPassword("");
            setSmtpFromEmail(initialSmtpSettings.fromEmail ?? "");
            setSmtpFromName(initialSmtpSettings.fromName ?? "");
        } else {
            setSmtpHost("");
            setSmtpPort("587");
            setSmtpSecure(false);
            setSmtpUser("");
            setSmtpPassword("");
            setSmtpFromEmail("");
            setSmtpFromName("");
        }
        const approval = initialCustomerApprovalSettings ?? CUSTOMER_APPROVAL_DEFAULTS;
        setCustomerApprovalSettings((prev) => ({
            ...prev,
            ...approval,
            rejectEmailLogoUrl: approval.rejectEmailLogoUrl ?? "",
            rejectEmailLogoSize: approval.rejectEmailLogoSize ?? "200",
            rejectEmailHeaderTitle: approval.rejectEmailHeaderTitle ?? "",
            rejectEmailHeaderTitleSize: approval.rejectEmailHeaderTitleSize ?? "24",
            rejectEmailHeaderTitleColor: approval.rejectEmailHeaderTitleColor ?? "",
            rejectEmailHeaderBgColor: approval.rejectEmailHeaderBgColor ?? "",
            rejectEmailLogoAlign: approval.rejectEmailLogoAlign ?? "left",
            rejectEmailButtonText: approval.rejectEmailButtonText ?? "",
            rejectEmailButtonUrl: approval.rejectEmailButtonUrl ?? "",
            rejectEmailButtonColor: approval.rejectEmailButtonColor ?? "",
            rejectEmailButtonTextColor: approval.rejectEmailButtonTextColor ?? "",
            rejectEmailButtonAlign: approval.rejectEmailButtonAlign ?? "left",
            rejectEmailFooterText: approval.rejectEmailFooterText ?? "",
            rejectEmailShowPoweredBy: approval.rejectEmailShowPoweredBy ?? true,
            approveEmailLogoUrl: approval.approveEmailLogoUrl ?? "",
            approveEmailLogoSize: approval.approveEmailLogoSize ?? "200",
            approveEmailHeaderTitle: approval.approveEmailHeaderTitle ?? "",
            approveEmailHeaderTitleSize: approval.approveEmailHeaderTitleSize ?? "24",
            approveEmailHeaderTitleColor: approval.approveEmailHeaderTitleColor ?? "",
            approveEmailHeaderBgColor: approval.approveEmailHeaderBgColor ?? "",
            approveEmailLogoAlign: approval.approveEmailLogoAlign ?? "left",
            approveEmailButtonText: approval.approveEmailButtonText ?? "",
            approveEmailButtonUrl: approval.approveEmailButtonUrl ?? "",
            approveEmailButtonColor: approval.approveEmailButtonColor ?? "",
            approveEmailButtonTextColor: approval.approveEmailButtonTextColor ?? "",
            approveEmailButtonAlign: approval.approveEmailButtonAlign ?? "left",
            approveEmailFooterText: approval.approveEmailFooterText ?? "",
            approveEmailShowPoweredBy: approval.approveEmailShowPoweredBy ?? true,
        }));
        setSelectedRejectionPresetId((approval.rejectionEmailPresetId ?? "").trim());
        setSelectedApprovalPresetId((approval.approvalEmailPresetId ?? "").trim());
        // Reload/revalidation: keep template modals closed so "Choose a template" does not appear after refresh
        setRejectionTemplatePopoverActive(false);
        setApprovalTemplatePopoverActive(false);
    }, [initialSmtpSettings, initialCustomerApprovalSettings, actionData]);

    /** After a successful save, we use this as the baseline so Discard hides until the user edits again. */
    const lastSavedBaselineRef = useRef<{
        customerApprovalSettings: CustomerApprovalSettings;
        selectedDefault: string;
        enabledCodes: string[];
        customLanguages: LanguageOption[];
        translations: Record<string, Record<string, string>>;
        smtp: { host: string; port: number; secure: boolean; user: string; fromEmail: string; fromName: string };
        appSettingsUpdatedAt: string | null;
    } | null>(null);

    const [baselineVersion, setBaselineVersion] = useState(0);
    // Only update baseline when we receive a new success from the server (Save clicked).
    // Do NOT depend on customerApprovalSettings etc., or Reset would re-run this and overwrite baseline with reset state, hiding Discard.
    useEffect(() => {
        const data = actionData as { success?: boolean; settingsUpdatedAt?: string | null } | undefined;
        if (data?.success) {
            const at = data.settingsUpdatedAt ?? null;
            if (at) setLastSavedAtDisplay(at);
            lastSavedBaselineRef.current = {
                customerApprovalSettings: {
                    ...customerApprovalSettings,
                    rejectionEmailPresetId: (selectedRejectionPresetId ?? "").trim(),
                    approvalEmailPresetId: (selectedApprovalPresetId ?? "").trim(),
                },
                selectedDefault,
                enabledCodes: [...enabledCodes],
                customLanguages: [...customLanguages],
                translations: JSON.parse(JSON.stringify(translations)),
                smtp: {
                    host: smtpHost,
                    port: parseInt(smtpPort, 10) || 587,
                    secure: smtpSecure,
                    user: smtpUser,
                    fromEmail: smtpFromEmail,
                    fromName: smtpFromName,
                },
                appSettingsUpdatedAt: at,
            };
            setBaselineVersion((v) => v + 1);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only on actionData so Reset doesn't overwrite baseline
    }, [actionData]);

    const hasUnsavedChanges = useMemo(() => {
        const base = lastSavedBaselineRef.current;
        const initialApproval = base ? base.customerApprovalSettings : initialApprovalForCompare;
        const initialDefLang = base ? base.selectedDefault : defaultLanguage;
        const initialCodes = base ? new Set(base.enabledCodes) : new Set(languageOptions.map((l) => l.code));
        const initialTrans = base ? base.translations : initialTranslations;
        const initialSmtp = base
            ? base.smtp
            : {
                  host: initialSmtpSettings?.host ?? "",
                  port: initialSmtpSettings?.port ?? 587,
                  secure: initialSmtpSettings?.secure ?? false,
                  user: initialSmtpSettings?.user ?? "",
                  fromEmail: initialSmtpSettings?.fromEmail ?? "",
                  fromName: initialSmtpSettings?.fromName ?? "",
              };

        if (JSON.stringify(customerApprovalSettings) !== JSON.stringify(initialApproval)) return true;
        if (selectedDefault !== initialDefLang) return true;
        if (enabledCodes.size !== initialCodes.size || [...enabledCodes].some((c) => !initialCodes.has(c))) return true;
        if (JSON.stringify(translations) !== JSON.stringify(initialTrans)) return true;
        if (smtpHost !== initialSmtp.host) return true;
        if ((parseInt(smtpPort, 10) || 587) !== initialSmtp.port) return true;
        if (smtpSecure !== initialSmtp.secure) return true;
        if (smtpUser !== initialSmtp.user) return true;
        if (smtpFromEmail !== initialSmtp.fromEmail) return true;
        if (smtpFromName !== initialSmtp.fromName) return true;
        if ((smtpPassword || "").trim() !== "") return true;
        return false;
    // baselineVersion: re-run after save so we read updated lastSavedBaselineRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        customerApprovalSettings,
        selectedDefault,
        enabledCodes,
        translations,
        smtpHost,
        smtpPort,
        smtpSecure,
        smtpUser,
        smtpFromEmail,
        smtpFromName,
        smtpPassword,
        initialApprovalForCompare,
        defaultLanguage,
        languageOptions,
        initialTranslations,
        initialSmtpSettings,
        baselineVersion,
    ]);

    const handleDiscard = useCallback(() => {
        const base = lastSavedBaselineRef.current;
        if (base) {
            setCustomerApprovalSettings(base.customerApprovalSettings);
            setSelectedDefault(base.selectedDefault);
            setEnabledCodes(new Set(base.enabledCodes));
            setCustomLanguages(base.customLanguages);
            setTranslations(JSON.parse(JSON.stringify(base.translations)));
            setSmtpHost(base.smtp.host);
            setSmtpPort(String(base.smtp.port));
            setSmtpSecure(base.smtp.secure);
            setSmtpUser(base.smtp.user);
            setSmtpPassword("");
            setSmtpFromEmail(base.smtp.fromEmail);
            setSmtpFromName(base.smtp.fromName);
            setSelectedRejectionPresetId((base.customerApprovalSettings.rejectionEmailPresetId ?? "").trim());
            setSelectedApprovalPresetId((base.customerApprovalSettings.approvalEmailPresetId ?? "").trim());
            setLastSavedAtDisplay(base.appSettingsUpdatedAt);
        } else {
            setCustomerApprovalSettings(initialApprovalForCompare);
            setSelectedDefault(defaultLanguage);
            setEnabledCodes(new Set(languageOptions.map((l) => l.code)));
            setCustomLanguages(languageOptions.filter((l) => !CORE_CODE_SET.has(normalizeLangCode(l.code))));
            setTranslations(buildTranslationsFromLoader());
            if (initialSmtpSettings) {
                setSmtpHost(initialSmtpSettings.host ?? "");
                setSmtpPort(String(initialSmtpSettings.port ?? 587));
                setSmtpSecure(initialSmtpSettings.secure ?? false);
                setSmtpUser(initialSmtpSettings.user ?? "");
                setSmtpPassword("");
                setSmtpFromEmail(initialSmtpSettings.fromEmail ?? "");
                setSmtpFromName(initialSmtpSettings.fromName ?? "");
            }
            setSelectedRejectionPresetId((initialApprovalForCompare.rejectionEmailPresetId ?? "").trim());
            setSelectedApprovalPresetId((initialApprovalForCompare.approvalEmailPresetId ?? "").trim());
            setLastSavedAtDisplay(initialAppSettingsUpdatedAt ?? null);
        }
        setBaselineVersion((v) => v + 1);
    }, [
        initialApprovalForCompare,
        defaultLanguage,
        languageOptions,
        buildTranslationsFromLoader,
        initialSmtpSettings,
        initialAppSettingsUpdatedAt,
    ]);

    const handleSave = useCallback(async () => {
        try {
            await fetch("/app/api/template-selection", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    rejectionEmailPresetId: (selectedRejectionPresetId ?? "").trim(),
                    approvalEmailPresetId: (selectedApprovalPresetId ?? "").trim(),
                }),
            });
        } catch (e) {
            console.warn("[Settings] Failed to persist template selection before save:", e);
        }
        const formData = new FormData();
        formData.set("intent", "save");
        formData.set("defaultLanguage", selectedDefault);
        formData.set(
            "customerApprovalSettings",
            JSON.stringify({
                ...customerApprovalSettings,
                rejectionEmailPresetId: selectedRejectionPresetId,
                approvalEmailPresetId: selectedApprovalPresetId,
            })
        );
        formData.set("smtpHost", smtpHost);
        formData.set("smtpPort", smtpPort);
        formData.set("smtpSecure", smtpSecure ? "true" : "false");
        formData.set("smtpUser", smtpUser);
        formData.set("smtpPassword", smtpPassword);
        formData.set("smtpFromEmail", smtpFromEmail);
        formData.set("smtpFromName", smtpFromName);
        enabledCodes.forEach((code) => formData.append("languageEnabled[]", code));
        customLanguages.filter((l) => enabledCodes.has(l.code)).forEach((l) => {
            formData.append("customLangCode[]", l.code);
            formData.append("customLangName[]", l.name);
        });
        if (enabledCodes.size === 0) {
            formData.append("languageEnabled[]", "en");
        }
        formData.set("formTranslations", JSON.stringify(translations));
        submit(formData, { method: "POST" });
    }, [
        selectedRejectionPresetId,
        selectedApprovalPresetId,
        customerApprovalSettings,
        customLanguages,
        enabledCodes,
        selectedDefault,
        smtpFromEmail,
        smtpFromName,
        smtpHost,
        smtpPassword,
        smtpPort,
        smtpSecure,
        smtpUser,
        submit,
        translations,
    ]);

    const handleSaveBarSubmit = useCallback(
        (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (isSaving) return;
            void handleSave();
        },
        [isSaving, handleSave],
    );

    const handleSaveBarReset = useCallback(
        (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (isSaving) return;
            handleDiscard();
        },
        [isSaving, handleDiscard],
    );

    // Polaris-controlled fields do not reliably trigger the automatic data-save-bar; sync visibility explicitly.
    useEffect(() => {
        const shouldShow = hasUnsavedChanges && !isSaving;
        const saveBar = typeof window !== "undefined" ? window.shopify?.saveBar : undefined;
        if (!saveBar) return;
        let cancelled = false;
        const sync = () => {
            if (cancelled) return;
            const p = shouldShow ? saveBar.show(SETTINGS_SAVE_BAR_ID) : saveBar.hide(SETTINGS_SAVE_BAR_ID);
            void p.catch(() => {});
        };
        sync();
        const raf = requestAnimationFrame(sync);
        const t = window.setTimeout(sync, 400);
        return () => {
            cancelled = true;
            cancelAnimationFrame(raf);
            window.clearTimeout(t);
            void saveBar.hide(SETTINGS_SAVE_BAR_ID).catch(() => {});
        };
    }, [hasUnsavedChanges, isSaving]);

    const settingsSidebarNav = useMemo(
        () => [
            { id: "store-setting" as const, label: "Store", icon: StoreIcon },
            { id: "language" as const, label: "Language", icon: LanguageIcon },
            { id: "customer-approval" as const, label: "Approval", icon: CheckCircleIcon },
            { id: "email-setting" as const, label: "Email", icon: EmailIcon },
        ],
        [],
    );

    const activeMainSectionId = settingsSidebarNav[mainTabIndex]?.id ?? "store-setting";

    const handleSaveTranslations = () => {
        const formData = new FormData();
        formData.set("intent", "saveTranslations");
        formData.set("formTranslations", JSON.stringify(translations));
        submit(formData, { method: "POST" });
    };

    const updateTranslation = (lang: string, key: string, value: string) => {
        setTranslations((prev) => ({
            ...prev,
            [lang]: { ...(prev[lang] || {}), [key]: value },
        }));
    };

    const allLangsWithCustom = [...allLanguages, ...customLanguages];
    const filteredLangs = langSearchQuery.trim()
        ? allLangsWithCustom.filter(
              (l) =>
                  l.name.toLowerCase().includes(langSearchQuery.toLowerCase()) ||
                  l.code.toLowerCase().includes(langSearchQuery.toLowerCase())
          )
        : allLangsWithCustom;
    const enabledDefaultOptions = allLangsWithCustom
        .filter((l) => enabledCodes.has(l.code))
        .map((l) => ({ label: l.name, value: l.code }));
    const effectiveDefault = enabledCodes.has(selectedDefault)
        ? selectedDefault
        : Array.from(enabledCodes)[0] || "en";

    const storeUi = useMemo(
        () => getSettingsStoreUiStrings(effectiveDefault),
        [effectiveDefault]
    );

    useEffect(() => {
        setLastSavedAtDisplay(initialAppSettingsUpdatedAt ?? null);
    }, [initialAppSettingsUpdatedAt]);

    const lastSavedSubtitle =
        lastSavedAtDisplay != null
            ? `Last saved: ${new Date(lastSavedAtDisplay).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
            : undefined;

    return (
        <>
            <ui-save-bar id={SETTINGS_SAVE_BAR_ID}>
                <button
                    type="button"
                    {...({ variant: "primary" } as Record<string, unknown>)}
                    onClick={() => {
                        if (isSaving) return;
                        settingsFormRef.current?.requestSubmit();
                    }}
                >
                    Save
                </button>
                <button
                    type="button"
                    onClick={() => {
                        if (isSaving) return;
                        // Do not use form.reset(): programmatic reset may not fire onReset in embedded admin.
                        // flushSync so hasUnsavedChanges + save bar update in the same frame.
                        flushSync(() => {
                            handleDiscard();
                        });
                    }}
                >
                    Discard
                </button>
            </ui-save-bar>
            <div className="settings-page-wrapper">
            <Page
                title="Settings"
                subtitle={lastSavedSubtitle}
                backAction={{ content: "Back", onAction: handleBack }}
            >
                <form ref={settingsFormRef} onSubmit={handleSaveBarSubmit} onReset={handleSaveBarReset}>
                <div className="app-nav-tabs-mobile">
                <Box paddingBlockEnd="200">
                    <InlineStack gap="100" wrap>
                        <Button size="slim" onClick={() => navigate("/app")}>
                            Approvefy
                        </Button>
                        <Button size="slim" onClick={() => navigate("/app/customers")}>
                            Customers
                        </Button>
                        <Button size="slim" onClick={() => navigate("/app/form-config")}>
                            Form Builder
                        </Button>
                        <Button size="slim" variant="primary">
                            Settings
                        </Button>
                    </InlineStack>
                </Box>
                </div>
                {showToast && (
                    <Toast
                        content={
                            (actionData as { smtpPasswordVerified?: boolean } | undefined)?.smtpPasswordVerified
                                ? "Settings saved successfully. SMTP password verified successfully."
                                : "Settings saved successfully!"
                        }
                        onDismiss={() => setShowToast(false)}
                    />
                )}
                <div className="settings-layout-main">
                {translationsSavedToast && (
                    <Toast
                        content="Translations saved successfully! Form labels will update on the storefront."
                        onDismiss={() => setTranslationsSavedToast(false)}
                    />
                )}
                {(actionData as { error?: string })?.error && (
                    <Banner tone="critical" onDismiss={() => {}}>
                        {(actionData as { error?: string }).error}
                    </Banner>
                )}

                    <div className="settings-layout-row">
                        <aside className="settings-sidebar-nav" aria-label="Settings sections">
                            <BlockStack gap="100">
                                {settingsSidebarNav.map((item, index) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={
                                            item.id === "email-setting"
                                                ? mainTabIndex === index
                                                    ? "settings-sidebar-nav__item settings-sidebar-nav__item--parent-active"
                                                    : "settings-sidebar-nav__item"
                                                : mainTabIndex === index
                                                  ? "settings-sidebar-nav__item settings-sidebar-nav__item--selected"
                                                  : "settings-sidebar-nav__item"
                                        }
                                        onClick={() => {
                                            setMainTabIndex(index);
                                            if (item.id === "email-setting") setEmailSettingSubIndex(0);
                                        }}
                                    >
                                        <InlineStack gap="200" blockAlign="center" wrap={false}>
                                            <Icon
                                                source={item.icon}
                                                tone={mainTabIndex === index ? "base" : "subdued"}
                                            />
                                            <span className="settings-sidebar-nav__label">{item.label}</span>
                                        </InlineStack>
                                    </button>
                                ))}
                                {activeMainSectionId === "email-setting" && (
                                    <div className="settings-sidebar-sub">
                                        <button
                                            type="button"
                                            className={
                                                emailSettingSubIndex === 0
                                                    ? "settings-sidebar-nav__item settings-sidebar-nav__item--selected settings-sidebar-nav__item--sub"
                                                    : "settings-sidebar-nav__item settings-sidebar-nav__item--sub"
                                            }
                                            onClick={() => setEmailSettingSubIndex(0)}
                                        >
                                            <InlineStack gap="200" blockAlign="center" wrap={false}>
                                                <Icon
                                                    source={SendIcon}
                                                    tone={emailSettingSubIndex === 0 ? "base" : "subdued"}
                                                />
                                                <span className="settings-sidebar-nav__label">SMTP</span>
                                            </InlineStack>
                                        </button>
                                        <button
                                            type="button"
                                            className={
                                                emailSettingSubIndex === 1
                                                    ? "settings-sidebar-nav__item settings-sidebar-nav__item--selected settings-sidebar-nav__item--sub"
                                                    : "settings-sidebar-nav__item settings-sidebar-nav__item--sub"
                                            }
                                            onClick={() => setEmailSettingSubIndex(1)}
                                        >
                                            <InlineStack gap="200" blockAlign="center" wrap={false}>
                                                <Icon
                                                    source={ThemeTemplateIcon}
                                                    tone={emailSettingSubIndex === 1 ? "base" : "subdued"}
                                                />
                                                <span className="settings-sidebar-nav__label">Template</span>
                                            </InlineStack>
                                        </button>
                                    </div>
                                )}
                            </BlockStack>
                        </aside>
                    <div className="settings-content-container">
                        {activeMainSectionId === "language" && (
                            <>
                                <SectionCard title="Language Options">
                                    <BlockStack gap="400">
                                        <Text as="p" tone="subdued">
                                            Choose which languages to show in the registration form and set the default selection.
                                        </Text>

                                        <Card>
                                            <BlockStack gap="300">
                                                <Text as="h3" variant="headingSm">
                                                    Default language
                                                </Text>
                                                <BlockStack gap="200">
                                                    <Select
                                                        label="Default language"
                                                        options={enabledDefaultOptions.length > 0 ? enabledDefaultOptions : [{ label: "English", value: "en" }]}
                                                        value={effectiveDefault}
                                                        onChange={setSelectedDefault}
                                                    />
                                                    <Text as="p" tone="subdued" variant="bodySm">
                                                        Selected:{" "}
                                                        <Text as="span" variant="bodySm" fontWeight="semibold">
                                                            {enabledDefaultOptions.find((o) => o.value === effectiveDefault)?.label ?? "English"}
                                                        </Text>
                                                    </Text>
                                                </BlockStack>
                                            </BlockStack>
                                        </Card>

                                        <Card>
                                            <BlockStack gap="300">
                                                <InlineStack align="space-between" blockAlign="center">
                                                    <Text as="h3" variant="headingSm">
                                                        Active languages
                                                    </Text>
                                                    <Text as="span" tone="subdued" variant="bodySm">
                                                        {Array.from(enabledCodes).length > 0
                                                            ? `${Array.from(enabledCodes).length} language${Array.from(enabledCodes).length === 1 ? "" : "s"} selected`
                                                            : "Select languages"}
                                                    </Text>
                                                </InlineStack>
                                                <Popover
                                                    active={langDropdownActive}
                                                    activator={
                                                        <Button
                                                            onClick={() => setLangDropdownActive(!langDropdownActive)}
                                                            disclosure={langDropdownActive ? "up" : "down"}
                                                        >
                                                            Manage languages
                                                        </Button>
                                                    }
                                                    autofocusTarget="first-node"
                                                    onClose={() => {
                                                        setLangDropdownActive(false);
                                                        setLangSearchQuery("");
                                                    }}
                                                >
                                                    <div style={{ width: 320 }}>
                                                        <Box padding="300" paddingBlockEnd="0">
                                                            <TextField
                                                                label="Search languages"
                                                                labelHidden
                                                                value={langSearchQuery}
                                                                onChange={setLangSearchQuery}
                                                                placeholder="Search by name or code"
                                                                autoComplete="off"
                                                                clearButton
                                                                onClearButtonClick={() => setLangSearchQuery("")}
                                                                prefix={<Icon source={SearchIcon} tone="base" />}
                                                            />
                                                        </Box>
                                                        <div style={{ maxHeight: 280, overflowY: "auto" }}>
                                                            {filteredLangs.length > 0 ? (
                                                                <OptionList
                                                                    options={filteredLangs.map((l) => ({
                                                                        value: l.code,
                                                                        label: `${l.name} (${l.code})`,
                                                                        disabled: false,
                                                                    }))}
                                                                    selected={Array.from(enabledCodes)}
                                                                    allowMultiple
                                                                    onChange={(selected) => {
                                                                        const codes = selected.map((c) => normalizeLangCode(c)).filter(Boolean);
                                                                        const next = codes.length > 0 ? new Set(codes) : new Set(["en"]);
                                                                        setEnabledCodes(next);
                                                                    }}
                                                                />
                                                            ) : (
                                                                <EmptySearchResult
                                                                    title="No languages found"
                                                                    description="Try searching for something else, or add a custom language below."
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                </Popover>
                                                <Box background="bg-surface-secondary" borderRadius="200" padding="300">
                                                    <Text as="p" tone="subdued" variant="bodySm">
                                                        Selected: {Array.from(enabledCodes)
                                                            .map((c) => allLangsWithCustom.find((l) => l.code === c)?.name ?? c)
                                                            .join(", ")}
                                                    </Text>
                                                </Box>
                                            </BlockStack>
                                        </Card>

                                        <Card>
                                            <BlockStack gap="300">
                                                <Text as="h3" variant="headingSm">
                                                    Add custom language
                                                </Text>
                                                <Text as="p" tone="subdued" variant="bodySm">
                                                    Add a manual language code and name if it is not listed above.
                                                </Text>
                                                <InlineStack gap="300" blockAlign="end" wrap>
                                                    <Box minWidth="140px">
                                                        <TextField
                                                            label="Code (e.g. fr, de)"
                                                            value={newLangCode}
                                                            onChange={setNewLangCode}
                                                            placeholder="fr"
                                                            autoComplete="off"
                                                        />
                                                    </Box>
                                                    <Box minWidth="220px">
                                                        <TextField
                                                            label="Language name"
                                                            value={newLangName}
                                                            onChange={setNewLangName}
                                                            placeholder="French"
                                                            autoComplete="off"
                                                        />
                                                    </Box>
                                                    <Button variant="primary" onClick={handleAddCustomLanguage}>
                                                        Add language
                                                    </Button>
                                                </InlineStack>
                                                {customLanguages.length > 0 && (
                                                    <BlockStack gap="200">
                                                        <Text as="p" variant="bodySm" tone="subdued">
                                                            Custom languages
                                                        </Text>
                                                        <BlockStack gap="200">
                                                            {customLanguages.map((l) => (
                                                                <Box
                                                                    key={l.code}
                                                                    background="bg-surface-secondary"
                                                                    borderRadius="200"
                                                                    padding="300"
                                                                >
                                                                    <InlineStack align="space-between" blockAlign="center">
                                                                        <Text as="span" variant="bodyMd">
                                                                            {l.name} ({l.code})
                                                                        </Text>
                                                                        <Button
                                                                            type="button"
                                                                            variant="plain"
                                                                            tone="critical"
                                                                            onClick={() => handleRemoveCustomLanguage(l.code)}
                                                                        >
                                                                            Remove
                                                                        </Button>
                                                                    </InlineStack>
                                                                </Box>
                                                            ))}
                                                        </BlockStack>
                                                    </BlockStack>
                                                )}
                                            </BlockStack>
                                        </Card>
                                    </BlockStack>
                                    {enabledCodes.size === 0 && (
                                        <Banner tone="warning" onDismiss={() => {}}>
                                            At least one language must be enabled. English will be used if none selected.
                                        </Banner>
                                    )}
                                </SectionCard>

                                <SectionCard title="Form Translations">
                                    <p style={{ marginBottom: 16, color: "#6d7175" }}>
                                        Translate registration form labels and messages. Edit manually and save.
                                    </p>
                                    <Tabs
                                        tabs={enabledCodesList.map((code) => {
                                            const langName = allLangsWithCustom.find((l) => l.code === code)?.name || code;
                                            return { id: code, content: langName };
                                        })}
                                        selected={Math.max(0, enabledCodesList.indexOf(selectedLangTab))}
                                        onSelect={(index) => setSelectedLangTab(enabledCodesList[index] ?? "en")}
                                    />
                                    {enabledCodes.size === 0 && (
                                        <Banner tone="warning" onDismiss={() => {}}>
                                            At least one language must be enabled. English will be used if none selected.
                                        </Banner>
                                    )}
                                    <div style={{ marginTop: 16, marginBottom: 12 }}>
                                        <TextField
                                            label="Search fields"
                                            labelHidden
                                            value={translationSearch}
                                            onChange={setTranslationSearch}
                                            placeholder="Search by label or key..."
                                            autoComplete="off"
                                            prefix={<Icon source={SearchIcon} tone="base" />}
                                            clearButton
                                            onClearButtonClick={() => setTranslationSearch("")}
                                        />
                                    </div>
                                    <div style={{ marginTop: 16 }}>
                                        {enabledCodesList.map((code) => (
                                            <div key={code} style={{ display: code === selectedLangTab ? "block" : "none" }}>
                                                <BlockStack gap="400">
                                                    {filteredTranslationKeys.map((key) => {
                                                        const englishText = defaultTranslationsEn[key] ?? key.replace(/_/g, " ");
                                                        return (
                                                            <TextField
                                                                key={key}
                                                                label={englishText}
                                                                helpText={code !== "en" ? `Key: ${key}` : undefined}
                                                                value={(translations[code] || {})[key] ?? (defaultTranslationsByLang[code]?.[key] ?? defaultTranslationsEn[key]) ?? ""}
                                                                onChange={(v) => updateTranslation(code, key, v)}
                                                                autoComplete="off"
                                                                placeholder={code !== "en" ? englishText : undefined}
                                                            />
                                                        );
                                                    })}
                                                </BlockStack>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ marginTop: 20 }}>
                                        <button
                                            type="button"
                                            onClick={handleSaveTranslations}
                                            disabled={isSaving}
                                            style={{
                                                padding: "10px 20px",
                                                background: "#008060",
                                                color: "white",
                                                border: "none",
                                                borderRadius: 6,
                                                cursor: isSaving ? "not-allowed" : "pointer",
                                                fontWeight: 600,
                                            }}
                                        >
                                            Save translations
                                        </button>
                                    </div>
                                </SectionCard>
                            </>
                        )}

                        {activeMainSectionId === "customer-approval" && (
                            <SectionCard title="Customer approval options">
                                <p style={{ marginBottom: 16, color: "#6d7175" }}>
                                    Configure how new registrations are approved and what happens after form submit.
                                </p>
                                <BlockStack gap="400">
                                    <ChoiceList
                                        title="Approval mode"
                                        choices={[
                                            { label: "Manual approval", value: "manual" },
                                            { label: "Auto approval", value: "auto" },
                                        ]}
                                        selected={[customerApprovalSettings.approvalMode]}
                                        onChange={(selected) =>
                                            setCustomerApprovalSettings((prev) => ({
                                                ...prev,
                                                approvalMode: (selected[0] as "manual" | "auto") || "manual",
                                            }))
                                        }
                                    />
                                    <TextField
                                        label="Approved customer tag"
                                        value={customerApprovalSettings.approvedTag}
                                        onChange={(val) =>
                                            setCustomerApprovalSettings((prev) => ({ ...prev, approvedTag: val }))
                                        }
                                        placeholder="status:approved"
                                        autoComplete="off"
                                        helpText="Customers with this Shopify customer tag are treated as approved. The storefront uses this to hide the registration form and allow approved-customer flows."
                                    />
                                    <ChoiceList
                                        title="After submit"
                                        choices={[
                                            { label: "Redirect to URL", value: "redirect" },
                                            { label: "Clear form, and show messages", value: "message" },
                                        ]}
                                        selected={[customerApprovalSettings.afterSubmit]}
                                        onChange={(selected) =>
                                            setCustomerApprovalSettings((prev) => ({
                                                ...prev,
                                                afterSubmit: (selected[0] as "redirect" | "message") || "message",
                                            }))
                                        }
                                    />
                                    {customerApprovalSettings.afterSubmit === "redirect" && (
                                        <TextField
                                            label="Redirect URL"
                                            value={customerApprovalSettings.redirectUrl}
                                            onChange={(val) =>
                                                setCustomerApprovalSettings((prev) => ({ ...prev, redirectUrl: val }))
                                            }
                                            placeholder="https://your-store.com/thank-you"
                                            autoComplete="off"
                                            type="url"
                                            helpText="Prefer a page like /pages/thank-you. /account/login and /account/register on your storefront are allowed. Other /account paths (account home, orders, checkout callbacks) are ignored so customers are not sent into a broken sign-in flow."
                                        />
                                    )}
                                    {customerApprovalSettings.afterSubmit === "message" && (
                                        <TextField
                                            label="Thank you message"
                                            value={customerApprovalSettings.successMessage}
                                            onChange={(val) =>
                                                setCustomerApprovalSettings((prev) => ({ ...prev, successMessage: val }))
                                            }
                                            multiline={4}
                                            placeholder="Registration successful! Your account is pending approval. You will receive an email once approved."
                                            autoComplete="off"
                                            helpText="Shown after successful registration when form is cleared. You can use simple HTML (e.g. <strong>bold</strong>)."
                                        />
                                    )}
                                    <TextField
                                        label="Pending approval screen title"
                                        value={customerApprovalSettings.pendingRegistrationScreenTitle}
                                        onChange={(val) =>
                                            setCustomerApprovalSettings((prev) => ({
                                                ...prev,
                                                pendingRegistrationScreenTitle: val,
                                            }))
                                        }
                                        multiline={2}
                                        autoComplete="off"
                                        helpText="Heading on the centered card when a registration is waiting for approval (e.g. logged-in customer on /account/register). Plain text only. Clear both fields and save to use form translations for this card."
                                    />
                                    <TextField
                                        label="Pending approval screen message"
                                        value={customerApprovalSettings.pendingRegistrationScreenMessage}
                                        onChange={(val) =>
                                            setCustomerApprovalSettings((prev) => ({
                                                ...prev,
                                                pendingRegistrationScreenMessage: val,
                                            }))
                                        }
                                        multiline={4}
                                        autoComplete="off"
                                        helpText="Body text under the title on that same card. Clear both fields and save to use the storefront language strings (Settings → Form translations) instead."
                                    />
                                </BlockStack>
                            </SectionCard>
                        )}
                        {activeMainSectionId === "email-setting" && (
                            <div className="settings-email-subcard">
                            <SectionCard title={emailSettingSubIndex === 0 ? "SMTP" : "Email templates"}>
                                        {emailSettingSubIndex === 0 ? (
                                <BlockStack gap="400">
                                    <Text as="p" variant="bodyMd" tone="subdued">
                                        Connect your email server to send rejection emails. Use Gmail for a quick setup or enter your own SMTP details.
                                    </Text>
                                    <Banner tone="info" onDismiss={() => {}}>
                                        <p style={{ margin: 0 }}>
                                            <strong>Gmail?</strong> Click &quot;Use Gmail&quot; below, then use a <strong>Google App Password</strong> (not your normal password). <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer">Create App Password →</a>
                                        </p>
                                    </Banner>
                                    <Text as="p" variant="bodyMd" tone="subdued">
                                        <strong>Custom domain email</strong> (e.g. info@yourstore.com): Use your provider’s SMTP host (e.g. smtp.hostinger.com), set <strong>From email</strong> and <strong>Username</strong> to your full address (e.g. info@yourstore.com), and use the password from your email or hosting provider. Enable TLS if your provider requires it (port 465 or 587).
                                    </Text>
                                    <InlineStack gap="200" blockAlign="center" wrap>
                                        <Button
                                            variant="secondary"
                                            onClick={() => {
                                                setSmtpHost("smtp.gmail.com");
                                                setSmtpPort("587");
                                                setSmtpSecure(true);
                                                if (smtpFromEmail && /@gmail\.com$/i.test(smtpFromEmail.trim())) {
                                                    setSmtpUser(smtpFromEmail.trim());
                                                }
                                            }}
                                        >
                                            Use Gmail
                                        </Button>
                                        <Text as="span" tone="subdued" variant="bodySm">Fills host, port 587, TLS. Then add your Gmail and App Password below.</Text>
                                    </InlineStack>
                                    <BlockStack gap="300">
                                        <TextField
                                            label="SMTP host"
                                            value={smtpHost}
                                            onChange={setSmtpHost}
                                            placeholder="e.g. smtp.gmail.com"
                                            autoComplete="off"
                                            helpText="Leave empty if you don't want to save SMTP."
                                        />
                                        <InlineStack gap="300" blockAlign="start">
                                            <TextField
                                                label="Port"
                                                type="number"
                                                value={smtpPort}
                                                onChange={setSmtpPort}
                                                autoComplete="off"
                                            />
                                            <Box paddingBlockStart="600">
                                                <Checkbox
                                                    label="Use TLS (secure)"
                                                    checked={smtpSecure}
                                                    onChange={setSmtpSecure}
                                                />
                                            </Box>
                                        </InlineStack>
                                        <TextField
                                            label="From email"
                                            type="email"
                                            value={smtpFromEmail}
                                            onChange={(val) => {
                                                setSmtpFromEmail(val);
                                                if (val && /@gmail\.com$/i.test(val.trim()) && !smtpHost) {
                                                    setSmtpHost("smtp.gmail.com");
                                                    setSmtpPort("587");
                                                    setSmtpSecure(true);
                                                    setSmtpUser(val.trim());
                                                }
                                            }}
                                            placeholder="you@gmail.com or noreply@yourstore.com"
                                            autoComplete="off"
                                            helpText="Sender address. Use your full Gmail address for Gmail, or your full custom-domain address (e.g. info@yourstore.com) for your provider."
                                        />
                                        <TextField
                                            label="Username"
                                            value={smtpUser}
                                            onChange={setSmtpUser}
                                            placeholder="Usually same as From email (Gmail or custom domain)"
                                            autoComplete="off"
                                            helpText={/@gmail\.com$/i.test(smtpFromEmail.trim()) ? "Use your full Gmail (e.g. you@gmail.com)." : "For custom domain, use the same address as From email (e.g. info@yourstore.com)."}
                                        />
                                        <TextField
                                            label="Password"
                                            type="password"
                                            value={smtpPassword}
                                            onChange={setSmtpPassword}
                                            placeholder={/@gmail\.com$/i.test(smtpFromEmail.trim()) ? "Paste your Gmail App Password here" : "Leave blank to keep existing"}
                                            autoComplete="new-password"
                                            helpText={/@gmail\.com$/i.test(smtpFromEmail.trim()) ? "Get one: Google Account → Security → 2-Step Verification → App passwords." : undefined}
                                        />
                                        <TextField
                                            label="From name"
                                            value={smtpFromName}
                                            onChange={setSmtpFromName}
                                            placeholder="e.g. Your Store"
                                            autoComplete="off"
                                        />
                                    </BlockStack>
                                    <Box paddingBlockStart="200">
                                        <Text as="p" variant="bodyMd" tone="subdued">
                                            Click <strong>Save</strong> at the top of this page to apply your SMTP settings.
                                        </Text>
                                    </Box>
                                </BlockStack>
                                        ) : isTemplateSelectionLoading ? (
                                            <Box
                                                role="status"
                                                aria-label="Loading email templates"
                                                paddingBlockStart="100"
                                            >
                                                <div className="flex flex-col gap-5">
                                                    <div className="flex items-center gap-4">
                                                        <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
                                                        <div className="min-w-0 flex-1 space-y-2">
                                                            <Skeleton className="h-4 w-full max-w-[250px]" />
                                                            <Skeleton className="h-4 w-full max-w-[200px]" />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-3 rounded-md border border-[color:var(--p-color-border,#c9cccf)] p-4">
                                                        <Skeleton className="h-4 w-full max-w-md" />
                                                        <Skeleton className="h-4 w-full max-w-lg" />
                                                    </div>
                                                    <div className="space-y-3 rounded-md border border-[color:var(--p-color-border,#c9cccf)] p-4">
                                                        <Skeleton className="h-4 w-full max-w-sm" />
                                                        <Skeleton className="h-4 w-full max-w-xl" />
                                                        <Skeleton className="h-4 w-full max-w-lg" />
                                                    </div>
                                                </div>
                                            </Box>
                                        ) : (
                                <BlockStack gap="500">
                                    <Text as="p" variant="bodyMd" tone="subdued">
                                        Customize the emails sent when you approve or reject a customer. Expand each section to edit the template.
                                    </Text>
                                    <Banner tone="info" title="Important">
                                        Approval and rejection emails are sent only when <strong>Send email</strong> is checked for that template. If the checkbox is unchecked, no email will be sent for that action.
                                    </Banner>

                                    <BlockStack gap="400">
                                        <Box
                                            background="bg-surface"
                                            borderWidth="025"
                                            borderColor="border"
                                            borderRadius="200"
                                            padding="0"
                                            minHeight="0"
                                        >
                                            <div className="settings-email-collapsible-header">
                                                <button
                                                    type="button"
                                                    className="settings-email-collapsible-trigger"
                                                    onClick={() => setApprovedSectionOpen(!approvedSectionOpen)}
                                                    aria-expanded={approvedSectionOpen}
                                                    aria-controls="template-approved"
                                                >
                                                    <Text as="span" variant="bodyMd" fontWeight="medium">
                                                        Customer approved email
                                                    </Text>
                                                    <Icon source={approvedSectionOpen ? ChevronUpIcon : ChevronDownIcon} tone="subdued" />
                                                </button>
                                                <div className="settings-email-send-toggle" onClick={(e) => e.stopPropagation()} role="presentation">
                                                    <Text as="span" variant="bodySm" tone="subdued">Send email</Text>
                                                    <Checkbox
                                                        label="Send approval email"
                                                        labelHidden
                                                        checked={customerApprovalSettings.emailOnApprove}
                                                        onChange={(val) =>
                                                            setCustomerApprovalSettings((prev) => ({ ...prev, emailOnApprove: val }))
                                                        }
                                                    />
                                                </div>
                                            </div>
                                            <Collapsible open={approvedSectionOpen} id="template-approved">
                                            <Box paddingBlockStart="0" paddingBlockEnd="400" paddingInlineStart="300" paddingInlineEnd="300">
                                                <Divider />
                                                <Box paddingBlockStart="400">
                                                <div className="settings-template-layout">
                                                    <div className="settings-template-customize">
                                                        <BlockStack gap="200">
                                                            <div>
                                                                <span className="Polaris-Label__Text" style={{ display: "block", marginBottom: 4 }}>
                                                                    Choose a template
                                                                </span>
                                                                <Button
                                                                    onClick={() => setApprovalTemplatePopoverActive(true)}
                                                                >
                                                                    {selectedApprovalPresetId
                                                                        ? (APPROVAL_EMAIL_PRESETS.find((p) => p.id === selectedApprovalPresetId)?.name ?? "Custom")
                                                                        : "Custom (edit below)"}
                                                                </Button>
                                                                <Modal
                                                                    open={approvalTemplatePopoverActive}
                                                                    onClose={() => setApprovalTemplatePopoverActive(false)}
                                                                    title="Choose a template"
                                                                    size="large"
                                                                    primaryAction={{
                                                                        content: "Apply template",
                                                                        onAction: () => {
                                                                            setApprovalTemplatePopoverActive(false);
                                                                        },
                                                                    }}
                                                                    secondaryActions={[
                                                                        { content: "Cancel", onAction: () => setApprovalTemplatePopoverActive(false) },
                                                                    ]}
                                                                >
                                                                    <div className="settings-template-chooser-popover settings-template-chooser-modal">
                                                                        <div className="settings-template-chooser-sidebar">
                                                                            <OptionList
                                                                                options={[
                                                                                    { value: "", label: "Custom (edit below)" },
                                                                                    ...APPROVAL_EMAIL_PRESETS.map((p) => ({ value: p.id, label: p.name })),
                                                                                ]}
                                                                                selected={[selectedApprovalPresetId ?? ""]}
                                                                                onChange={(selected) => {
                                                                                    const id = (selected[0] ?? "").trim();
                                                                                    setSelectedApprovalPresetId(id);
                                                                                    if (id) {
                                                                                        const preset = getApprovalPresetById(id);
                                                                                        if (preset) {
                                                                                            setCustomerApprovalSettings((prev) => ({
                                                                                                ...prev,
                                                                                                approveEmailSubject: preset.subject,
                                                                                                approveEmailBody: preset.bodyHtml,
                                                                                                approveEmailFooterText: preset.footerText,
                                                                                                approveEmailButtonText: preset.buttonText,
                                                                                                approveEmailButtonUrl: preset.buttonUrl,
                                                                                                approveEmailHeaderTitle: preset.headerTitle ?? "",
                                                                                                approveEmailHeaderTitleSize: preset.headerTitleSize ?? "24",
                                                                                                approveEmailHeaderTitleColor: preset.headerTitleColor ?? "",
                                                                                                approveEmailHeaderBgColor: preset.headerBgColor ?? "",
                                                                                                approveEmailLogoAlign: preset.logoAlign ?? "left",
                                                                                                approveEmailButtonColor: preset.buttonColor ?? "",
                                                                                                approveEmailButtonTextColor: preset.buttonTextColor ?? "",
                                                                                                approveEmailButtonAlign: preset.buttonAlign ?? "left",
                                                                                            }));
                                                                                        }
                                                                                    }
                                                                                }}
                                                                            />
                                                                        </div>
                                                                        <div className="settings-template-chooser-main">
                                                                            <div className="settings-template-chooser-preview-label">
                                                                                <Text as="p" variant="bodySm" fontWeight="semibold">
                                                                                    Email preview
                                                                                </Text>
                                                                                <span className="settings-template-chooser-preview-badge">Approximate</span>
                                                                            </div>
                                                                            <div className="settings-email-preview-frame">
                                                                                <div className="settings-email-preview-card">
                                                                                    {(customerApprovalSettings.approveEmailHeaderTitle ?? "").trim() && (() => {
                                                                                        const hb = (customerApprovalSettings.approveEmailHeaderBgColor ?? "").trim();
                                                                                        const hasHb = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hb);
                                                                                        const align =
                                                                                            customerApprovalSettings.approveEmailLogoAlign === "center" ||
                                                                                            customerApprovalSettings.approveEmailLogoAlign === "right"
                                                                                                ? customerApprovalSettings.approveEmailLogoAlign
                                                                                                : "left";
                                                                                        return (
                                                                                            <div
                                                                                                className="settings-email-preview-card-header"
                                                                                                {...(hasHb ? { "data-has-bg": "true" } : {})}
                                                                                                style={{
                                                                                                    textAlign: align,
                                                                                                    ...(hasHb ? { backgroundColor: hb, borderBottom: "1px solid rgba(15,23,42,0.06)" } : {}),
                                                                                                }}
                                                                                            >
                                                                                                <span
                                                                                                    style={{
                                                                                                        fontSize: `${Number(customerApprovalSettings.approveEmailHeaderTitleSize) || 24}px`,
                                                                                                        fontWeight: 700,
                                                                                                        letterSpacing: "-0.02em",
                                                                                                        color: /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(
                                                                                                            (customerApprovalSettings.approveEmailHeaderTitleColor ?? "").trim(),
                                                                                                        )
                                                                                                            ? (customerApprovalSettings.approveEmailHeaderTitleColor ?? "").trim()
                                                                                                            : "#0f172a",
                                                                                                    }}
                                                                                                >
                                                                                                    {customerApprovalSettings.approveEmailHeaderTitle}
                                                                                                </span>
                                                                                            </div>
                                                                                        );
                                                                                    })()}
                                                                                    <div className="settings-email-preview-card-body">
                                                                                        <div
                                                                                            className="settings-email-preview-body"
                                                                                            dangerouslySetInnerHTML={{
                                                                                                __html: (() => {
                                                                                                    const previewVars = {
                                                                                                        email: "customer@example.com",
                                                                                                        shopName: initialStoreName ?? "Store",
                                                                                                        shopDomain: initialStoreDomain ?? "",
                                                                                                        customerFirstName: "Customer",
                                                                                                        activationUrl: "https://example.com/activate",
                                                                                                        currentYear: String(new Date().getFullYear()),
                                                                                                    };
                                                                                                    const raw = replaceLiquidPlaceholders(customerApprovalSettings.approveEmailBody || DEFAULT_APPROVE_BODY, previewVars);
                                                                                                    if (raw.includes("<")) return raw;
                                                                                                    return raw
                                                                                                        .split("\n")
                                                                                                        .map((line) =>
                                                                                                            line.trim()
                                                                                                                ? `<p style="margin:0 0 10px;font-size:15px;line-height:1.65">${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`
                                                                                                                : "<br/>",
                                                                                                        )
                                                                                                        .join("");
                                                                                                })(),
                                                                                            }}
                                                                                        />
                                                                                        {customerApprovalSettings.approveEmailButtonText.trim() && (
                                                                                            <div className="settings-email-preview-cta-wrap" style={{ textAlign: (customerApprovalSettings.approveEmailButtonAlign === "center" || customerApprovalSettings.approveEmailButtonAlign === "right") ? customerApprovalSettings.approveEmailButtonAlign : "left" }}>
                                                                                                <span
                                                                                                    className="settings-email-preview-cta"
                                                                                                    style={{
                                                                                                        background: /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test((customerApprovalSettings.approveEmailButtonColor ?? "").trim())
                                                                                                            ? (customerApprovalSettings.approveEmailButtonColor ?? "").trim()
                                                                                                            : "#16a34a",
                                                                                                        color: /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test((customerApprovalSettings.approveEmailButtonTextColor ?? "").trim())
                                                                                                            ? (customerApprovalSettings.approveEmailButtonTextColor ?? "").trim()
                                                                                                            : "#fff",
                                                                                                    }}
                                                                                                >
                                                                                                    {customerApprovalSettings.approveEmailButtonText}
                                                                                                </span>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </Modal>
                                                                <p className="Polaris-Labelled__HelpText" style={{ marginTop: 4, fontSize: 12, color: "#6d7175" }}>
                                                                    Pick a ready-made approval email, then edit if needed.
                                                                </p>
                                                            </div>
                                                            <InlineStack gap="300" blockAlign="end" wrap>
                                                                <Box minWidth="min(100%, 280px)">
                                                                    <TextField
                                                                        label="Logo URL"
                                                                        value={customerApprovalSettings.approveEmailLogoUrl}
                                                                        onChange={(val) => {
                                                                            setSelectedApprovalPresetId("");
                                                                            setCustomerApprovalSettings((prev) => ({ ...prev, approveEmailLogoUrl: val }));
                                                                        }}
                                                                        placeholder="https://... (PNG, JPG or WebP)"
                                                                        autoComplete="off"
                                                                        helpText="Only PNG, JPG or WebP image URLs. SVG is not allowed."
                                                                        error={(() => {
                                                                            const u = (customerApprovalSettings.approveEmailLogoUrl ?? "").trim();
                                                                            if (!u) return undefined;
                                                                            if (isSvgLogoUrl(u)) return "SVG is not allowed. Use PNG, JPG or WebP only.";
                                                                            if (!isAllowedLogoUrl(u)) return "Use a PNG, JPG or WebP image URL only.";
                                                                            return undefined;
                                                                        })()}
                                                                    />
                                                                </Box>
                                                                {initialStoreLogoUrl && !isSvgLogoUrl(initialStoreLogoUrl) && (
                                                                    <Button
                                                                        variant="secondary"
                                                                        onClick={() =>
                                                                            setCustomerApprovalSettings((prev) => ({ ...prev, approveEmailLogoUrl: initialStoreLogoUrl ?? "" }))
                                                                        }
                                                                    >
                                                                        Use store logo
                                                                    </Button>
                                                                )}
                                                            </InlineStack>
                                                            <InlineStack gap="400" wrap blockAlign="end">
                                                                <div style={{ width: "30%", minWidth: 200 }}>
                                                                    <RangeSlider
                                                                        label="Logo size"
                                                                        value={Math.min(400, Math.max(80, Number(customerApprovalSettings.approveEmailLogoSize) || 200))}
                                                                        min={80}
                                                                        max={400}
                                                                        step={10}
                                                                        output
                                                                        suffix="px"
                                                                        helpText="80–400 px"
                                                                        onChange={(val) => {
                                                                            setSelectedApprovalPresetId("");
                                                                            setCustomerApprovalSettings((prev) => ({ ...prev, approveEmailLogoSize: String(typeof val === "number" ? val : val[0]) }));
                                                                        }}
                                                                    />
                                                                </div>
                                                                <div style={{ width: "30%", minWidth: 200 }}>
                                                                    <Select
                                                                        label="Logo alignment"
                                                                        options={[
                                                                            { label: "Left", value: "left" },
                                                                            { label: "Center", value: "center" },
                                                                            { label: "Right", value: "right" },
                                                                        ]}
                                                                        value={customerApprovalSettings.approveEmailLogoAlign || "left"}
                                                                        onChange={(val) => {
                                                                            setSelectedApprovalPresetId("");
                                                                            setCustomerApprovalSettings((prev) => ({ ...prev, approveEmailLogoAlign: (val as "left" | "center" | "right") || "left" }));
                                                                        }}
                                                                    />
                                                                </div>
                                                            </InlineStack>
                                                            <TextField
                                                                label="Header title"
                                                                value={customerApprovalSettings.approveEmailHeaderTitle}
                                                                onChange={(val) => {
                                                                    setSelectedApprovalPresetId("");
                                                                    setCustomerApprovalSettings((prev) => ({ ...prev, approveEmailHeaderTitle: val }));
                                                                }}
                                                                placeholder="e.g. Your Account Has Been Approved"
                                                                autoComplete="off"
                                                            />
                                                            <InlineStack gap="300" wrap>
                                                                <Box minWidth="min(100%, 140px)">
                                                                    <Select
                                                                        label="Header title size"
                                                                        options={[
                                                                            { label: "16px", value: "16" },
                                                                            { label: "18px", value: "18" },
                                                                            { label: "20px", value: "20" },
                                                                            { label: "24px", value: "24" },
                                                                            { label: "28px", value: "28" },
                                                                        ]}
                                                                        value={customerApprovalSettings.approveEmailHeaderTitleSize || "24"}
                                                                        onChange={(val) => {
                                                                            setSelectedApprovalPresetId("");
                                                                            setCustomerApprovalSettings((prev) => ({ ...prev, approveEmailHeaderTitleSize: val }));
                                                                        }}
                                                                    />
                                                                </Box>
                                                                <Box minWidth="min(100%, 180px)">
                                                                    <ColorPickerField
                                                                        label="Header title color"
                                                                        value={customerApprovalSettings.approveEmailHeaderTitleColor ?? ""}
                                                                        onChange={(val) => {
                                                                            setSelectedApprovalPresetId("");
                                                                            setCustomerApprovalSettings((prev) => ({ ...prev, approveEmailHeaderTitleColor: val }));
                                                                        }}
                                                                        helpText="Empty = #111"
                                                                    />
                                                                </Box>
                                                                <Box minWidth="min(100%, 180px)">
                                                                    <ColorPickerField
                                                                        label="Header background"
                                                                        value={customerApprovalSettings.approveEmailHeaderBgColor ?? ""}
                                                                        onChange={(val) => {
                                                                            setSelectedApprovalPresetId("");
                                                                            setCustomerApprovalSettings((prev) => ({ ...prev, approveEmailHeaderBgColor: val }));
                                                                        }}
                                                                        helpText="Empty = none"
                                                                    />
                                                                </Box>
                                                            </InlineStack>
                                                            <TextField
                                                                label="Subject"
                                                                value={customerApprovalSettings.approveEmailSubject}
                                                                onChange={(val) => {
                                                                    setSelectedApprovalPresetId("");
                                                                    setCustomerApprovalSettings((prev) => ({ ...prev, approveEmailSubject: val }));
                                                                }}
                                                                placeholder={DEFAULT_APPROVE_SUBJECT}
                                                                autoComplete="off"
                                                            />
                                                            <DeferredRichTextEditor
                                                                label="Body"
                                                                value={customerApprovalSettings.approveEmailBody}
                                                                onChange={(html) => {
                                                                    setSelectedApprovalPresetId("");
                                                                    setCustomerApprovalSettings((prev) => ({ ...prev, approveEmailBody: html }));
                                                                }}
                                                                placeholder={DEFAULT_APPROVE_BODY}
                                                                minHeight={160}
                                                                helpText="Liquid: {{ shop.name }}, {{ shop.url }}, {{ customer.first_name }}, {{ activation_url }} (Shopify customer login / account invite link). Click Save to apply."
                                                            />
                                                            <InlineStack gap="300" blockAlign="start" wrap>
                                                                <TextField
                                                                    label="Button text"
                                                                    value={customerApprovalSettings.approveEmailButtonText}
                                                                    onChange={(val) => {
                                                                        setSelectedApprovalPresetId("");
                                                                        setCustomerApprovalSettings((prev) => ({ ...prev, approveEmailButtonText: val }));
                                                                    }}
                                                                    placeholder="e.g. Login"
                                                                    autoComplete="off"
                                                                />
                                                                <TextField
                                                                    label="Button URL"
                                                                    value={customerApprovalSettings.approveEmailButtonUrl}
                                                                    onChange={(val) => {
                                                                        setSelectedApprovalPresetId("");
                                                                        setCustomerApprovalSettings((prev) => ({ ...prev, approveEmailButtonUrl: val }));
                                                                    }}
                                                                    placeholder="Leave empty to use the default customer login link"
                                                                    autoComplete="off"
                                                                    helpText="Use {{ activation_url }} or leave empty to send the Shopify customer login link."
                                                                />
                                                            </InlineStack>
                                                            <InlineStack gap="300" wrap>
                                                                <ColorPickerField
                                                                    label="Button color"
                                                                    value={customerApprovalSettings.approveEmailButtonColor ?? ""}
                                                                    onChange={(val) => {
                                                                        setSelectedApprovalPresetId("");
                                                                        setCustomerApprovalSettings((prev) => ({ ...prev, approveEmailButtonColor: val }));
                                                                    }}
                                                                    helpText="Empty = green (#16a34a)"
                                                                />
                                                                <ColorPickerField
                                                                    label="Button text color"
                                                                    value={customerApprovalSettings.approveEmailButtonTextColor ?? ""}
                                                                    onChange={(val) => {
                                                                        setSelectedApprovalPresetId("");
                                                                        setCustomerApprovalSettings((prev) => ({ ...prev, approveEmailButtonTextColor: val }));
                                                                    }}
                                                                    helpText="Empty = white (#fff)"
                                                                />
                                                                <Select
                                                                    label="Button alignment"
                                                                    options={[
                                                                        { label: "Left", value: "left" },
                                                                        { label: "Center", value: "center" },
                                                                        { label: "Right", value: "right" },
                                                                    ]}
                                                                    value={customerApprovalSettings.approveEmailButtonAlign || "left"}
                                                                    onChange={(val) => {
                                                                        setSelectedApprovalPresetId("");
                                                                        setCustomerApprovalSettings((prev) => ({ ...prev, approveEmailButtonAlign: (val as "left" | "center" | "right") || "left" }));
                                                                    }}
                                                                />
                                                            </InlineStack>
                                                            <DeferredRichTextEditor
                                                                label="Footer text"
                                                                value={customerApprovalSettings.approveEmailFooterText || ""}
                                                                onChange={(html) => {
                                                                    setSelectedApprovalPresetId("");
                                                                    setCustomerApprovalSettings((prev) => ({ ...prev, approveEmailFooterText: html }));
                                                                }}
                                                                placeholder="Company name or legal text"
                                                                minHeight={72}
                                                            />
                                                            <Checkbox
                                                                label={`Show "Powered by ${APP_DISPLAY_NAME}" in email footer`}
                                                                checked={customerApprovalSettings.approveEmailShowPoweredBy}
                                                                onChange={(val) => {
                                                                    setSelectedApprovalPresetId("");
                                                                    setCustomerApprovalSettings((prev) => ({ ...prev, approveEmailShowPoweredBy: val }));
                                                                }}
                                                                helpText="Optional. When enabled, the approval email will show a small powered-by line below your footer."
                                                            />
                                                        </BlockStack>
                                                    </div>
                                                    <div className="settings-template-preview">
                                                        <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">Approval email preview</Text>
                                                        <Box paddingBlockStart="200">
                                                            <div
                                                                style={{
                                                                    border: "1px solid #e1e3e5",
                                                                    borderRadius: 8,
                                                                    padding: 20,
                                                                    backgroundColor: "#fff",
                                                                    fontFamily: "system-ui, sans-serif",
                                                                    fontSize: 14,
                                                                }}
                                                            >
                                                                {((customerApprovalSettings.approveEmailLogoUrl ?? "").trim() || (customerApprovalSettings.approveEmailHeaderTitle ?? "").trim()) && (() => {
                                                                    const headerBg = (customerApprovalSettings.approveEmailHeaderBgColor ?? "").trim();
                                                                    const hasHeaderBg = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(headerBg);
                                                                    const align = (customerApprovalSettings.approveEmailLogoAlign === "center" || customerApprovalSettings.approveEmailLogoAlign === "right") ? customerApprovalSettings.approveEmailLogoAlign : "left";
                                                                    return (
                                                                        <div style={{ padding: "20px 24px", minHeight: 60, boxSizing: "border-box", display: "flex", alignItems: "center", ...(hasHeaderBg ? { backgroundColor: headerBg } : {}) }}>
                                                                            <div style={{ textAlign: align, width: "100%" }}>
                                                                                {customerApprovalSettings.approveEmailLogoUrl.trim() && (() => {
                                                                                    const logoPx = Math.min(400, Math.max(80, Number(customerApprovalSettings.approveEmailLogoSize) || 200)) || 200;
                                                                                    return (
                                                                                        <div style={{ marginBottom: 16, ...(align === "center" ? { marginLeft: "auto", marginRight: "auto" } : align === "right" ? { marginLeft: "auto", marginRight: 0 } : {}), display: "block", maxWidth: logoPx }}>
                                                                                            <img
                                                                                                src={customerApprovalSettings.approveEmailLogoUrl.trim()}
                                                                                                alt="Logo"
                                                                                                style={{ maxWidth: logoPx, width: "100%", height: "auto", display: "block" }}
                                                                                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                                                                            />
                                                                                        </div>
                                                                                    );
                                                                                })()}
                                                                                {customerApprovalSettings.approveEmailHeaderTitle.trim() && (() => {
                                                                                    const titleColor = (customerApprovalSettings.approveEmailHeaderTitleColor ?? "").trim();
                                                                                    const titleColorCss = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(titleColor) ? titleColor : "#111";
                                                                                    return (
                                                                                        <h1 style={{ margin: "0 0 16px", fontSize: `${Number(customerApprovalSettings.approveEmailHeaderTitleSize) || 24}px`, lineHeight: 1.35, fontWeight: 700, color: titleColorCss }}>
                                                                                            {customerApprovalSettings.approveEmailHeaderTitle}
                                                                                        </h1>
                                                                                    );
                                                                                })()}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })()}
                                                                <div
                                                                    className="settings-email-preview-body"
                                                                    dangerouslySetInnerHTML={{
                                                                        __html: (() => {
                                                                            const previewVars = {
                                                                                email: "customer@example.com",
                                                                                shopName: initialStoreName ?? "Store",
                                                                                shopEmail: initialStoreEmail ?? "",
                                                                                shopDomain: initialStoreDomain ?? "",
                                                                                shopUrl: initialStoreDomain ? `https://${initialStoreDomain}.myshopify.com` : "https://store.myshopify.com",
                                                                                customerFirstName: "Customer",
                                                                                customerEmail: "customer@example.com",
                                                                                currentYear: String(new Date().getFullYear()),
                                                                                activationUrl: "https://example.com/activate",
                                                                            };
                                                                            const raw = replaceLiquidPlaceholders(customerApprovalSettings.approveEmailBody || DEFAULT_APPROVE_BODY, previewVars);
                                                                            if (raw.includes("<")) return raw;
                                                                            return raw.split("\n").map((line) => (line.trim() ? `<p style="margin:0 0 8px">${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>` : "<br/>")).join("");
                                                                        })(),
                                                                    }}
                                                                />
                                                                {customerApprovalSettings.approveEmailButtonText.trim() && (customerApprovalSettings.approveEmailButtonUrl.trim() || (customerApprovalSettings.approveEmailBody ?? "").includes("activation_url")) && (
                                                                    <div style={{ marginTop: 20, textAlign: (customerApprovalSettings.approveEmailButtonAlign === "center" || customerApprovalSettings.approveEmailButtonAlign === "right") ? customerApprovalSettings.approveEmailButtonAlign : "left" }}>
                                                                        <span
                                                                            style={{
                                                                                display: "inline-block",
                                                                                padding: "12px 24px",
                                                                                background: /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test((customerApprovalSettings.approveEmailButtonColor ?? "").trim()) ? (customerApprovalSettings.approveEmailButtonColor ?? "").trim() : "#16a34a",
                                                                                color: /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test((customerApprovalSettings.approveEmailButtonTextColor ?? "").trim()) ? (customerApprovalSettings.approveEmailButtonTextColor ?? "").trim() : "#fff",
                                                                                borderRadius: 6,
                                                                                fontWeight: 600,
                                                                            }}
                                                                        >
                                                                            {customerApprovalSettings.approveEmailButtonText}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                {customerApprovalSettings.approveEmailFooterText.trim() && (() => {
                                                                    const previewVars = { shopName: initialStoreName ?? "Store", shopUrl: initialStoreDomain ? `https://${initialStoreDomain}.myshopify.com` : "https://store.myshopify.com", currentYear: String(new Date().getFullYear()) };
                                                                    const footerHtml = replaceLiquidPlaceholders(customerApprovalSettings.approveEmailFooterText, previewVars);
                                                                    return <div style={{ marginTop: 24, fontSize: 12, color: "#6b7280" }} dangerouslySetInnerHTML={{ __html: footerHtml.includes("<") ? footerHtml : footerHtml.replace(/\n/g, "<br/>") }} />;
                                                                })()}
                                                                {customerApprovalSettings.approveEmailShowPoweredBy && (
                                                                    <div style={{ marginTop: 12, fontSize: 11, color: "#9ca3af" }}>
                                                                        Powered by <a href={APP_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#9ca3af", textDecoration: "underline" }}>{APP_DISPLAY_NAME}</a>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </Box>
                                                    </div>
                                                </div>
                                                </Box>
                                            </Box>
                                        </Collapsible>
                                        </Box>
                                    </BlockStack>

                                    <BlockStack gap="400">
                                        <Box
                                            background="bg-surface"
                                            borderWidth="025"
                                            borderColor="border"
                                            borderRadius="200"
                                            padding="0"
                                            minHeight="0"
                                        >
                                            <div className="settings-email-collapsible-header">
                                                <button
                                                    type="button"
                                                    className="settings-email-collapsible-trigger"
                                                    onClick={() => setRejectedSectionOpen(!rejectedSectionOpen)}
                                                    aria-expanded={rejectedSectionOpen}
                                                    aria-controls="template-rejected"
                                                >
                                                    <Text as="span" variant="bodyMd" fontWeight="medium">
                                                        Customer rejected email
                                                    </Text>
                                                    <Icon source={rejectedSectionOpen ? ChevronUpIcon : ChevronDownIcon} tone="subdued" />
                                                </button>
                                                <div className="settings-email-send-toggle" onClick={(e) => e.stopPropagation()} role="presentation">
                                                    <Text as="span" variant="bodySm" tone="subdued">Send email</Text>
                                                    <Checkbox
                                                        label="Send rejection email"
                                                        labelHidden
                                                        checked={customerApprovalSettings.emailOnReject}
                                                        onChange={(val) =>
                                                            setCustomerApprovalSettings((prev) => ({ ...prev, emailOnReject: val }))
                                                        }
                                                    />
                                                </div>
                                            </div>
                                            <Collapsible open={rejectedSectionOpen} id="template-rejected">
                                            <Box paddingBlockStart="0" paddingBlockEnd="400" paddingInlineStart="300" paddingInlineEnd="300">
                                                <Divider />
                                                <Box paddingBlockStart="400">
                                    <div className="settings-template-layout">
                                        <div className="settings-template-customize">
                                            <BlockStack gap="200">
                                                <div>
                                                    <span className="Polaris-Label__Text" style={{ display: "block", marginBottom: 4 }}>
                                                        Choose a template
                                                    </span>
                                                    <Button
                                                        onClick={() => setRejectionTemplatePopoverActive(true)}
                                                    >
                                                        {selectedRejectionPresetId
                                                            ? (REJECTION_EMAIL_PRESETS.find((p) => p.id === selectedRejectionPresetId)?.name ?? "Custom")
                                                            : "Custom (edit below)"}
                                                    </Button>
                                                    <Modal
                                                        open={rejectionTemplatePopoverActive}
                                                        onClose={() => setRejectionTemplatePopoverActive(false)}
                                                        title="Choose a template"
                                                        size="large"
                                                        primaryAction={{
                                                            content: "Apply template",
                                                            onAction: () => {
                                                                setRejectionTemplatePopoverActive(false);
                                                            },
                                                        }}
                                                        secondaryActions={[
                                                            { content: "Cancel", onAction: () => setRejectionTemplatePopoverActive(false) },
                                                        ]}
                                                    >
                                                        <div className="settings-template-chooser-popover settings-template-chooser-modal">
                                                            <div className="settings-template-chooser-sidebar">
                                                                <OptionList
                                                                    options={[
                                                                        { value: "", label: "Custom (edit below)" },
                                                                        ...REJECTION_EMAIL_PRESETS.map((p) => ({ value: p.id, label: p.name })),
                                                                    ]}
                                                                    selected={[selectedRejectionPresetId ?? ""]}
                                                                    onChange={(selected) => {
                                                                        const id = (selected[0] ?? "").trim();
                                                                        setSelectedRejectionPresetId(id);
                                                                        if (id) {
                                                                            const preset = getRejectionPresetById(id);
                                                                            if (preset) {
                                                                                setCustomerApprovalSettings((prev) => ({
                                                                                    ...prev,
                                                                                    rejectEmailSubject: preset.subject,
                                                                                    rejectEmailBody: preset.bodyHtml,
                                                                                    rejectEmailFooterText: preset.footerText,
                                                                                    rejectEmailButtonText: preset.buttonText,
                                                                                    rejectEmailButtonUrl: preset.buttonUrl,
                                                                                    rejectEmailHeaderTitle: preset.headerTitle ?? "",
                                                                                    rejectEmailHeaderTitleSize: preset.headerTitleSize ?? "24",
                                                                                    rejectEmailHeaderTitleColor: preset.headerTitleColor ?? "",
                                                                                    rejectEmailHeaderBgColor: preset.headerBgColor ?? "",
                                                                                    rejectEmailLogoAlign: preset.logoAlign ?? "left",
                                                                                    rejectEmailButtonColor: preset.buttonColor ?? "",
                                                                                    rejectEmailButtonTextColor: preset.buttonTextColor ?? "",
                                                                                    rejectEmailButtonAlign: preset.buttonAlign ?? "left",
                                                                                }));
                                                                            }
                                                                        }
                                                                    }}
                                                                />
                                                            </div>
                                                            <div className="settings-template-chooser-main">
                                                                <div className="settings-template-chooser-preview-label">
                                                                    <Text as="p" variant="bodySm" fontWeight="semibold">
                                                                        Email preview
                                                                    </Text>
                                                                    <span className="settings-template-chooser-preview-badge">Approximate</span>
                                                                </div>
                                                                <div className="settings-email-preview-frame">
                                                                    <div className="settings-email-preview-card">
                                                                        {(customerApprovalSettings.rejectEmailHeaderTitle ?? "").trim() && (() => {
                                                                            const hb = (customerApprovalSettings.rejectEmailHeaderBgColor ?? "").trim();
                                                                            const hasHb = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hb);
                                                                            const align =
                                                                                customerApprovalSettings.rejectEmailLogoAlign === "center" ||
                                                                                customerApprovalSettings.rejectEmailLogoAlign === "right"
                                                                                    ? customerApprovalSettings.rejectEmailLogoAlign
                                                                                    : "left";
                                                                            return (
                                                                                <div
                                                                                    className="settings-email-preview-card-header"
                                                                                    {...(hasHb ? { "data-has-bg": "true" } : {})}
                                                                                    style={{
                                                                                        textAlign: align,
                                                                                        ...(hasHb ? { backgroundColor: hb, borderBottom: "1px solid rgba(15,23,42,0.06)" } : {}),
                                                                                    }}
                                                                                >
                                                                                    <span
                                                                                        style={{
                                                                                            fontSize: `${Number(customerApprovalSettings.rejectEmailHeaderTitleSize) || 24}px`,
                                                                                            fontWeight: 700,
                                                                                            letterSpacing: "-0.02em",
                                                                                            color: /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(
                                                                                                (customerApprovalSettings.rejectEmailHeaderTitleColor ?? "").trim(),
                                                                                            )
                                                                                                ? (customerApprovalSettings.rejectEmailHeaderTitleColor ?? "").trim()
                                                                                                : "#0f172a",
                                                                                        }}
                                                                                    >
                                                                                        {customerApprovalSettings.rejectEmailHeaderTitle}
                                                                                    </span>
                                                                                </div>
                                                                            );
                                                                        })()}
                                                                        <div className="settings-email-preview-card-body">
                                                                            <div
                                                                                className="settings-email-preview-body"
                                                                                dangerouslySetInnerHTML={{
                                                                                    __html: (() => {
                                                                                        const previewVars = {
                                                                                            email: "customer@example.com",
                                                                                            shopName: initialStoreName ?? "Store",
                                                                                            shopDomain: initialStoreDomain ?? "",
                                                                                            customerFirstName: "Customer",
                                                                                            currentYear: String(new Date().getFullYear()),
                                                                                        };
                                                                                        const raw = replaceLiquidPlaceholders(customerApprovalSettings.rejectEmailBody || DEFAULT_REJECT_BODY, previewVars);
                                                                                        if (raw.includes("<")) return raw;
                                                                                        return raw
                                                                                            .split("\n")
                                                                                            .map((line) =>
                                                                                                line.trim()
                                                                                                    ? `<p style="margin:0 0 10px;font-size:15px;line-height:1.65">${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`
                                                                                                    : "<br/>",
                                                                                            )
                                                                                            .join("");
                                                                                    })(),
                                                                                }}
                                                                            />
                                                                            {customerApprovalSettings.rejectEmailButtonText.trim() && (
                                                                                <div className="settings-email-preview-cta-wrap" style={{ textAlign: (customerApprovalSettings.rejectEmailButtonAlign === "center" || customerApprovalSettings.rejectEmailButtonAlign === "right") ? customerApprovalSettings.rejectEmailButtonAlign : "left" }}>
                                                                                    <span
                                                                                        className="settings-email-preview-cta"
                                                                                        style={{
                                                                                            background: /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test((customerApprovalSettings.rejectEmailButtonColor ?? "").trim())
                                                                                                ? (customerApprovalSettings.rejectEmailButtonColor ?? "").trim()
                                                                                                : "#dc2626",
                                                                                            color: /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test((customerApprovalSettings.rejectEmailButtonTextColor ?? "").trim())
                                                                                                ? (customerApprovalSettings.rejectEmailButtonTextColor ?? "").trim()
                                                                                                : "#fff",
                                                                                        }}
                                                                                    >
                                                                                        {customerApprovalSettings.rejectEmailButtonText}
                                                                                    </span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </Modal>
                                                    <p className="Polaris-Labelled__HelpText" style={{ marginTop: 4, fontSize: 12, color: "#6d7175" }}>
                                                        Pick one of 10 ready-made rejection emails, then edit if needed.
                                                    </p>
                                                </div>
                                                <InlineStack gap="300" blockAlign="end" wrap>
                                                    <Box minWidth="min(100%, 280px)">
                                                        <TextField
                                                            label="Logo URL"
                                                            value={customerApprovalSettings.rejectEmailLogoUrl}
                                                            onChange={(val) =>
                                                                setCustomerApprovalSettings((prev) => ({ ...prev, rejectEmailLogoUrl: val }))
                                                            }
                                                            placeholder="https://... (PNG, JPG or WebP)"
                                                            autoComplete="off"
                                                            helpText="Only PNG, JPG or WebP image URLs. SVG is not allowed."
                                                            error={(() => {
                                                                const u = (customerApprovalSettings.rejectEmailLogoUrl ?? "").trim();
                                                                if (!u) return undefined;
                                                                if (isSvgLogoUrl(u)) return "SVG is not allowed. Use PNG, JPG or WebP only.";
                                                                if (!isAllowedLogoUrl(u)) return "Use a PNG, JPG or WebP image URL only.";
                                                                return undefined;
                                                            })()}
                                                        />
                                                    </Box>
                                                    {initialStoreLogoUrl && !isSvgLogoUrl(initialStoreLogoUrl) && (
                                                            <Button
                                                                variant="secondary"
                                                                onClick={() =>
                                                                    setCustomerApprovalSettings((prev) => ({ ...prev, rejectEmailLogoUrl: initialStoreLogoUrl ?? "" }))
                                                                }
                                                            >
                                                                Use store logo
                                                            </Button>
                                                    )}
                                                </InlineStack>
                                                <InlineStack gap="400" wrap blockAlign="end">
                                                    <div style={{ width: "30%", minWidth: 200 }}>
                                                        <RangeSlider
                                                            label="Logo size"
                                                            value={Math.min(400, Math.max(80, Number(customerApprovalSettings.rejectEmailLogoSize) || 200))}
                                                            min={80}
                                                            max={400}
                                                            step={10}
                                                            output
                                                            suffix="px"
                                                            helpText="80–400 px"
                                                            onChange={(val) =>
                                                                setCustomerApprovalSettings((prev) => ({ ...prev, rejectEmailLogoSize: String(typeof val === "number" ? val : val[0]) }))
                                                            }
                                                        />
                                                    </div>
                                                    <div style={{ width: "30%", minWidth: 200 }}>
                                                        <Select
                                                            label="Logo alignment"
                                                            options={[
                                                                { label: "Left", value: "left" },
                                                                { label: "Center", value: "center" },
                                                                { label: "Right", value: "right" },
                                                            ]}
                                                            value={customerApprovalSettings.rejectEmailLogoAlign || "left"}
                                                            onChange={(val) => {
                                                                setSelectedRejectionPresetId("");
                                                                setCustomerApprovalSettings((prev) => ({ ...prev, rejectEmailLogoAlign: (val as "left" | "center" | "right") || "left" }));
                                                            }}
                                                        />
                                                    </div>
                                                </InlineStack>
                                                <TextField
                                                    label="Header title"
                                                    value={customerApprovalSettings.rejectEmailHeaderTitle}
                                                    onChange={(val) => {
                                                        setSelectedRejectionPresetId("");
                                                        setCustomerApprovalSettings((prev) => ({ ...prev, rejectEmailHeaderTitle: val }));
                                                    }}
                                                    placeholder="e.g. Your Approval Request Has Been Rejected"
                                                    autoComplete="off"
                                                />
                                                <InlineStack gap="300" wrap>
                                                    <Box minWidth="min(100%, 140px)">
                                                        <Select
                                                            label="Header title size"
                                                            options={[
                                                                { label: "16px", value: "16" },
                                                                { label: "18px", value: "18" },
                                                                { label: "20px", value: "20" },
                                                                { label: "24px", value: "24" },
                                                                { label: "28px", value: "28" },
                                                            ]}
                                                            value={customerApprovalSettings.rejectEmailHeaderTitleSize || "24"}
                                                            onChange={(val) => {
                                                                setSelectedRejectionPresetId("");
                                                                setCustomerApprovalSettings((prev) => ({ ...prev, rejectEmailHeaderTitleSize: val }));
                                                            }}
                                                        />
                                                    </Box>
                                                    <Box minWidth="min(100%, 180px)">
                                                        <ColorPickerField
                                                            label="Header title color"
                                                            value={customerApprovalSettings.rejectEmailHeaderTitleColor ?? ""}
                                                            onChange={(val) => {
                                                                setSelectedRejectionPresetId("");
                                                                setCustomerApprovalSettings((prev) => ({ ...prev, rejectEmailHeaderTitleColor: val }));
                                                            }}
                                                            helpText="Empty = #111"
                                                        />
                                                    </Box>
                                                    <Box minWidth="min(100%, 180px)">
                                                        <ColorPickerField
                                                            label="Header background"
                                                            value={customerApprovalSettings.rejectEmailHeaderBgColor ?? ""}
                                                            onChange={(val) => {
                                                                setSelectedRejectionPresetId("");
                                                                setCustomerApprovalSettings((prev) => ({ ...prev, rejectEmailHeaderBgColor: val }));
                                                            }}
                                                            helpText="Empty = none"
                                                        />
                                                    </Box>
                                                </InlineStack>
                                                <TextField
                                                    label="Subject"
                                                    value={customerApprovalSettings.rejectEmailSubject}
                                                    onChange={(val) => {
                                                        setSelectedRejectionPresetId("");
                                                        setCustomerApprovalSettings((prev) => ({ ...prev, rejectEmailSubject: val }));
                                                    }}
                                                    placeholder={DEFAULT_REJECT_SUBJECT}
                                                    autoComplete="off"
                                                />
                                                <DeferredRichTextEditor
                                                    label="Body"
                                                    value={customerApprovalSettings.rejectEmailBody}
                                                    onChange={(html) => {
                                                        setSelectedRejectionPresetId("");
                                                        setCustomerApprovalSettings((prev) => ({ ...prev, rejectEmailBody: html }));
                                                    }}
                                                    placeholder={DEFAULT_REJECT_BODY}
                                                    minHeight={160}
                                                    helpText={"Liquid: {{ shop.name }}, {{ shop.email }}, {{ shop.domain }}, {{ shop.url }}, {{ customer.first_name }}, {{ customer.email }}, {{ email }}, {{ 'now' | date: \"%Y\" }}. Toolbar: bold, italic, underline."}
                                                />
                                                <InlineStack gap="300" blockAlign="start" wrap>
                                                    <TextField
                                                        label="Button text"
                                                        value={customerApprovalSettings.rejectEmailButtonText}
                                                        onChange={(val) => {
                                                            setSelectedRejectionPresetId("");
                                                            setCustomerApprovalSettings((prev) => ({ ...prev, rejectEmailButtonText: val }));
                                                        }}
                                                        placeholder="e.g. Review Requirements"
                                                        autoComplete="off"
                                                    />
                                                    <TextField
                                                        label="Button URL"
                                                        value={customerApprovalSettings.rejectEmailButtonUrl}
                                                        onChange={(val) => {
                                                            setSelectedRejectionPresetId("");
                                                            setCustomerApprovalSettings((prev) => ({ ...prev, rejectEmailButtonUrl: val }));
                                                        }}
                                                        placeholder="e.g. {{ shop.url }}/pages/contact"
                                                        autoComplete="off"
                                                    />
                                                </InlineStack>
                                                <InlineStack gap="300" wrap>
                                                    <ColorPickerField
                                                        label="Button color"
                                                        value={customerApprovalSettings.rejectEmailButtonColor ?? ""}
                                                        onChange={(val) => {
                                                            setSelectedRejectionPresetId("");
                                                            setCustomerApprovalSettings((prev) => ({ ...prev, rejectEmailButtonColor: val }));
                                                        }}
                                                        helpText="Empty = red (#dc2626)"
                                                    />
                                                    <ColorPickerField
                                                        label="Button text color"
                                                        value={customerApprovalSettings.rejectEmailButtonTextColor ?? ""}
                                                        onChange={(val) => {
                                                            setSelectedRejectionPresetId("");
                                                            setCustomerApprovalSettings((prev) => ({ ...prev, rejectEmailButtonTextColor: val }));
                                                        }}
                                                        helpText="Empty = white (#fff)"
                                                    />
                                                    <Select
                                                        label="Button alignment"
                                                        options={[
                                                            { label: "Left", value: "left" },
                                                            { label: "Center", value: "center" },
                                                            { label: "Right", value: "right" },
                                                        ]}
                                                        value={customerApprovalSettings.rejectEmailButtonAlign || "left"}
                                                        onChange={(val) => {
                                                            setSelectedRejectionPresetId("");
                                                            setCustomerApprovalSettings((prev) => ({ ...prev, rejectEmailButtonAlign: (val as "left" | "center" | "right") || "left" }));
                                                        }}
                                                    />
                                                </InlineStack>
                                                <DeferredRichTextEditor
                                                    label="Footer text"
                                                    value={customerApprovalSettings.rejectEmailFooterText || ""}
                                                    onChange={(html) => {
                                                        setSelectedRejectionPresetId("");
                                                        setCustomerApprovalSettings((prev) => ({ ...prev, rejectEmailFooterText: html }));
                                                    }}
                                                    placeholder="Company name or legal text"
                                                    minHeight={72}
                                                    helpText="Bold, italic, underline."
                                                />
                                                <Checkbox
                                                    label={`Show "Powered by ${APP_DISPLAY_NAME}" in email footer`}
                                                    checked={customerApprovalSettings.rejectEmailShowPoweredBy}
                                                    onChange={(val) =>
                                                        setCustomerApprovalSettings((prev) => ({ ...prev, rejectEmailShowPoweredBy: val }))
                                                    }
                                                    helpText="Optional. When enabled, the rejection email will show a small powered-by line below your footer."
                                                />
                                            </BlockStack>
                                        </div>
                                        <div className="settings-template-preview">
                                            <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">Email preview</Text>
                                            <Box paddingBlockStart="200">
                                                <div
                                                    style={{
                                                        border: "1px solid #e1e3e5",
                                                        borderRadius: 8,
                                                        padding: 20,
                                                        backgroundColor: "#fff",
                                                        fontFamily: "system-ui, sans-serif",
                                                        fontSize: 14,
                                                    }}
                                                >
                                                    {((customerApprovalSettings.rejectEmailLogoUrl ?? "").trim() || (customerApprovalSettings.rejectEmailHeaderTitle ?? "").trim()) && (() => {
                                                        const headerBg = (customerApprovalSettings.rejectEmailHeaderBgColor ?? "").trim();
                                                        const hasHeaderBg = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(headerBg);
                                                        const align = (customerApprovalSettings.rejectEmailLogoAlign === "center" || customerApprovalSettings.rejectEmailLogoAlign === "right") ? customerApprovalSettings.rejectEmailLogoAlign : "left";
                                                        return (
                                                            <div style={{ padding: "20px 24px", minHeight: 60, boxSizing: "border-box", display: "flex", alignItems: "center", ...(hasHeaderBg ? { backgroundColor: headerBg } : {}) }}>
                                                                <div style={{ textAlign: align, width: "100%" }}>
                                                                    {customerApprovalSettings.rejectEmailLogoUrl.trim() && (() => {
                                                                        const logoPx = Math.min(400, Math.max(80, Number(customerApprovalSettings.rejectEmailLogoSize) || 200)) || 200;
                                                                        return (
                                                                            <div style={{ marginBottom: 16, ...(align === "center" ? { marginLeft: "auto", marginRight: "auto" } : align === "right" ? { marginLeft: "auto", marginRight: 0 } : {}), display: "block", maxWidth: logoPx }}>
                                                                                <img
                                                                                    src={customerApprovalSettings.rejectEmailLogoUrl.trim()}
                                                                                    alt="Logo"
                                                                                    style={{ maxWidth: logoPx, width: "100%", height: "auto", display: "block" }}
                                                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                                                                />
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                    {customerApprovalSettings.rejectEmailHeaderTitle.trim() && (() => {
                                                                        const titleColor = (customerApprovalSettings.rejectEmailHeaderTitleColor ?? "").trim();
                                                                        const titleColorCss = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(titleColor) ? titleColor : "#111";
                                                                        return (
                                                                            <h1 style={{ margin: "0 0 16px", fontSize: `${Number(customerApprovalSettings.rejectEmailHeaderTitleSize) || 24}px`, lineHeight: 1.35, fontWeight: 700, color: titleColorCss }}>
                                                                                {customerApprovalSettings.rejectEmailHeaderTitle}
                                                                            </h1>
                                                                        );
                                                                    })()}
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                    <div
                                                        className="settings-email-preview-body"
                                                        dangerouslySetInnerHTML={{
                                                            __html: (() => {
                                                                const previewVars = {
                                                                    email: "customer@example.com",
                                                                    shopName: initialStoreName ?? "Store",
                                                                    shopEmail: initialStoreEmail ?? "",
                                                                    shopDomain: initialStoreDomain ?? "",
                                                                    shopUrl: initialStoreDomain ? `https://${initialStoreDomain}.myshopify.com` : "https://store.myshopify.com",
                                                                    customerFirstName: "Customer",
                                                                    customerEmail: "customer@example.com",
                                                                    currentYear: String(new Date().getFullYear()),
                                                                };
                                                                const raw = replaceLiquidPlaceholders(customerApprovalSettings.rejectEmailBody || DEFAULT_REJECT_BODY, previewVars);
                                                                if (raw.includes("<")) return raw;
                                                                return raw.split("\n").map((line) => (line.trim() ? `<p style="margin:0 0 8px">${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>` : "<br/>")).join("");
                                                            })(),
                                                        }}
                                                    />
                                                    {customerApprovalSettings.rejectEmailButtonText.trim() && customerApprovalSettings.rejectEmailButtonUrl.trim() && (() => {
                                                        const btnBg = (customerApprovalSettings.rejectEmailButtonColor ?? "").trim();
                                                        const btnBgCss = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(btnBg) ? btnBg : "#dc2626";
                                                        const btnFg = (customerApprovalSettings.rejectEmailButtonTextColor ?? "").trim();
                                                        const btnFgCss = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(btnFg) ? btnFg : "#fff";
                                                        const btnAlign = (customerApprovalSettings.rejectEmailButtonAlign === "center" || customerApprovalSettings.rejectEmailButtonAlign === "right") ? customerApprovalSettings.rejectEmailButtonAlign : "left";
                                                        return (
                                                            <div style={{ marginTop: 20, textAlign: btnAlign }}>
                                                                <span
                                                                    style={{
                                                                        display: "inline-block",
                                                                        padding: "12px 24px",
                                                                        background: btnBgCss,
                                                                        color: btnFgCss,
                                                                        borderRadius: 6,
                                                                        fontWeight: 600,
                                                                    }}
                                                                >
                                                                    {customerApprovalSettings.rejectEmailButtonText}
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
                                                {customerApprovalSettings.rejectEmailFooterText.trim() && (() => {
                                                    const previewVars = {
                                                        email: "customer@example.com",
                                                        shopName: initialStoreName ?? "Store",
                                                        shopEmail: initialStoreEmail ?? "",
                                                        shopDomain: initialStoreDomain ?? "",
                                                        shopUrl: initialStoreDomain ? `https://${initialStoreDomain}.myshopify.com` : "https://store.myshopify.com",
                                                        customerFirstName: "Customer",
                                                        customerEmail: "customer@example.com",
                                                        currentYear: String(new Date().getFullYear()),
                                                    };
                                                    const footerHtml = replaceLiquidPlaceholders(customerApprovalSettings.rejectEmailFooterText, previewVars);
                                                    return (
                                                        <div style={{ marginTop: 24, fontSize: 12, color: "#6b7280" }} dangerouslySetInnerHTML={{ __html: footerHtml.includes("<") ? footerHtml : footerHtml.replace(/\n/g, "<br/>") }} />
                                                    );
                                                })()}
                                                {customerApprovalSettings.rejectEmailShowPoweredBy && (
                                                    <div style={{ marginTop: 12, fontSize: 11, color: "#9ca3af" }}>
                                                        Powered by{" "}
                                                        <a href={APP_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#9ca3af", textDecoration: "underline" }}>
                                                            {APP_DISPLAY_NAME}
                                                        </a>
                                                    </div>
                                                )}
                                                </div>
                                            </Box>
                                        </div>
                                    </div>
                                                </Box>
                                            </Box>
                                        </Collapsible>
                                        </Box>
                                    </BlockStack>

                                    <Box paddingBlockStart="400">
                                        <Text as="p" variant="bodyMd" tone="subdued">
                                            Click <strong>Save</strong> at the top of this page to apply your template settings.
                                        </Text>
                                    </Box>
                                </BlockStack>
                                        )}
                            </SectionCard>
                            </div>
                        )}
                        {activeMainSectionId === "store-setting" && (
                            <SectionCard title={storeUi.storeSettingCardTitle}>
                                <BlockStack gap="400">
                                    <Card>
                                        <BlockStack gap="300">
                                            <Text as="h3" variant="headingSm">
                                                {storeUi.guestCheckoutHeading}
                                            </Text>
                                            <Checkbox
                                                label={storeUi.redirectGuestsLabel}
                                                checked={customerApprovalSettings.redirectGuestsFromCheckout}
                                                onChange={(checked) =>
                                                    setCustomerApprovalSettings((prev) => ({
                                                        ...prev,
                                                        redirectGuestsFromCheckout: checked,
                                                    }))
                                                }
                                                helpText={storeUi.redirectGuestsHelp}
                                            />
                                            {customerApprovalSettings.redirectGuestsFromCheckout && (
                                                <>
                                                    <Divider />
                                                    <TextField
                                                        label={storeUi.redirectUrlLabel}
                                                        value={customerApprovalSettings.guestCheckoutRedirectUrl}
                                                        onChange={(val) =>
                                                            setCustomerApprovalSettings((prev) => ({
                                                                ...prev,
                                                                guestCheckoutRedirectUrl: val,
                                                            }))
                                                        }
                                                        placeholder={storeUi.redirectUrlPlaceholder}
                                                        autoComplete="off"
                                                        helpText={storeUi.redirectUrlHelp}
                                                    />
                                                </>
                                            )}
                                        </BlockStack>
                                    </Card>

                                    <Card>
                                        <BlockStack gap="300">
                                            <Text as="h3" variant="headingSm">
                                                {storeUi.loggedInCustomersHeading}
                                            </Text>
                                            <Checkbox
                                                label={storeUi.blockLoggedInLabel}
                                                checked={customerApprovalSettings.blockLoggedInWithoutApprovedTag}
                                                onChange={(checked) =>
                                                    setCustomerApprovalSettings((prev) => ({
                                                        ...prev,
                                                        blockLoggedInWithoutApprovedTag: checked,
                                                    }))
                                                }
                                            />
                                            {customerApprovalSettings.blockLoggedInWithoutApprovedTag && (
                                                <TextField
                                                    label={storeUi.popupMessageLabel}
                                                    value={customerApprovalSettings.loggedInCheckoutBlockedMessage}
                                                    onChange={(val) =>
                                                        setCustomerApprovalSettings((prev) => ({
                                                            ...prev,
                                                            loggedInCheckoutBlockedMessage: val,
                                                        }))
                                                    }
                                                    placeholder={storeUi.defaultLoggedInBlockedMessage}
                                                    multiline={4}
                                                    autoComplete="off"
                                                    helpText={storeUi.popupMessageHelp}
                                                />
                                            )}
                                        </BlockStack>
                                    </Card>
                                </BlockStack>
                            </SectionCard>
                        )}
                    </div>
                    </div>
                </div>
                </form>
            </Page>
            </div>
        </>
    );
}
