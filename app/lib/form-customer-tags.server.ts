/** Internal customData key — tags to apply when the registration is approved or linked to Shopify. */
export const FORM_CUSTOMER_TAGS_CUSTOM_DATA_KEY = "_approvefyFormCustomerTags";

/** Parse comma-separated tags from the form builder input. */
export function parseFormCustomerTagsInput(input: string): string[] {
    return String(input || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
}

/** Normalize tags stored on FormConfig (JSON array or legacy comma-separated string). */
export function normalizeFormCustomerTagsFromDb(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((t) => String(t).trim()).filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
        return parseFormCustomerTagsInput(value);
    }
    return [];
}

/** Display value for the admin TextField. */
export function formatFormCustomerTagsForInput(value: unknown): string {
    return normalizeFormCustomerTagsFromDb(value).join(", ");
}

export function mergeUniqueCustomerTags(...groups: string[][]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const group of groups) {
        for (const raw of group) {
            const tag = String(raw || "").trim();
            if (!tag) continue;
            const key = tag.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(tag);
        }
    }
    return out;
}

export function stashFormCustomerTagsInCustomData(
    customData: Record<string, string>,
    tags: string[],
): void {
    const normalized = mergeUniqueCustomerTags(tags);
    if (normalized.length > 0) {
        customData[FORM_CUSTOMER_TAGS_CUSTOM_DATA_KEY] = JSON.stringify(normalized);
    }
}

export function extractFormCustomerTagsFromCustomData(customData: unknown): string[] {
    if (!customData || typeof customData !== "object" || Array.isArray(customData)) {
        return [];
    }
    const raw = (customData as Record<string, unknown>)[FORM_CUSTOMER_TAGS_CUSTOM_DATA_KEY];
    if (typeof raw === "string" && raw.trim()) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return normalizeFormCustomerTagsFromDb(parsed);
            }
        } catch {
            return parseFormCustomerTagsInput(raw);
        }
    }
    if (Array.isArray(raw)) {
        return normalizeFormCustomerTagsFromDb(raw);
    }
    return [];
}
