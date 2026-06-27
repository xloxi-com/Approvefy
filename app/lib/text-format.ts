/** Text field format validation options (form builder + storefront + API). */

export const TEXT_FORMAT_SAMPLES: Record<string, string> = {
    text: "Hello!",
    numbers: "12345",
    alphanumeric_no_spaces: "Abc123",
    alphanumeric_with_spaces: "Abc 123",
    alphanumeric_hyphen_underscore: "Abc-12_x",
    alphabets_no_spaces: "Hello",
    alphabets_with_spaces: "Hello World",
};

export const TEXT_FORMAT_OPTIONS: { label: string; value: string }[] = [
    { label: "Text", value: "text" },
    { label: "Numbers", value: "numbers" },
    { label: "Alphanumeric", value: "alphanumeric_no_spaces" },
    { label: "Alphanumeric + space", value: "alphanumeric_with_spaces" },
    { label: "Alphanumeric + - _", value: "alphanumeric_hyphen_underscore" },
    { label: "Letters", value: "alphabets_no_spaces" },
    { label: "Letters + space", value: "alphabets_with_spaces" },
];

/** Short help line under the Format select in the form builder. */
export const TEXT_FORMAT_HELP: Record<string, string> = {
    text: "Any characters allowed.",
    numbers: "0–9 only · e.g. 12345",
    alphanumeric_no_spaces: "A–Z, 0–9 · no spaces · e.g. Abc123",
    alphanumeric_with_spaces: "A–Z, 0–9, spaces · e.g. Abc 123",
    alphanumeric_hyphen_underscore: "A–Z, 0–9, space, - _ · e.g. Abc-12_x",
    alphabets_no_spaces: "A–Z only · e.g. Hello",
    alphabets_with_spaces: "A–Z and spaces · e.g. Hello World",
};

const TEXT_FORMAT_PATTERN: Record<string, RegExp> = {
    numbers: /^[0-9]+$/,
    alphanumeric_no_spaces: /^[a-zA-Z0-9]+$/,
    alphanumeric_with_spaces: /^[a-zA-Z0-9 ]+$/,
    alphanumeric_hyphen_underscore: /^[a-zA-Z0-9 _-]+$/,
    alphabets_no_spaces: /^[a-zA-Z]+$/,
    alphabets_with_spaces: /^[a-zA-Z ]+$/,
};

const VALID_TEXT_FORMATS = new Set(TEXT_FORMAT_OPTIONS.map((o) => o.value));

export function normalizeTextFormat(value: unknown): string {
    const key = typeof value === "string" ? value.trim() : "";
    return VALID_TEXT_FORMATS.has(key) ? key : "text";
}

export function validateTextFormatValue(value: string, formatKey: string): boolean {
    const fmt = normalizeTextFormat(formatKey);
    if (fmt === "text") return true;
    const pattern = TEXT_FORMAT_PATTERN[fmt];
    if (!pattern) return true;
    return pattern.test(value);
}

export function getTextFormatLabel(formatKey: string): string {
    const fmt = normalizeTextFormat(formatKey);
    return TEXT_FORMAT_OPTIONS.find((o) => o.value === fmt)?.label ?? "Text";
}

export function getTextFormatHelp(formatKey: string): string {
    const fmt = normalizeTextFormat(formatKey);
    return TEXT_FORMAT_HELP[fmt] ?? TEXT_FORMAT_HELP.text;
}

export function getTextFormatSample(formatKey: string): string | undefined {
    const fmt = normalizeTextFormat(formatKey);
    return TEXT_FORMAT_SAMPLES[fmt];
}

export function getTextFormatPlaceholder(formatKey: string): string | undefined {
    const sample = getTextFormatSample(formatKey);
    if (!sample || formatKey === "text" || normalizeTextFormat(formatKey) === "text") return undefined;
    return `e.g. ${sample}`;
}

export function getTextFormatErrorMessage(formatKey: string): string {
    const fmt = normalizeTextFormat(formatKey);
    if (fmt === "numbers") {
        return "Please enter numbers only (0-9).";
    }
    const sample = getTextFormatSample(fmt);
    if (sample) {
        return `Please enter a valid value (e.g. ${sample}).`;
    }
    return "Please enter a valid value in the correct format.";
}

const BACKEND_FIELD_KEY_MAP: Record<string, string> = {
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

function normalizeFieldType(value: unknown): string {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

function fieldStorefrontEnabled(raw: unknown): boolean {
    if (raw === false || raw === 0) return false;
    if (typeof raw === "string") {
        const s = raw.trim().toLowerCase();
        if (s === "false" || s === "0" || s === "off" || s === "no") return false;
    }
    return true;
}

function getEnabledFormFields(fields: unknown[]): unknown[] {
    return fields.filter((field) => {
        if (!field || typeof field !== "object") return false;
        const obj = field as Record<string, unknown>;
        const type = normalizeFieldType(obj.type);
        if (type === "password") return true;
        return fieldStorefrontEnabled(obj.enabled);
    });
}

function resolveSubmittedFieldKey(field: Record<string, unknown>, enabledIndex: number): string {
    const type = normalizeFieldType(field.type);
    return (
        BACKEND_FIELD_KEY_MAP[type] ||
        `custom_${String(field.label || "")
            .toLowerCase()
            .replace(/\s+/g, "_")}_${enabledIndex}`
    );
}

/** Map submitted field keys to textFormat from form config (custom_* and core text fields). */
export function buildTextFormatByFieldKey(fields: unknown): Map<string, string> {
    const map = new Map<string, string>();
    if (!Array.isArray(fields)) return map;

    const enabledFields = getEnabledFormFields(fields);
    enabledFields.forEach((field, enabledIndex) => {
        if (!field || typeof field !== "object") return;
        const obj = field as Record<string, unknown>;
        const type = normalizeFieldType(obj.type);
        if (type !== "text" && type !== "textarea") return;

        const textFormat = normalizeTextFormat(obj.textFormat);
        if (textFormat === "text") return;

        map.set(resolveSubmittedFieldKey(obj, enabledIndex), textFormat);
    });

    return map;
}
