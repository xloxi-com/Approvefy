import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { DEFAULT_TRANSLATIONS_EN, DEFAULT_TRANSLATIONS_BY_LANG } from "../lib/translations.server";
import { CORE_LANGUAGES, normalizeLangCode } from "../lib/languages";
import { buildThemeCss, getGoogleFontName, normalizeThemeSettings } from "../lib/theme-settings";
import { appendAppearanceTemplateCss, getAppearanceTemplateId } from "../lib/appearance-templates";
import { BUILTIN_EN_LOGGED_IN_BLOCKED_MESSAGE } from "../lib/settings-ui-i18n";

/** App proxy / storefront must not cache JSON — appearance saves should show after reload or tab return. */
const CONFIG_JSON_HEADERS: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "private, no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
};

/**
 * Per-process cache for the shop billing-address country (rarely changes).
 * Skipping the Admin GraphQL hit on every storefront config request shaves
 * ~150–400ms per call; merchants only change billing country very rarely.
 */
const SHOP_COUNTRY_TTL_MS = 10 * 60_000;
const SHOP_COUNTRY_MAX = 500;
const shopCountryCache = new Map<string, { code: string; at: number }>();

function setShopCountryCache(key: string, value: { code: string; at: number }): void {
    shopCountryCache.set(key, value);
    if (shopCountryCache.size > SHOP_COUNTRY_MAX) {
        const oldest = shopCountryCache.keys().next().value;
        if (oldest != null) shopCountryCache.delete(oldest);
    }
}

function getLangTranslations(
    formTranslations: Record<string, Record<string, string>>,
    lang: string,
    defaultEn: Record<string, string>,
    defaultByLang: Record<string, Record<string, string>>
): Record<string, string> {
    const defaults = defaultByLang[lang] ?? defaultEn;
    return { ...defaults, ...(formTranslations[lang] || {}) };
}

/** When merchants never customized copy, DB still has English defaults — use resolved `translations` for `locale`. */
function localizePendingRegistrationScreenCopy<
    T extends {
        pendingRegistrationScreenTitle: string;
        pendingRegistrationScreenMessage: string;
    },
>(cas: T, tr: Record<string, string>): T {
    const enTitle = DEFAULT_TRANSLATIONS_EN.registration_pending_heading.trim();
    const enMsg = DEFAULT_TRANSLATIONS_EN.registration_pending_message.trim();
    const title = (cas.pendingRegistrationScreenTitle || "").trim();
    const msg = (cas.pendingRegistrationScreenMessage || "").trim();
    const locTitle = (tr.registration_pending_heading || "").trim() || enTitle;
    const locMsg = (tr.registration_pending_message || "").trim() || enMsg;
    return {
        ...cas,
        pendingRegistrationScreenTitle: title === enTitle ? locTitle : title,
        pendingRegistrationScreenMessage: msg === enMsg ? locMsg : msg,
    };
}

function localizeLoggedInCheckoutBlockedMessage<
    T extends { loggedInCheckoutBlockedMessage: string },
>(cas: T, tr: Record<string, string>): T {
    const enBuiltin = BUILTIN_EN_LOGGED_IN_BLOCKED_MESSAGE.trim();
    const msg = (cas.loggedInCheckoutBlockedMessage || "").trim();
    const loc = (tr.logged_in_checkout_blocked_message || "").trim() || msg;
    if (msg === enBuiltin) {
        return { ...cas, loggedInCheckoutBlockedMessage: loc };
    }
    return cas;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    try {
        const { admin, session } = await authenticate.public.appProxy(request);
        const url = new URL(request.url);
        const shop = session?.shop || url.searchParams.get("shop");
        const locale = (url.searchParams.get("locale") || url.searchParams.get("lang") || "en").toLowerCase().split("-")[0];
        const customerShopifyIdForPending = (url.searchParams.get("customerShopifyId") || "").trim();
        const customerEmailForPendingRaw = (url.searchParams.get("customerEmail") || "").trim();
        const customerEmailForPending =
            customerEmailForPendingRaw.length > 3 &&
            customerEmailForPendingRaw.length <= 254 &&
            customerEmailForPendingRaw.includes("@")
                ? customerEmailForPendingRaw.toLowerCase()
                : "";

        if (!shop) {
             console.error("Config fetch failed: No shop provided");
             return new Response(JSON.stringify({ fields: [], error: "No shop provided" }), {
                status: 400,
                headers: CONFIG_JSON_HEADERS,
            });
        }

        /** Computed early so pending-registration lookup can run in parallel with form + settings. */
        const pendingCheckDigits =
            customerShopifyIdForPending && /^\d{1,20}$/.test(customerShopifyIdForPending)
                ? customerShopifyIdForPending
                : "";
        const doPendingRegistrationLookup = !!(pendingCheckDigits || customerEmailForPending);

        const pendingRegistrationPromise =
            doPendingRegistrationLookup
                ? (async () => {
                      try {
                          const orClauses: Array<
                              | { customerId: string }
                              | { email: { equals: string; mode: "insensitive" } }
                          > = [];
                          if (pendingCheckDigits) {
                              const gid = `gid://shopify/Customer/${pendingCheckDigits}`;
                              orClauses.push({ customerId: gid }, { customerId: pendingCheckDigits });
                          }
                          if (customerEmailForPending) {
                              orClauses.push({
                                  email: { equals: customerEmailForPending, mode: "insensitive" },
                              });
                          }
                          return prisma.registration.findFirst({
                              where: {
                                  shop,
                                  status: "pending",
                                  OR: orClauses,
                              },
                              select: { id: true },
                          });
                      } catch {
                          return null;
                      }
                  })()
                : Promise.resolve(null);

        if (!admin) {
             console.warn(`App Proxy Auth failed for shop ${shop}. Proceeding with public access for config.`);
        }
        let config: {
            fields: unknown[];
            formType?: string;
            name?: string;
            showProgressBar?: boolean;
            storefrontHeading?: string | null;
            storefrontDescription?: string | null;
        } = { fields: [] };
        const formId = url.searchParams.get("formId");
        const formType = url.searchParams.get("formType");

        const formConfigPromise = shop
            ? (async () => {
                try {
                    let dbConfig = null;
                    if (formId) {
                        dbConfig = await prisma.formConfig.findFirst({ where: { id: formId, shop } });
                    } else if (formType) {
                        dbConfig = await prisma.formConfig.findFirst({ where: { shop, formType } } as never);
                    }
                    if (!dbConfig) {
                        // Single composite-ordered query covers "default form, else oldest"
                        // — saves a round-trip on every storefront load (the hot path here).
                        dbConfig = await prisma.formConfig.findFirst({
                            where: { shop },
                            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
                        } as never);
                    }
                    if (dbConfig) {
                        const row = dbConfig as {
                            name?: string;
                            formType?: string;
                            showProgressBar?: boolean;
                            storefrontHeading?: string | null;
                            storefrontDescription?: string | null;
                        };
                        return {
                            fields: (dbConfig.fields ?? []) as unknown[],
                            formType: row.formType ?? "wholesale",
                            name: row.name ?? "Registration Form",
                            showProgressBar: row.showProgressBar !== false,
                            storefrontHeading:
                                typeof row.storefrontHeading === "string" && row.storefrontHeading.trim()
                                    ? row.storefrontHeading.trim()
                                    : null,
                            storefrontDescription:
                                typeof row.storefrontDescription === "string" && row.storefrontDescription.trim()
                                    ? row.storefrontDescription.trim()
                                    : null,
                        };
                    }
                } catch (dbError) {
                    console.warn("DB config fetch failed, falling back to metafields:", dbError);
                }
                return {
                    fields: [] as unknown[],
                    formType: undefined as string | undefined,
                    name: undefined as string | undefined,
                    showProgressBar: true,
                };
            })()
            : Promise.resolve({
                  fields: [] as unknown[],
                  formType: undefined as string | undefined,
                  name: undefined as string | undefined,
                  showProgressBar: true,
              });

        const settingsPromise = shop ? prisma.appSettings.findUnique({ where: { shop } }) : Promise.resolve(null);

        const [formConfigResult, settings, pendingForCustomerRow] = await Promise.all([
            formConfigPromise,
            settingsPromise,
            pendingRegistrationPromise,
        ]);
        if (formConfigResult.fields.length > 0) {
            config = formConfigResult;
        }

        let shopCountryCode = "US";
        try {
            const savedCountry = (settings as { shopCountryCode?: string } | null)?.shopCountryCode;
            const savedCountryTrim =
                savedCountry && typeof savedCountry === "string" ? savedCountry.trim() : "";
            const hasPersistedCountry = savedCountryTrim.length === 2;
            if (hasPersistedCountry) {
                shopCountryCode = savedCountryTrim.toUpperCase();
            }
            // Skip the Admin GraphQL roundtrip when we already have a saved country and
            // a fresh process-cache hit. Country only ever updates when a merchant moves stores.
            const cacheKey = (shop || "").toLowerCase();
            const cached = cacheKey ? shopCountryCache.get(cacheKey) : null;
            const cacheFresh = !!(cached && Date.now() - cached.at < SHOP_COUNTRY_TTL_MS);
            if (cached && cacheFresh && cached.code) {
                shopCountryCode = cached.code;
            } else if (hasPersistedCountry) {
                // DB already synced — warm cache; do not call Admin API (~200–400ms saved per request).
                if (cacheKey) setShopCountryCache(cacheKey, { code: shopCountryCode, at: Date.now() });
            } else if (admin) {
                const shopRes = await admin.graphql(
                    `#graphql
                    query getShopCountry { shop { billingAddress { countryCodeV2 } } }`
                );
                const shopData = await shopRes.json();
                const code = shopData.data?.shop?.billingAddress?.countryCodeV2;
                if (code && typeof code === "string") {
                    const upper = code.toUpperCase();
                    shopCountryCode = upper;
                    if (cacheKey) setShopCountryCache(cacheKey, { code: upper, at: Date.now() });
                    // Persist only when value actually changed — avoids a write on every storefront load.
                    if (shop && upper !== savedCountryTrim.toUpperCase()) {
                        if (settings) {
                            prisma.appSettings.update({
                                where: { shop },
                                data: { shopCountryCode: upper },
                            }).catch(() => { /* ignore */ });
                        } else {
                            prisma.appSettings.upsert({
                                where: { shop },
                                create: { shop, shopCountryCode: upper },
                                update: { shopCountryCode: upper },
                            }).catch(() => { /* ignore */ });
                        }
                    }
                }
            }
        } catch { /* ignore */ }

        // 2. Fallback to Metafields if DB result is empty (or legacy/migration support)
        if (admin && config.fields.length === 0) {
            const response = await admin.graphql(
                `#graphql
                query getAppConfig {
                    currentAppInstallation {
                        registrationForm: metafield(namespace: "custom", key: "registration_form") {
                            value
                        }
                    }
                }`
            );

            const data = await response.json();
            const formConfigJson = data.data?.currentAppInstallation?.registrationForm?.value;
            if (formConfigJson) {
                config = JSON.parse(formConfigJson);
            }
        }

        // 3. Load translations, available languages, appearance, and customer approval settings from AppSettings
        let translations: Record<string, string> = { ...DEFAULT_TRANSLATIONS_EN };
        let availableLocales: string[] = CORE_LANGUAGES.map((l) => l.code);
        let customCss: string | null = null;
        let googleFont: string | null = null;
        let appearanceTemplateId = "clean";
        const defaultPendingTitle = DEFAULT_TRANSLATIONS_EN.registration_pending_heading;
        const defaultPendingMessage = DEFAULT_TRANSLATIONS_EN.registration_pending_message;
        let customerApprovalSettings: {
            approvalMode: string;
            afterSubmit: string;
            redirectUrl: string;
            successMessage: string;
            pendingRegistrationScreenTitle: string;
            pendingRegistrationScreenMessage: string;
            approvedTag: string;
            redirectGuestsFromCheckout: boolean;
            guestCheckoutRedirectUrl: string;
            blockLoggedInWithoutApprovedTag: boolean;
            loggedInCheckoutBlockedMessage: string;
        } | null = null;
        if (shop && settings) {
            try {
                const ft = (settings.formTranslations as Record<string, Record<string, string>>) || {};
                    translations = getLangTranslations(ft, locale, DEFAULT_TRANSLATIONS_EN, DEFAULT_TRANSLATIONS_BY_LANG);

                    const opts = (settings.languageOptions as Array<{ code: string }>) || [];
                    if (Array.isArray(opts) && opts.length > 0) {
                        const fromSettings = opts
                            .map((o) => normalizeLangCode(o?.code))
                            .filter(Boolean);
                        const merged = [...CORE_LANGUAGES.map((l) => l.code), ...fromSettings];
                        const seen = new Set<string>();
                        availableLocales = merged.filter((c) => {
                            const code = normalizeLangCode(c);
                            if (!code || seen.has(code)) return false;
                            seen.add(code);
                            return true;
                        });
                    }
                    if (!availableLocales.includes("en")) availableLocales.unshift("en");

                    const savedCss = (settings as { customCss?: string | null }).customCss;
                    let themeSettingsNorm: ReturnType<typeof normalizeThemeSettings> | null = null;
                    const rawTheme = (settings as { themeSettings?: unknown }).themeSettings;
                    if (rawTheme) {
                        themeSettingsNorm = normalizeThemeSettings(rawTheme);
                        const fontName = getGoogleFontName(themeSettingsNorm.fontFamily);
                        if (fontName) googleFont = fontName;
                    }

                    const cas = (settings as { customerApprovalSettings?: unknown }).customerApprovalSettings;
                    if (cas && typeof cas === "object" && !Array.isArray(cas)) {
                        const o = cas as Record<string, unknown>;
                        appearanceTemplateId = getAppearanceTemplateId(o.appearanceTemplateId);
                        const defaultBlockedMsg = BUILTIN_EN_LOGGED_IN_BLOCKED_MESSAGE;
                        const modeRaw = String(o.approvalMode ?? "")
                            .trim()
                            .toLowerCase();
                        customerApprovalSettings = {
                            approvalMode: modeRaw === "auto" ? "auto" : "manual",
                            afterSubmit: o.afterSubmit === "redirect" ? "redirect" : "message",
                            redirectUrl: typeof o.redirectUrl === "string" ? o.redirectUrl : "",
                            successMessage:
                                typeof o.successMessage === "string"
                                    ? o.successMessage
                                    : "Registration successful! Your account is pending approval. You will receive an email once approved.",
                            pendingRegistrationScreenTitle:
                                typeof o.pendingRegistrationScreenTitle === "string"
                                    ? o.pendingRegistrationScreenTitle.trim()
                                    : defaultPendingTitle,
                            pendingRegistrationScreenMessage:
                                typeof o.pendingRegistrationScreenMessage === "string"
                                    ? o.pendingRegistrationScreenMessage.trim()
                                    : defaultPendingMessage,
                            approvedTag:
                                typeof o.approvedTag === "string" && o.approvedTag.trim()
                                    ? o.approvedTag.trim()
                                    : "status:approved",
                            redirectGuestsFromCheckout: o.redirectGuestsFromCheckout === true,
                            guestCheckoutRedirectUrl:
                                typeof o.guestCheckoutRedirectUrl === "string" ? o.guestCheckoutRedirectUrl : "",
                            blockLoggedInWithoutApprovedTag: o.blockLoggedInWithoutApprovedTag === true,
                            loggedInCheckoutBlockedMessage:
                                typeof o.loggedInCheckoutBlockedMessage === "string" &&
                                o.loggedInCheckoutBlockedMessage.trim()
                                    ? o.loggedInCheckoutBlockedMessage.trim()
                                    : defaultBlockedMsg,
                        };
                    }

                    if (typeof savedCss === "string" && savedCss.trim().length > 0) {
                        // Respect explicit overrides (Custom CSS field). Do not force template CSS on top.
                        customCss = savedCss;
                    } else if (themeSettingsNorm) {
                        customCss = appendAppearanceTemplateCss(buildThemeCss(themeSettingsNorm), appearanceTemplateId);
                    }
            } catch (e) {
                console.warn("AppSettings (translations) fetch failed:", e);
            }
        }

        if (shop && !settings) {
            translations = getLangTranslations({}, locale, DEFAULT_TRANSLATIONS_EN, DEFAULT_TRANSLATIONS_BY_LANG);
        }

        /** Storefront + checkout guard need a stable object so approved-tag detection never silently fails. */
        if (shop && !customerApprovalSettings) {
            customerApprovalSettings = {
                approvalMode: "manual",
                afterSubmit: "message",
                redirectUrl: "",
                successMessage:
                    "Registration successful! Your account is pending approval. You will receive an email once approved.",
                pendingRegistrationScreenTitle: defaultPendingTitle,
                pendingRegistrationScreenMessage: defaultPendingMessage,
                approvedTag: "status:approved",
                redirectGuestsFromCheckout: false,
                guestCheckoutRedirectUrl: "",
                blockLoggedInWithoutApprovedTag: false,
                loggedInCheckoutBlockedMessage: BUILTIN_EN_LOGGED_IN_BLOCKED_MESSAGE,
            };
        }

        /** Logged-in storefront: true when Approvefy has a pending registration for this customer (by Shopify id and/or account email; survives cleared sessionStorage). */
        const loggedInCustomerHasPendingRegistration = !!pendingForCustomerRow;
        if (customerApprovalSettings) {
            customerApprovalSettings = localizePendingRegistrationScreenCopy(
                customerApprovalSettings,
                translations
            );
            customerApprovalSettings = localizeLoggedInCheckoutBlockedMessage(
                customerApprovalSettings,
                translations
            );
        }

        const rawFields = Array.isArray(config.fields) ? config.fields : [];
        /** Storefront: password must appear when present in the builder (merchants often leave "Show in form" off by mistake). */
        const fieldsForStorefront = rawFields.map((f) => {
            if (!f || typeof f !== "object") return f;
            const o = f as Record<string, unknown>;
            const t = String(o.type ?? "")
                .trim()
                .toLowerCase();
            if (t === "password") {
                return { ...o, enabled: true };
            }
            return f;
        });

        const payload = {
            ...config,
            fields: fieldsForStorefront,
            shopCountryCode,
            translations,
            availableLocales,
            locale,
            customCss,
            googleFont,
            customerApprovalSettings,
            ...(doPendingRegistrationLookup ? { loggedInCustomerHasPendingRegistration } : {}),
        };

        return new Response(JSON.stringify(payload), {
            status: 200,
            headers: CONFIG_JSON_HEADERS,
        });
    } catch (error) {
        console.error("Config fetch error:", error);
        return new Response(
            JSON.stringify({
                fields: [],
                error: error instanceof Error ? error.message : "Failed to load config",
            }),
            {
                status: 200,
                headers: CONFIG_JSON_HEADERS,
            }
        );
    }
};
