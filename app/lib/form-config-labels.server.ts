/**
 * Build a map from customData key → display label using the same logic as the
 * registration form (app-embed.liquid getFieldName). Used to show real field
 * labels in "Other form fields" on the customer detail page.
 */

import prisma from "../db.server";

/** Mirrors `getFieldName` in extensions/registration-form/assets/registration-form.js */
const BACKEND_MAP: Record<string, string> = {
  first_name: "firstName",
  last_name: "lastName",
  email: "email",
  phone: "phone",
  company: "company",
  password: "password",
  address: "address",
  zip_code: "zipCode",
  city: "city",
  state: "state",
  country: "country",
};

/**
 * Same input name the storefront assigns for a field at its index in the **enabled** fields list
 * (including headings, which consume an index but do not submit a value).
 */
export function getRegistrationInputName(field: { type: string; label?: string }, index: number): string {
  const t = field.type;
  if (t && BACKEND_MAP[t]) return BACKEND_MAP[t];
  const label = (field.label && String(field.label).trim()) || "field";
  const slug = label.toLowerCase().replace(/\s+/g, "_");
  return `custom_${slug}_${index}`;
}

export interface FormFieldForLabels {
  type: string;
  label?: string;
  enabled?: boolean;
}

export interface FormFieldForLayout extends FormFieldForLabels {
  helpText?: string;
  options?: string[];
}

export type RegistrationDetailLayoutItem =
  | { kind: "heading"; label: string; helpText?: string }
  | {
      kind: "field";
      fieldType: string;
      label: string;
      helpText?: string;
      apiKey: string;
      options?: string[];
    };

/**
 * Ordered layout for admin customer detail: only fields with "Show in form" enabled, same order as storefront.
 */
export function buildRegistrationAdminLayout(fields: FormFieldForLayout[]): RegistrationDetailLayoutItem[] {
  if (!Array.isArray(fields) || fields.length === 0) return [];
  const enabled = fields.filter((f) => f && f.enabled !== false);
  const out: RegistrationDetailLayoutItem[] = [];
  enabled.forEach((field, index) => {
    const label = (field.label && String(field.label).trim()) || "";
    if (field.type === "heading") {
      out.push({ kind: "heading", label: label || "Section", helpText: field.helpText });
      return;
    }
    const apiKey = getRegistrationInputName(field, index);
    const opts = Array.isArray(field.options)
      ? field.options.map((x) => String(x).trim()).filter(Boolean)
      : undefined;
    out.push({
      kind: "field",
      fieldType: field.type,
      label: label || apiKey,
      helpText: field.helpText,
      apiKey,
      options: opts && opts.length > 0 ? opts : undefined,
    });
  });
  return out;
}

/**
 * Returns a map from customData key (e.g. custom_text_9) to the form's label (e.g. "Preferred contact").
 * Use this when displaying "Other form fields" so labels show instead of keys.
 */
export function buildCustomDataLabels(fields: FormFieldForLabels[]): Record<string, string> {
  const map: Record<string, string> = {};
  if (!Array.isArray(fields)) return map;
  const enabled = fields.filter((f) => f && f.enabled !== false);
  enabled.forEach((field, index) => {
    if (field.type === "heading") return;
    const key = getRegistrationInputName(field, index);
    const label = (field.label && String(field.label).trim()) || key.replace(/_/g, " ");
    map[key] = label;
  });
  return map;
}

/** Admin API for metafield fallback when no form config in DB */
interface AdminWithGraphql {
  graphql: (query: string) => Promise<Response>;
}

/**
 * Per-shop cache for registration form fields. Read on every customer detail page,
 * customers list approve action, and CSV export. Fields only change when a merchant
 * saves the Form Builder, so a 60s TTL is safe and saves a DB hop on every page render.
 *
 * Cache is also bounded (LRU-ish by insertion order) so multi-shop deployments do not leak.
 */
const FORM_FIELDS_CACHE_TTL_MS = 60_000;
const FORM_FIELDS_CACHE_MAX = 200;
const formFieldsCache = new Map<string, { value: FormFieldForLayout[]; at: number }>();

/** Bust the cache after a Form Builder save. */
export function invalidateFormFieldsCache(shop: string): void {
  const key = (shop || "").trim().toLowerCase();
  if (!key) return;
  formFieldsCache.delete(key);
}

/**
 * Raw registration form fields for a shop: default FormConfig in DB, else oldest, else app metafield.
 *
 * Single query with composite ordering (`isDefault` desc, `createdAt` asc) is cheaper than two
 * sequential round-trips for the same row set; @@index([shop, isDefault]) keeps it fast.
 */
export async function getRegistrationFormFieldsForShopWithAdmin(
  shop: string,
  admin?: AdminWithGraphql | null
): Promise<FormFieldForLayout[]> {
  const cacheKey = (shop || "").trim().toLowerCase();
  if (cacheKey) {
    const cached = formFieldsCache.get(cacheKey);
    if (cached && Date.now() - cached.at < FORM_FIELDS_CACHE_TTL_MS) {
      return cached.value;
    }
  }
  try {
    const config = (await prisma.formConfig.findFirst({
      where: { shop },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { fields: true },
    } as never)) as { fields?: unknown } | null;
    let configFields: FormFieldForLayout[] = [];
    if (config?.fields && Array.isArray(config.fields)) {
      configFields = config.fields as unknown as FormFieldForLayout[];
    }
    if (configFields.length === 0 && admin) {
      const res = await admin.graphql(
        `#graphql
        query getAppConfig {
          currentAppInstallation {
            metafield(namespace: "custom", key: "registration_form") { value }
          }
        }`
      );
      const metaData = await res.json();
      const configJson = (metaData as { data?: { currentAppInstallation?: { metafield?: { value?: string } } } })?.data?.currentAppInstallation?.metafield?.value;
      if (configJson) {
        try {
          const parsed = JSON.parse(configJson) as { fields?: FormFieldForLayout[] };
          if (Array.isArray(parsed.fields)) configFields = parsed.fields;
        } catch {
          /* ignore */
        }
      }
    }
    if (cacheKey) {
      formFieldsCache.set(cacheKey, { value: configFields, at: Date.now() });
      if (formFieldsCache.size > FORM_FIELDS_CACHE_MAX) {
        const oldest = formFieldsCache.keys().next().value;
        if (oldest != null) formFieldsCache.delete(oldest);
      }
    }
    return configFields;
  } catch {
    return [];
  }
}

/**
 * Load custom data labels for a shop: DB form config first, then app metafield fallback.
 * Pass admin to avoid duplicate auth when metafield fallback is needed.
 */
export async function getCustomDataLabelsForShopWithAdmin(
  shop: string,
  admin?: AdminWithGraphql | null
): Promise<Record<string, string>> {
  const configFields = await getRegistrationFormFieldsForShopWithAdmin(shop, admin);
  return buildCustomDataLabels(configFields);
}
