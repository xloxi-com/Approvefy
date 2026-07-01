/**
 * Shop-scoped cached reads for hot paths (api.config, admin loaders).
 */
import prisma from "../db.server";
import { CACHE_TTL, getCache, setCache, shopKey } from "./cache.server";

export type CachedAppSettingsRow = {
  updatedAt: Date;
  defaultLanguage: string;
  shopCountryCode: string | null;
  formTranslations: unknown;
  languageOptions: unknown;
  customCss: string | null;
  themeSettings: unknown;
  customerApprovalSettings: unknown;
  merchantPlan: string;
};

export type CachedFormConfigRow = {
  id: string;
  fields: unknown;
  name: string;
  formType: string;
  showProgressBar: boolean;
  storefrontHeading: string | null;
  storefrontDescription: string | null;
  customerTags: unknown;
  updatedAt: Date;
};

const appSettingsSelect = {
  updatedAt: true,
  defaultLanguage: true,
  shopCountryCode: true,
  formTranslations: true,
  languageOptions: true,
  customCss: true,
  themeSettings: true,
  customerApprovalSettings: true,
  merchantPlan: true,
} as const;

const formConfigSelect = {
  id: true,
  fields: true,
  name: true,
  formType: true,
  showProgressBar: true,
  storefrontHeading: true,
  storefrontDescription: true,
  customerTags: true,
  updatedAt: true,
} as const;

export async function getCachedAppSettings(shop: string): Promise<CachedAppSettingsRow | null> {
  const key = shopKey(shop, "appSettings");
  const cached = getCache<CachedAppSettingsRow>(key);
  if (cached) return cached;

  try {
    const row = await prisma.appSettings.findUnique({
      where: { shop },
      select: appSettingsSelect,
    });
    if (row) setCache(key, row, CACHE_TTL.appSettings);
    return row;
  } catch {
    return null;
  }
}

export async function getCachedFormConfig(
  shop: string,
  opts?: { formId?: string | null; formType?: string | null },
): Promise<CachedFormConfigRow | null> {
  const formId = opts?.formId?.trim() || "";
  const formType = opts?.formType?.trim() || "";
  const cacheKey = shopKey(
    shop,
    formId ? `formConfig:${formId}` : formType ? `formConfig:type:${formType}` : "formConfig",
  );
  const cached = getCache<CachedFormConfigRow>(cacheKey);
  if (cached) return cached;

  try {
    let row: CachedFormConfigRow | null = null;
    if (formId) {
      row = await prisma.formConfig.findFirst({
        where: { id: formId, shop },
        select: formConfigSelect,
      });
    } else if (formType) {
      row = (await prisma.formConfig.findFirst({
        where: { shop, formType },
        select: formConfigSelect,
      } as never)) as CachedFormConfigRow | null;
    }
    if (!row) {
      row = (await prisma.formConfig.findFirst({
        where: { shop },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: formConfigSelect,
      } as never)) as CachedFormConfigRow | null;
    }
    if (row) setCache(cacheKey, row, CACHE_TTL.formConfig);
    return row;
  } catch {
    return null;
  }
}
