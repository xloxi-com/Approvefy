/**
 * Build a map from customData key → display label using the same logic as the
 * registration form (app-embed.liquid getFieldName). Used to show real field
 * labels in "Other form fields" on the customer detail page.
 */

import prisma from "../db.server";

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

function getFieldKey(field: { type: string; label?: string }, index: number): string {
  const type = field.type && String(field.type).toLowerCase();
  if (BACKEND_MAP[type]) return BACKEND_MAP[type];
  const label = (field.label && String(field.label).trim()) || "field";
  const slug = label.toLowerCase().replace(/\s+/g, "_");
  return `custom_${slug}_${index}`;
}

export interface FormFieldForLabels {
  type: string;
  label?: string;
}

/**
 * Returns a map from customData key (e.g. custom_text_9) to the form's label (e.g. "Preferred contact").
 * Use this when displaying "Other form fields" so labels show instead of keys.
 */
export function buildCustomDataLabels(fields: FormFieldForLabels[]): Record<string, string> {
  const map: Record<string, string> = {};
  if (!Array.isArray(fields)) return map;
  fields.forEach((field, index) => {
    const key = getFieldKey(field, index);
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
 * Load custom data labels for a shop: DB form config first, then app metafield fallback.
 * Pass admin to avoid duplicate auth when metafield fallback is needed.
 */
export async function getCustomDataLabelsForShopWithAdmin(
  shop: string,
  admin?: AdminWithGraphql | null
): Promise<Record<string, string>> {
  try {
    const [defaultForm, fallbackForm] = await Promise.all([
      prisma.formConfig.findFirst({ where: { shop, isDefault: true }, select: { fields: true } } as never),
      prisma.formConfig.findFirst({ where: { shop }, orderBy: { createdAt: "asc" }, select: { fields: true } } as never),
    ]);
    let configFields: FormFieldForLabels[] = [];
    const config = defaultForm ?? fallbackForm;
    if (config?.fields && Array.isArray(config.fields)) {
      configFields = config.fields as unknown as FormFieldForLabels[];
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
          const parsed = JSON.parse(configJson) as { fields?: FormFieldForLabels[] };
          if (Array.isArray(parsed.fields)) configFields = parsed.fields;
        } catch {
          /* ignore */
        }
      }
    }
    return buildCustomDataLabels(configFields);
  } catch {
    return {};
  }
}
