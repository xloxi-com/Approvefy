import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { DEFAULT_TRANSLATIONS_EN, DEFAULT_TRANSLATIONS_BY_LANG } from "../lib/translations.server";
import { CORE_LANGUAGES, normalizeLangCode } from "../lib/languages";
import { buildThemeCss, getGoogleFontName, normalizeThemeSettings } from "../lib/theme-settings";

function getLangTranslations(
    formTranslations: Record<string, Record<string, string>>,
    lang: string,
    defaultEn: Record<string, string>,
    defaultByLang: Record<string, Record<string, string>>
): Record<string, string> {
    const defaults = defaultByLang[lang] ?? defaultEn;
    return { ...defaults, ...(formTranslations[lang] || {}) };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    try {
        const { admin, session } = await authenticate.public.appProxy(request);
        const url = new URL(request.url);
        const shop = session?.shop || url.searchParams.get("shop");
        const locale = (url.searchParams.get("locale") || url.searchParams.get("lang") || "en").toLowerCase().split("-")[0];

        if (!shop) {
             console.error("Config fetch failed: No shop provided");
             return new Response(JSON.stringify({ fields: [], error: "No shop provided" }), {
                status: 400,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            });
        }

        if (!admin) {
             console.warn(`App Proxy Auth failed for shop ${shop}. Proceeding with public access for config.`);
        }
        let config: { fields: unknown[]; formType?: string; name?: string } = { fields: [] };
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
                        const [defaultForm, fallback] = await Promise.all([
                            prisma.formConfig.findFirst({ where: { shop, isDefault: true } } as never),
                            prisma.formConfig.findFirst({ where: { shop }, orderBy: { createdAt: "asc" } }),
                        ]);
                        dbConfig = defaultForm ?? fallback;
                    }
                    if (dbConfig) {
                        const row = dbConfig as { name?: string; formType?: string };
                        return {
                            fields: (dbConfig.fields ?? []) as unknown[],
                            formType: row.formType ?? "wholesale",
                            name: row.name ?? "Registration Form",
                        };
                    }
                } catch (dbError) {
                    console.warn("DB config fetch failed, falling back to metafields:", dbError);
                }
                return { fields: [] as unknown[], formType: undefined as string | undefined, name: undefined as string | undefined };
            })()
            : Promise.resolve({ fields: [] as unknown[], formType: undefined as string | undefined, name: undefined as string | undefined });

        const settingsPromise = shop ? prisma.appSettings.findUnique({ where: { shop } }) : Promise.resolve(null);

        const [formConfigResult, settings] = await Promise.all([formConfigPromise, settingsPromise]);
        if (formConfigResult.fields.length > 0) {
            config = formConfigResult;
        }

        let shopCountryCode = "US";
        try {
            const savedCountry = (settings as { shopCountryCode?: string } | null)?.shopCountryCode;
            if (savedCountry && typeof savedCountry === "string" && savedCountry.trim().length === 2) {
                shopCountryCode = savedCountry.trim().toUpperCase();
            }
            if (admin) {
                const shopRes = await admin.graphql(
                    `#graphql
                    query getShopCountry { shop { billingAddress { countryCodeV2 } } }`
                );
                const shopData = await shopRes.json();
                const code = shopData.data?.shop?.billingAddress?.countryCodeV2;
                if (code && typeof code === "string") {
                    shopCountryCode = code.toUpperCase();
                    if (shop && settings) {
                        prisma.appSettings.update({
                            where: { shop },
                            data: { shopCountryCode },
                        }).catch(() => { /* ignore */ });
                    } else if (shop) {
                        prisma.appSettings.upsert({
                            where: { shop },
                            create: { shop, shopCountryCode },
                            update: { shopCountryCode },
                        }).catch(() => { /* ignore */ });
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
        let customerApprovalSettings: {
            approvalMode: string;
            afterSubmit: string;
            redirectUrl: string;
            successMessage: string;
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
                    if (typeof savedCss === "string" && savedCss.trim().length > 0) {
                        customCss = savedCss;
                    } else {
                        const rawTheme = (settings as { themeSettings?: unknown }).themeSettings;
                        if (rawTheme) {
                            themeSettingsNorm = normalizeThemeSettings(rawTheme);
                            customCss = buildThemeCss(themeSettingsNorm);
                            const fontName = getGoogleFontName(themeSettingsNorm.fontFamily);
                            if (fontName) googleFont = fontName;
                        }
                    }

                    const cas = (settings as { customerApprovalSettings?: unknown }).customerApprovalSettings;
                    if (cas && typeof cas === "object" && !Array.isArray(cas)) {
                        const o = cas as Record<string, unknown>;
                        customerApprovalSettings = {
                            approvalMode: o.approvalMode === "auto" ? "auto" : "manual",
                            afterSubmit: o.afterSubmit === "redirect" ? "redirect" : "message",
                            redirectUrl: typeof o.redirectUrl === "string" ? o.redirectUrl : "",
                            successMessage:
                                typeof o.successMessage === "string"
                                    ? o.successMessage
                                    : "Thank you for registering! Please check your email for more details about your account.",
                        };
                    }
            } catch (e) {
                console.warn("AppSettings (translations) fetch failed:", e);
            }
        }

        const payload = {
            ...config,
            shopCountryCode,
            translations,
            availableLocales,
            locale,
            customCss,
            googleFont,
            customerApprovalSettings,
        };

        return new Response(JSON.stringify(payload), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
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
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            }
        );
    }
};
