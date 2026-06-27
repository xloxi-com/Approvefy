import prisma from "../db.server";
import {
    DEFAULT_CUSTOMER_B2B_FORM_FIELDS,
    DEFAULT_CUSTOMER_B2B_FORM_NAME,
    DEFAULT_CUSTOMER_B2B_FORM_TYPE,
} from "./default-form-config";

/** Create the default Customer B2B form when a shop has none yet. */
export async function ensureDefaultCustomerB2BForm(shop: string): Promise<{ created: boolean; formId?: string }> {
    const key = (shop || "").trim();
    if (!key) return { created: false };

    const count = await prisma.formConfig.count({ where: { shop: key } });
    if (count > 0) return { created: false };

    const created = await prisma.formConfig.create({
        data: {
            shop: key,
            name: DEFAULT_CUSTOMER_B2B_FORM_NAME,
            formType: DEFAULT_CUSTOMER_B2B_FORM_TYPE,
            fields: DEFAULT_CUSTOMER_B2B_FORM_FIELDS,
            isDefault: true,
            enabled: true,
        } as never,
    });

    return { created: true, formId: created.id };
}
