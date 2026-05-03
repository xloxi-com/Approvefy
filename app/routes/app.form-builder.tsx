import {
    useMemo,
    useState,
    useEffect,
    useCallback,
    memo,
    useId,
    useRef,
    type CSSProperties,
    type FormEvent,
    type MouseEvent,
} from "react";
import { flushSync } from "react-dom";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import type { Prisma } from "@prisma/client";
import { useLoaderData, useSubmit, useNavigation, useActionData, useNavigate, useBlocker, useRevalidator } from "react-router";
import {
    Page,
    Card,
    TextField,
    Select,
    Checkbox,
    Banner,
    Toast,
    Button,
    BlockStack,
    InlineStack,
    Box,
    Text,
    Modal,
    Icon,
    Divider,
    Layout,
    Popover,
    OptionList,
    Tabs,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { invalidateFormFieldsCache } from "../lib/form-config-labels.server";
import "../styles/form-builder.css";
import "../styles/settings.css";
import { FormAppearancePanel } from "../components/FormAppearancePanel";
import { getAppearanceTemplateId, type AppearanceTemplateId } from "../lib/appearance-templates";
import {
    buildThemeCss,
    normalizeThemeSettings,
    THEME_DEFAULTS,
    type ThemeSettings,
} from "../lib/theme-settings";
import { STOREFRONT_FORM_DEFAULTS_EN } from "../lib/storefront-form-defaults";

import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PlusCircleIcon, DeleteIcon, ToggleOnIcon, ToggleOffIcon } from "@shopify/polaris-icons";

/** Date format keys used by the registration form to display/parse date fields */
export const DATE_FORMAT_PLACEHOLDERS: Record<string, string> = {
    dd_slash_mm_yyyy: "05/03/2026",
    mm_slash_dd_yyyy: "03/05/2026",
    yyyy_slash_mm_dd: "2026/03/05",
    yyyy_dash_mm_dd: "2026-03-05",
    dd_dash_mm_yyyy: "05-03-2026",
    mm_dash_dd_yy: "03-05-26",
    dd_dot_mm_yyyy: "05.03.2026",
    yyyymmdd: "20260305",
    dd_short_month_yyyy: "05 Mar 2026",
    d_short_month_yyyy: "5 Mar 2026",
    short_month_dd_yyyy: "Mar 05, 2026",
    short_month_d_yyyy: "Mar 5, 2026",
    dd_dash_short_month_yyyy: "05-Mar-2026",
    dd_full_month_yyyy: "05 March 2026",
    full_month_dd_yyyy: "March 05, 2026",
    d_ordinal_full_month_yyyy: "5th March 2026",
    weekday_full_month_d_yyyy: "Thursday, March 5, 2026",
};

export const DATE_FORMAT_OPTIONS: { label: string; value: string }[] = [
    { label: "DD/MM/YYYY (e.g. 05/03/2026)", value: "dd_slash_mm_yyyy" },
    { label: "MM/DD/YYYY (e.g. 03/05/2026)", value: "mm_slash_dd_yyyy" },
    { label: "YYYY/MM/DD (e.g. 2026/03/05)", value: "yyyy_slash_mm_dd" },
    { label: "YYYY-MM-DD (e.g. 2026-03-05)", value: "yyyy_dash_mm_dd" },
    { label: "DD-MM-YYYY (e.g. 05-03-2026)", value: "dd_dash_mm_yyyy" },
    { label: "MM-DD-YY (e.g. 03-05-26)", value: "mm_dash_dd_yy" },
    { label: "DD.MM.YYYY (e.g. 05.03.2026)", value: "dd_dot_mm_yyyy" },
    { label: "YYYYMMDD (e.g. 20260305)", value: "yyyymmdd" },
    { label: "DD Mon YYYY (e.g. 05 Mar 2026)", value: "dd_short_month_yyyy" },
    { label: "D Mon YYYY (e.g. 5 Mar 2026)", value: "d_short_month_yyyy" },
    { label: "Mon DD, YYYY (e.g. Mar 05, 2026)", value: "short_month_dd_yyyy" },
    { label: "Mon D, YYYY (e.g. Mar 5, 2026)", value: "short_month_d_yyyy" },
    { label: "DD-Mon-YYYY (e.g. 05-Mar-2026)", value: "dd_dash_short_month_yyyy" },
    { label: "DD Month YYYY (e.g. 05 March 2026)", value: "dd_full_month_yyyy" },
    { label: "Month DD, YYYY (e.g. March 05, 2026)", value: "full_month_dd_yyyy" },
    { label: "Dth Month YYYY (e.g. 5th March 2026)", value: "d_ordinal_full_month_yyyy" },
    { label: "Weekday, Month D, YYYY (e.g. Thursday, March 5, 2026)", value: "weekday_full_month_d_yyyy" },
];

/** Field types shown in the builder (matches SortableFieldRow / add-field picker). */
const FIELD_TYPE_OPTIONS: { label: string; value: string }[] = [
    { label: "First Name", value: "first_name" },
    { label: "Last Name", value: "last_name" },
    { label: "Email", value: "email" },
    { label: "Password", value: "password" },
    { label: "Phone", value: "phone" },
    { label: "Company", value: "company" },
    { label: "Address", value: "address" },
    { label: "City", value: "city" },
    { label: "State / Province", value: "state" },
    { label: "Zip / Postal Code", value: "zip_code" },
    { label: "Country", value: "country" },
    { label: "Text", value: "text" },
    { label: "Text Area", value: "textarea" },
    { label: "Number", value: "number" },
    { label: "Date", value: "date" },
    { label: "Dropdown", value: "dropdown" },
    { label: "Multiple Checkbox", value: "checkbox" },
    { label: "Newsletter subscription", value: "newsletter" },
    { label: "Radio", value: "radio" },
    { label: "Heading", value: "heading" },
    { label: "File Upload", value: "file_upload" },
];

const DEFAULT_SYSTEM_FIELD_TYPES = new Set(["first_name", "last_name", "email"]);
const CUSTOM_FIELD_TYPE_OPTIONS = FIELD_TYPE_OPTIONS.filter((opt) => !DEFAULT_SYSTEM_FIELD_TYPES.has(opt.value));
const SINGLE_INSTANCE_FIELD_TYPES = new Set([
    "password",
    "phone",
    "company",
    "address",
    "city",
    "state",
    "zip_code",
    "country",
]);
const ADDRESS_BUNDLE_TYPES = ["address", "city", "state", "zip_code", "country"] as const;
const ADDRESS_BUNDLE_CHILD_TYPES = new Set(["city", "state", "zip_code", "country"]);
const DEFAULT_REQUIRED_FIELD_TYPES = new Set(["email", "city", "state", "zip_code", "country"]);
const LOCKED_REQUIRED_FIELD_TYPES = new Set(["email"]);
/** Storefront visibility: false only when explicitly disabled (handles string booleans from legacy JSON). */
function coalesceFieldEnabled(raw: unknown): boolean {
    if (raw === false || raw === 0) return false;
    if (typeof raw === "string") {
        const s = raw.trim().toLowerCase();
        if (s === "false" || s === "0" || s === "off" || s === "no") return false;
        if (s === "true" || s === "1" || s === "on" || s === "yes") return true;
    }
    return true;
}

function normalizeFieldType(value: unknown): string {
    const raw = String(value ?? "").trim().toLowerCase();
    if (!raw) return "";
    if (raw === "password") return "password";
    if (raw === "phone") return "phone";
    if (raw === "company") return "company";
    if (raw === "address") return "address";
    if (raw === "city") return "city";
    if (["state", "state_province", "province", "state / province"].includes(raw)) return "state";
    if (["zip_code", "zip", "postal_code", "postcode", "zip / postal code"].includes(raw)) return "zip_code";
    if (raw === "country") return "country";
    return raw;
}
function getDefaultLabelForType(type: string): string {
    return FIELD_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? "New Field";
}
function createFieldFromType(type: string, step = 1): FormField {
    const normalizedType = normalizeFieldType(type) || "text";
    const field: FormField = {
        label: getDefaultLabelForType(normalizedType),
        type: normalizedType,
        required: DEFAULT_REQUIRED_FIELD_TYPES.has(normalizedType),
        enabled: true,
        step,
        helpText: "",
        placeholder: "",
        width: "100",
        sortKey: newFieldSortKey(),
    };
    if (normalizedType === "heading") {
        field.label = "Heading";
        field.headingLevel = "h3";
    }
    if (["dropdown", "checkbox", "radio"].includes(normalizedType)) {
        field.options = ["Option 1", "Option 2"];
    }
    if (normalizedType === "newsletter") {
        field.label = "Subscribe to newsletter";
        field.options = ["Yes, I want email updates"];
        field.minRequired = 0;
    }
    if (normalizedType === "date") {
        field.dateFormat = "dd_slash_mm_yyyy";
    }
    return field;
}
function getSelectableCustomTypeOptions(
    options: { label: string; value: string }[],
    currentType?: string,
): { label: string; value: string }[] {
    const normalizedCurrentType = normalizeFieldType(currentType);
    return options.filter((opt) => {
        const normalizedType = normalizeFieldType(opt.value);
        if (!ADDRESS_BUNDLE_CHILD_TYPES.has(normalizedType)) return true;
        return normalizedType === normalizedCurrentType;
    });
}
function normalizeAndDeduplicateFieldTypes(list: FormField[]): FormField[] {
    const seenSingleInstanceTypes = new Set<string>();
    return list.map((field) => {
        const normalizedType = normalizeFieldType(field.type);
        if (!normalizedType) return { ...field, type: "text" };
        if (!SINGLE_INSTANCE_FIELD_TYPES.has(normalizedType)) {
            return normalizedType === field.type ? field : { ...field, type: normalizedType };
        }
        if (!seenSingleInstanceTypes.has(normalizedType)) {
            seenSingleInstanceTypes.add(normalizedType);
            return normalizedType === field.type ? field : { ...field, type: normalizedType };
        }
        // Keep duplicate row, but downgrade type so unique system fields stay single-instance.
        return { ...field, type: "text" };
    });
}

const FORM_BUILDER_LEFT_TABS = [
    { id: "fb-general", content: "General", panelID: "fb-general-panel" },
    { id: "fb-appearance", content: "Appearance", panelID: "fb-appearance-panel" },
] as const;

function shopAppearanceFromRow(
    row: { themeSettings?: unknown; customCss?: string | null; customerApprovalSettings?: unknown } | null,
): { themeSettings: ThemeSettings; customCss: string; appearanceTemplateId: AppearanceTemplateId } {
    let themeSettings = THEME_DEFAULTS;
    if (row?.themeSettings) {
        themeSettings = normalizeThemeSettings(row.themeSettings);
    }
    let customCss = "";
    if (typeof row?.customCss === "string" && row.customCss.trim()) {
        const trimmed = row.customCss.trim();
        const isAutoGenerated =
            trimmed.includes("Auto-generated from Settings") ||
            trimmed === buildThemeCss(normalizeThemeSettings(themeSettings));
        if (!isAutoGenerated) {
            customCss = row.customCss;
        }
    }
    let appearanceTemplateId = getAppearanceTemplateId(undefined);
    let cas = row?.customerApprovalSettings;
    if (typeof cas === "string") {
        try {
            cas = JSON.parse(cas) as Record<string, unknown>;
        } catch {
            cas = undefined;
        }
    }
    if (cas && typeof cas === "object" && !Array.isArray(cas)) {
        appearanceTemplateId = getAppearanceTemplateId((cas as Record<string, unknown>).appearanceTemplateId);
    }
    return { themeSettings, customCss, appearanceTemplateId };
}

interface FormField {
    label: string;
    type: string;
    required: boolean;
    enabled?: boolean;
    step?: number;
    isDefault?: boolean;
    helpText?: string;
    placeholder?: string;
    width?: "30" | "50" | "100";
    phoneCountryCode?: string;
    options?: string[];
    headingLevel?: "h2" | "h3" | "h4";
    /** Date display/input format for type "date" (e.g. dd_slash_mm_yyyy). */
    dateFormat?: string;
    /** Max number of files allowed for file_upload (1–20, default 1). */
    maxFileCount?: number;
    /** Max file size in MB for file_upload (2, 5, 10, 15, 20, 25; default 5). */
    maxFileSizeMb?: number;
    /** Minimum number of options that must be selected for type "checkbox" (0–10; 0 = no minimum). */
    minRequired?: number;
    /**
     * Stable id for @dnd-kit sortable rows. Assigned in the form builder only; not read by the storefront
     * and omitted when fields are validated for persistence.
     */
    sortKey?: string;
}

function newFieldSortKey(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `fld-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Ensures each field has a stable sortable id (required because index-based ids break @dnd-kit after reorder). */
function assignSortKeys(list: FormField[]): FormField[] {
    return list.map((f) => (f.sortKey ? f : { ...f, sortKey: newFieldSortKey() }));
}

/** Parse options text (one per line) - handles \\n, \\r\\n, \\r */
function parseOptionsFromText(text: string): string[] {
    return text
        .split(/\r?\n|\r/)
        .map((s) => s.trim())
        .filter(Boolean);
}

const DEFAULT_FIELDS: FormField[] = [
    { label: "First Name", type: "first_name", required: true, enabled: true, step: 1, isDefault: true },
    { label: "Last Name", type: "last_name", required: true, enabled: true, step: 1, isDefault: true },
    { label: "Email", type: "email", required: true, enabled: true, step: 1, isDefault: true },
    { label: "Password", type: "password", required: false, enabled: true, step: 1, isDefault: false },
];

function IconText() {
    return (
        <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
            <path d="M5.5 4a.75.75 0 0 0-.7.5l-3.25 9a.75.75 0 1 0 1.4.5l.83-2.3h3.44l.83 2.3a.75.75 0 1 0 1.4-.5l-3.25-9a.75.75 0 0 0-.7-.5zm0 2.35 1.27 3.5H4.23L5.5 6.35zM14 5a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-1.5v1.5a.75.75 0 0 1-1.5 0v-1.5h-1.5a.75.75 0 0 1 0-1.5h1.5v-1.5A.75.75 0 0 1 14 5z" />
        </svg>
    );
}

function IconEmail() {
    return (
        <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
        </svg>
    );
}

function IconPhone() {
    return (
        <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
        </svg>
    );
}

function IconCompany() {
    return (
        <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
        </svg>
    );
}

function IconNumber() {
    return (
        <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
            <path d="M8.5 2.75a.75.75 0 00-1.46-.25l-1 4.5H3.75a.75.75 0 000 1.5h1.84l-.89 4H2.75a.75.75 0 000 1.5H4.3l-.76 3.45a.75.75 0 001.46.3l.86-3.75h3.78l-.76 3.45a.75.75 0 001.46.3l.86-3.75h2.05a.75.75 0 000-1.5h-1.72l.89-4h2.08a.75.75 0 000-1.5h-1.75l.79-3.45a.75.75 0 00-1.46-.3L11.84 7H8.06l.44-4.25zM7.73 8.5h3.78l-.89 4H6.84l.89-4z" />
        </svg>
    );
}

function IconCalendar() {
    return (
        <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
        </svg>
    );
}

function IconFileUpload() {
    return (
        <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
    );
}

function IconDropdown() {
    return (
        <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
    );
}

function IconCheckbox() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="m18 2h-12c-2.21 0-4 1.79-4 4v12c0 2.21 1.79 4 4 4h12c2.21 0 4-1.79 4-4v-12c0-2.21-1.79-4-4-4zm-1.29 8.04-5.33 5.33c-.19.19-.44.29-.71.29s-.52-.11-.71-.29l-2.67-2.67c-.39-.39-.39-1.02 0-1.41s1.02-.39 1.41 0l1.96 1.96 4.63-4.63c.39-.39 1.02-.39 1.41 0s.39 1.02 0 1.41z" />
        </svg>
    );
}

function IconRadio() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <path d="m12 22c-5.523 0-10-4.477-10-10s4.477-10 10-10 10 4.477 10 10-4.477 10-10 10zm0-2c2.1217 0 4.1566-.8429 5.6569-2.3431 1.5002-1.5003 2.3431-3.5352 2.3431-5.6569 0-2.12173-.8429-4.15656-2.3431-5.65685-1.5003-1.5003-3.5352-2.34315-5.6569-2.34315-2.12173 0-4.15656.84285-5.65685 2.34315-1.5003 1.50029-2.34315 3.53512-2.34315 5.65685 0 2.1217.84285 4.1566 2.34315 5.6569 1.50029 1.5002 3.53512 2.3431 5.65685 2.3431zm0-3c-1.3261 0-2.59785-.5268-3.53553-1.4645-.93769-.9376-1.46447-2.2094-1.46447-3.5355s.52678-2.59785 1.46447-3.53553c.93768-.93769 2.20943-1.46447 3.53553-1.46447s2.5979.52678 3.5355 1.46447c.9377.93768 1.4645 2.20943 1.4645 3.53553s-.5268 2.5979-1.4645 3.5355c-.9376.9377-2.2094 1.4645-3.5355 1.4645z" />
        </svg>
    );
}

function IconHeading() {
    return (
        <svg viewBox="0 0 512 512" fill="currentColor" width="18" height="18">
            <path d="m456 89.333v333.333h33.333c9.205 0 16.667 7.462 16.667 16.667v33.333c0 9.205-7.462 16.667-16.667 16.667h-166.666c-9.205 0-16.667-7.462-16.667-16.667v-33.333c0-9.205 7.462-16.667 16.667-16.667h33.333v-133.333h-200v133.333h33.333c9.205 0 16.667 7.462 16.667 16.667v33.333c0 9.205-7.462 16.667-16.667 16.667h-166.666c-9.205 0-16.667-7.462-16.667-16.666v-33.333c0-9.205 7.462-16.667 16.667-16.667h33.333v-333.334h-33.333c-9.205 0-16.667-7.462-16.667-16.666v-33.334c0-9.205 7.462-16.667 16.667-16.667h166.667c9.205 0 16.667 7.462 16.667 16.667v33.333c0 9.205-7.462 16.667-16.667 16.667h-33.334v133.333h200v-133.333h-33.333c-9.205 0-16.667-7.462-16.667-16.667v-33.333c0-9.205 7.462-16.667 16.667-16.667h166.667c9.205 0 16.667 7.462 16.667 16.667v33.333c0 9.205-7.462 16.667-16.667 16.667z" />
        </svg>
    );
}

function IconAddress() {
    return (
        <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
        </svg>
    );
}

const FIELD_ICONS: Record<string, { icon: React.ReactNode; bg: string }> = {
    first_name: { icon: <IconText />, bg: "#f0f0f0" },
    last_name: { icon: <IconText />, bg: "#f0f0f0" },
    email: { icon: <IconEmail />, bg: "#eef4ff" },
    password: { icon: <IconText />, bg: "#f3f0ff" },
    phone: { icon: <IconPhone />, bg: "#edfaf0" },
    company: { icon: <IconCompany />, bg: "#f0f0ff" },
    text: { icon: <IconText />, bg: "#f0f0f0" },
    number: { icon: <IconNumber />, bg: "#fff8e6" },
    date: { icon: <IconCalendar />, bg: "#f0f8ff" },
    file_upload: { icon: <IconFileUpload />, bg: "#f5f0ff" },
    dropdown: { icon: <IconDropdown />, bg: "#e8f4fd" },
    checkbox: { icon: <IconCheckbox />, bg: "#fef9e7" },
    newsletter: { icon: <IconCheckbox />, bg: "#fef9e7" },
    radio: { icon: <IconRadio />, bg: "#f0e6fa" },
    textarea: { icon: <IconText />, bg: "#f0f5ff" },
    heading: { icon: <IconHeading />, bg: "#e8e8e8" },
    address: { icon: <IconAddress />, bg: "#f0f4ff" },
    zip_code: { icon: <IconAddress />, bg: "#f0f4ff" },
    city: { icon: <IconAddress />, bg: "#f0f4ff" },
    state: { icon: <IconAddress />, bg: "#f0f4ff" },
    country: { icon: <IconAddress />, bg: "#f0f4ff" },
};

/** Polaris-compatible drag handle (two columns of dots). */
function DragHandleIcon() {
    return (
        <svg viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="3" r="1.2" />
            <circle cx="11" cy="3" r="1.2" />
            <circle cx="5" cy="8" r="1.2" />
            <circle cx="11" cy="8" r="1.2" />
            <circle cx="5" cy="13" r="1.2" />
            <circle cx="11" cy="13" r="1.2" />
        </svg>
    );
}

// ─── Sortable Field Row ───
const SortableFieldRow = memo(function SortableFieldRow({
    field,
    index,
    fieldId,
    expandedIndex,
    onToggleExpand,
    onUpdate,
    onRemove,
    typeOptions,
    shopCountryCode,
    showStepField,
}: {
    field: FormField;
    index: number;
    fieldId: string;
    expandedIndex: number | null;
    onToggleExpand: (i: number) => void;
    onUpdate: (i: number, key: keyof FormField, val: string | boolean | number | string[]) => void;
    onRemove: (i: number) => void;
    typeOptions: { label: string; value: string }[];
    shopCountryCode: string;
    showStepField?: boolean;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: fieldId });

    const isExpanded = expandedIndex === index;
    const isDefault = !!field.isDefault;
    const normalizedFieldType = normalizeFieldType(field.type);
    const isAddressBundleField = ADDRESS_BUNDLE_TYPES.includes(
        normalizedFieldType as (typeof ADDRESS_BUNDLE_TYPES)[number],
    );
    const isRequiredLocked = LOCKED_REQUIRED_FIELD_TYPES.has(normalizedFieldType);
    const canRemoveField = !isDefault && !ADDRESS_BUNDLE_CHILD_TYPES.has(normalizedFieldType);
    const canToggleStorefrontVisibility = true;

    const [typePopoverActive, setTypePopoverActive] = useState(false);
    const typeFieldLabelId = useId();

    useEffect(() => {
        if (!isExpanded) setTypePopoverActive(false);
    }, [isExpanded]);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };
    const iconInfo = FIELD_ICONS[field.type] || FIELD_ICONS.text;
    const isShownOnStorefront = field.enabled !== false;

    return (
        <div ref={setNodeRef} style={style}>
            <div
                role="button"
                tabIndex={0}
                className={`fb-field-row ${isDragging ? "fb-dragging" : ""} ${!isShownOnStorefront ? "fb-field-row--hidden" : ""}`}
                onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button") != null) return;
                    onToggleExpand(index);
                }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggleExpand(index); }}
            >
                <InlineStack gap="300" blockAlign="center" wrap={false}>
                    {/* dnd-kit spreads role/tabIndex onto the handle; eslint cannot see the spread */}
                    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- drag handle from @dnd-kit */}
                    <div
                        className="fb-drag-handle"
                        {...attributes}
                        {...listeners}
                        aria-label="Drag to reorder field"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                    >
                        <Icon source={DragHandleIcon} tone="subdued" />
                    </div>

                    <Box
                        minWidth="32px"
                        minHeight="32px"
                        padding="100"
                        borderRadius="200"
                        overflowX="hidden"
                        overflowY="hidden"
                        style={{
                            backgroundColor: iconInfo.bg,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <span aria-hidden>{iconInfo.icon}</span>
                    </Box>

                    <Box minWidth="0" style={{ flex: "1 1 auto", minWidth: 0 }}>
                        <InlineStack gap="100" blockAlign="center" wrap={false}>
                            <Text as="span" variant="bodyMd" fontWeight="semibold" truncate>
                                {field.label}
                            </Text>
                            {field.required && (
                                <Text as="span" variant="bodyMd" tone="critical" fontWeight="bold">
                                    *
                                </Text>
                            )}
                        </InlineStack>
                    </Box>

                    <InlineStack gap="100" blockAlign="center" wrap={false}>
                        {canToggleStorefrontVisibility && (
                            <Button
                                variant="plain"
                                icon={isShownOnStorefront ? ToggleOnIcon : ToggleOffIcon}
                                accessibilityLabel={
                                    isShownOnStorefront ? "Hide field from storefront" : "Show field on storefront"
                                }
                                onClick={(e: MouseEvent<HTMLButtonElement>) => {
                                    e.stopPropagation();
                                    onUpdate(index, "enabled", !isShownOnStorefront);
                                }}
                            />
                        )}
                        {canRemoveField && (
                            <Button
                                variant="plain"
                                icon={DeleteIcon}
                                accessibilityLabel="Remove field"
                                onClick={(e: MouseEvent<HTMLButtonElement>) => {
                                    e.stopPropagation();
                                    onRemove(index);
                                }}
                            />
                        )}
                    </InlineStack>
                </InlineStack>
            </div>

            {isExpanded && (
                <div className="fb-edit-panel">
                    <TextField
                        label={field.type === "heading" ? "Heading text" : "Label"}
                        value={field.label}
                        onChange={(val) => onUpdate(index, "label", val)}
                        autoComplete="off"
                    />
                    <TextField
                        label="Help text"
                        value={field.helpText ?? ""}
                        onChange={(val) => onUpdate(index, "helpText", val)}
                        autoComplete="off"
                        placeholder="Optional helper or description"
                    />
                    {field.type !== "heading" && (
                        <TextField
                            label="Placeholder"
                            value={field.placeholder ?? ""}
                            onChange={(val) => onUpdate(index, "placeholder", val)}
                            autoComplete="off"
                            placeholder="Placeholder text for input"
                        />
                    )}
                    {normalizedFieldType === "password" && (
                        <div style={{ gridColumn: "1 / -1" }}>
                            <Text as="p" tone="critical" variant="bodySm">
                                Note: This field only works on stores that still use legacy customer accounts. It does not apply to all new customer account experiences.
                            </Text>
                        </div>
                    )}
                    <Select
                        label="Field width"
                        options={[
                            { label: "100%", value: "100" },
                            { label: "50%", value: "50" },
                            { label: "33%", value: "30" },
                        ]}
                        value={field.width ?? "100"}
                        onChange={(val) => onUpdate(index, "width", val as "30" | "50" | "100")}
                    />
                    {field.type === "heading" && (
                        <Select
                            label="Heading level"
                            options={[
                                { label: "Heading 2", value: "h2" },
                                { label: "Heading 3", value: "h3" },
                                { label: "Heading 4", value: "h4" },
                            ]}
                            value={field.headingLevel ?? "h3"}
                            onChange={(val) => onUpdate(index, "headingLevel", val as "h2" | "h3" | "h4")}
                        />
                    )}
                    {["dropdown", "checkbox", "radio", "newsletter"].includes((field.type || "").toLowerCase()) && (
                        <TextField
                            label="Options (one per line)"
                            value={(field.options || []).join("\n")}
                            onChange={(val) => onUpdate(index, "options", parseOptionsFromText(val))}
                            autoComplete="off"
                            multiline={3}
                            placeholder={
                                (field.type || "").toLowerCase() === "newsletter"
                                    ? "Yes, I want email updates"
                                    : "Option 1\nOption 2\nOption 3"
                            }
                        />
                    )}
                    {(field.type || "").toLowerCase() === "checkbox" && (
                        <Select
                            label="Minimum required"
                            options={[
                                { label: "None", value: "0" },
                                { label: "1", value: "1" },
                                { label: "2", value: "2" },
                                { label: "3", value: "3" },
                                { label: "4", value: "4" },
                                { label: "5", value: "5" },
                                { label: "6", value: "6" },
                                { label: "7", value: "7" },
                                { label: "8", value: "8" },
                                { label: "9", value: "9" },
                                { label: "10", value: "10" },
                            ]}
                            value={String(field.minRequired ?? 0)}
                            onChange={(val) => onUpdate(index, "minRequired", parseInt(val, 10) || 0)}
                        />
                    )}
                    <div style={{ gridColumn: "1 / -1" }}>
                        <BlockStack gap="100">
                            <Text as="p" variant="bodyMd" fontWeight="semibold" id={typeFieldLabelId}>
                                Type
                            </Text>
                            <Popover
                                active={typePopoverActive}
                                preferredPosition="below"
                                preferredAlignment="left"
                                fullWidth
                                onClose={() => setTypePopoverActive(false)}
                                activator={
                                    <Button
                                        fullWidth
                                        textAlign="start"
                                        disclosure="select"
                                        pressed={typePopoverActive}
                                        disabled={isDefault || isAddressBundleField}
                                        onClick={() => {
                                            if (!isDefault && !isAddressBundleField) setTypePopoverActive((open) => !open);
                                        }}
                                        aria-labelledby={typeFieldLabelId}
                                    >
                                        {typeOptions.find((o) => o.value === field.type)?.label ?? field.type}
                                    </Button>
                                }
                            >
                                <Popover.Pane maxHeight="min(320px, 50vh)">
                                    <OptionList
                                        options={typeOptions.map((o) => ({
                                            value: o.value,
                                            label: o.label,
                                        }))}
                                        selected={[field.type]}
                                        onChange={(selected) => {
                                            if (isAddressBundleField) {
                                                setTypePopoverActive(false);
                                                return;
                                            }
                                            const next = selected[0];
                                            if (next) onUpdate(index, "type", next);
                                            setTypePopoverActive(false);
                                        }}
                                    />
                                </Popover.Pane>
                            </Popover>
                        </BlockStack>
                    </div>
                    {((field.type || "").toLowerCase() === "phone" || (field.type || "").toLowerCase() === "country") && (
                        <Select
                            label={field.type === "country" ? "Default country" : "Default country code"}
                            options={COUNTRY_OPTIONS}
                            value={field.phoneCountryCode || shopCountryCode}
                            onChange={(val) => onUpdate(index, "phoneCountryCode", val)}
                        />
                    )}
                    {(field.type || "").toLowerCase() === "date" && (
                        <Select
                            label="Date format"
                            options={DATE_FORMAT_OPTIONS}
                            value={field.dateFormat ?? "dd_slash_mm_yyyy"}
                            onChange={(val) => onUpdate(index, "dateFormat", val)}
                        />
                    )}
                    {(field.type || "").toLowerCase() === "file_upload" && (
                        <>
                            <TextField
                                label="Max file upload count"
                                type="number"
                                value={String(field.maxFileCount ?? 1)}
                                onChange={(val) => {
                                    const n = val === "" ? 1 : parseInt(val, 10);
                                    onUpdate(index, "maxFileCount", Number.isNaN(n) || n < 1 ? 1 : n > 20 ? 20 : n);
                                }}
                                autoComplete="off"
                                min={1}
                                max={20}
                                helpText="Number of files the customer can upload (1–20)."
                            />
                            <Select
                                label="Max file size (MB)"
                                options={[
                                    { label: "2 MB", value: "2" },
                                    { label: "5 MB", value: "5" },
                                    { label: "10 MB", value: "10" },
                                    { label: "15 MB", value: "15" },
                                    { label: "20 MB", value: "20" },
                                    { label: "25 MB", value: "25" },
                                ]}
                                value={String(field.maxFileSizeMb ?? 5)}
                                onChange={(val) => onUpdate(index, "maxFileSizeMb", parseInt(val, 10) || 5)}
                            />
                        </>
                    )}
                    <div className="fb-edit-full">
                        <Checkbox
                            label="Required"
                            checked={field.required}
                            onChange={(val) => onUpdate(index, "required", val)}
                            disabled={(field.type || "").toLowerCase() === "heading" || isRequiredLocked}
                        />
                        {showStepField !== false && (
                            <TextField
                                label="Step"
                                type="number"
                                value={String(field.step ?? 1)}
                                onChange={(val) => onUpdate(index, "step", val === "" ? 1 : parseInt(val, 10) || 1)}
                                autoComplete="off"
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
});

// ─── Loader & Action (unchanged) ───

const COUNTRY_TO_DIAL: Record<string, string> = {
    AF: "+93", AL: "+355", DZ: "+213", AD: "+376", AO: "+244", AG: "+1268", AR: "+54", AM: "+374", AU: "+61", AT: "+43", AZ: "+994",
    BS: "+1242", BH: "+973", BD: "+880", BB: "+1246", BY: "+375", BE: "+32", BZ: "+501", BJ: "+229", BT: "+975", BO: "+591", BA: "+387",
    BW: "+267", BR: "+55", BN: "+673", BG: "+359", BF: "+226", BI: "+257", KH: "+855", CM: "+237", CA: "+1", CV: "+238", CF: "+236",
    TD: "+235", CL: "+56", CN: "+86", CO: "+57", KM: "+269", CG: "+242", CD: "+243", CR: "+506", CI: "+225", HR: "+385", CU: "+53",
    CY: "+357", CZ: "+420", DK: "+45", DJ: "+253", DM: "+1767", DO: "+1809", EC: "+593", EG: "+20", SV: "+503", GQ: "+240", ER: "+291",
    EE: "+372", SZ: "+268", ET: "+251", FJ: "+679", FI: "+358", FR: "+33", GA: "+241", GM: "+220", GE: "+995", DE: "+49", GH: "+233",
    GR: "+30", GD: "+1473", GT: "+502", GN: "+224", GW: "+245", GY: "+592", HT: "+509", HN: "+504", HK: "+852", HU: "+36", IS: "+354",
    IN: "+91", ID: "+62", IR: "+98", IQ: "+964", IE: "+353", IL: "+972", IT: "+39", JM: "+1876", JP: "+81", JO: "+962", KZ: "+7",
    KE: "+254", KI: "+686", KP: "+850", KR: "+82", KW: "+965", KG: "+996", LA: "+856", LV: "+371", LB: "+961", LS: "+266", LR: "+231",
    LY: "+218", LI: "+423", LT: "+370", LU: "+352", MO: "+853", MG: "+261", MW: "+265", MY: "+60", MV: "+960", ML: "+223", MT: "+356",
    MH: "+692", MR: "+222", MU: "+230", MX: "+52", FM: "+691", MD: "+373", MC: "+377", MN: "+976", ME: "+382", MA: "+212", MZ: "+258",
    MM: "+95", NA: "+264", NR: "+674", NP: "+977", NL: "+31", NZ: "+64", NI: "+505", NE: "+227", NG: "+234", MK: "+389", NO: "+47",
    OM: "+968", PK: "+92", PW: "+680", PA: "+507", PG: "+675", PY: "+595", PE: "+51", PH: "+63", PL: "+48", PT: "+351", PR: "+1787",
    QA: "+974", RO: "+40", RU: "+7", RW: "+250", KN: "+1869", LC: "+1758", VC: "+1784", WS: "+685", SM: "+378", ST: "+239", SA: "+966",
    SN: "+221", RS: "+381", SC: "+248", SL: "+232", SG: "+65", SK: "+421", SI: "+386", SB: "+677", SO: "+252", ZA: "+27", SS: "+211",
    ES: "+34", LK: "+94", SD: "+249", SR: "+597", SE: "+46", CH: "+41", SY: "+963", TW: "+886", TJ: "+992", TZ: "+255", TH: "+66",
    TL: "+670", TG: "+228", TO: "+676", TT: "+1868", TN: "+216", TM: "+993", TV: "+688", UG: "+256", UA: "+380", AE: "+971", GB: "+44",
    US: "+1", UY: "+598", UZ: "+998", VU: "+678", VA: "+379", VE: "+58", VN: "+84", YE: "+967", ZM: "+260", ZW: "+263", XK: "+383",
};

const COUNTRY_NAMES: Record<string, string> = {
    AF: "Afghanistan", AL: "Albania", DZ: "Algeria", AD: "Andorra", AO: "Angola", AG: "Antigua", AR: "Argentina", AM: "Armenia",
    AU: "Australia", AT: "Austria", AZ: "Azerbaijan", BS: "Bahamas", BH: "Bahrain", BD: "Bangladesh", BB: "Barbados", BY: "Belarus",
    BE: "Belgium", BZ: "Belize", BJ: "Benin", BT: "Bhutan", BO: "Bolivia", BA: "Bosnia", BW: "Botswana", BR: "Brazil", BN: "Brunei",
    BG: "Bulgaria", BF: "Burkina Faso", BI: "Burundi", KH: "Cambodia", CM: "Cameroon", CA: "Canada", CV: "Cape Verde", CF: "Central African Rep",
    TD: "Chad", CL: "Chile", CN: "China", CO: "Colombia", KM: "Comoros", CG: "Congo", CD: "DR Congo", CR: "Costa Rica", CI: "Ivory Coast",
    HR: "Croatia", CU: "Cuba", CY: "Cyprus", CZ: "Czech Republic", DK: "Denmark", DJ: "Djibouti", DM: "Dominica", DO: "Dominican Rep",
    EC: "Ecuador", EG: "Egypt", SV: "El Salvador", GQ: "Equatorial Guinea", ER: "Eritrea", EE: "Estonia", SZ: "Eswatini", ET: "Ethiopia",
    FJ: "Fiji", FI: "Finland", FR: "France", GA: "Gabon", GM: "Gambia", GE: "Georgia", DE: "Germany", GH: "Ghana", GR: "Greece",
    GD: "Grenada", GT: "Guatemala", GN: "Guinea", GW: "Guinea-Bissau", GY: "Guyana", HT: "Haiti", HN: "Honduras", HK: "Hong Kong",
    HU: "Hungary", IS: "Iceland", IN: "India", ID: "Indonesia", IR: "Iran", IQ: "Iraq", IE: "Ireland", IL: "Israel", IT: "Italy",
    JM: "Jamaica", JP: "Japan", JO: "Jordan", KZ: "Kazakhstan", KE: "Kenya", KI: "Kiribati", KP: "North Korea", KR: "South Korea",
    KW: "Kuwait", KG: "Kyrgyzstan", LA: "Laos", LV: "Latvia", LB: "Lebanon", LS: "Lesotho", LR: "Liberia", LY: "Libya", LI: "Liechtenstein",
    LT: "Lithuania", LU: "Luxembourg", MO: "Macau", MG: "Madagascar", MW: "Malawi", MY: "Malaysia", MV: "Maldives", ML: "Mali",
    MT: "Malta", MH: "Marshall Islands", MR: "Mauritania", MU: "Mauritius", MX: "Mexico", FM: "Micronesia", MD: "Moldova", MC: "Monaco",
    MN: "Mongolia", ME: "Montenegro", MA: "Morocco", MZ: "Mozambique", MM: "Myanmar", NA: "Namibia", NR: "Nauru", NP: "Nepal",
    NL: "Netherlands", NZ: "New Zealand", NI: "Nicaragua", NE: "Niger", NG: "Nigeria", MK: "North Macedonia", NO: "Norway",
    OM: "Oman", PK: "Pakistan", PW: "Palau", PA: "Panama", PG: "Papua New Guinea", PY: "Paraguay", PE: "Peru", PH: "Philippines",
    PL: "Poland", PT: "Portugal", PR: "Puerto Rico", QA: "Qatar", RO: "Romania", RU: "Russia", RW: "Rwanda", KN: "Saint Kitts",
    LC: "Saint Lucia", VC: "Saint Vincent", WS: "Samoa", SM: "San Marino", ST: "Sao Tome", SA: "Saudi Arabia", SN: "Senegal",
    RS: "Serbia", SC: "Seychelles", SL: "Sierra Leone", SG: "Singapore", SK: "Slovakia", SI: "Slovenia", SB: "Solomon Islands",
    SO: "Somalia", ZA: "South Africa", SS: "South Sudan", ES: "Spain", LK: "Sri Lanka", SD: "Sudan", SR: "Suriname", SE: "Sweden",
    CH: "Switzerland", SY: "Syria", TW: "Taiwan", TJ: "Tajikistan", TZ: "Tanzania", TH: "Thailand", TL: "Timor-Leste", TG: "Togo",
    TO: "Tonga", TT: "Trinidad", TN: "Tunisia", TR: "Turkey", TM: "Turkmenistan", TV: "Tuvalu", UG: "Uganda", UA: "Ukraine",
    AE: "UAE", GB: "United Kingdom", US: "United States", UY: "Uruguay", UZ: "Uzbekistan", VU: "Vanuatu", VA: "Vatican", VE: "Venezuela",
    VN: "Vietnam", YE: "Yemen", ZM: "Zambia", ZW: "Zimbabwe", XK: "Kosovo",
};

const COUNTRY_OPTIONS = Object.entries(COUNTRY_TO_DIAL)
    .sort(([a], [b]) => (COUNTRY_NAMES[a] || a).localeCompare(COUNTRY_NAMES[b] || b))
    .map(([cc, dial]) => ({ label: `${dial} ${COUNTRY_NAMES[cc] || cc}`, value: cc }));

/** Normalize options for radio/checkbox/dropdown before saving/loading */
function normalizeFieldOptions(field: FormField): FormField {
    const type = (field.type || "").toLowerCase();
    if (!["radio", "checkbox", "dropdown", "newsletter"].includes(type) || !field.options) return field;
    const opts = field.options
        .map((s) => String(s).trim())
        .filter(Boolean);
    return { ...field, options: opts };
}

const FORM_TYPE_OPTIONS = [
    { label: "Wholesale registration form", value: "wholesale" },
    { label: "Multi-step form", value: "multi_step" },
];

const SHOP_COUNTRY_CODE_CACHE_TTL_MS = 10 * 60_000;
const SHOP_COUNTRY_CODE_CACHE_MAX = 500;
const shopCountryCodeCache = new Map<string, { code: string; at: number }>();

async function resolveShopCountryCode(
    admin: { graphql: (query: string) => Promise<Response> },
    shop: string,
    timeoutMs = 2500
): Promise<string> {
    const cacheKey = (shop || "").trim().toLowerCase();
    const cached = cacheKey ? shopCountryCodeCache.get(cacheKey) : null;
    if (cached && Date.now() - cached.at < SHOP_COUNTRY_CODE_CACHE_TTL_MS) {
        return cached.code;
    }
    try {
        const response = await Promise.race([
            admin.graphql(`#graphql query getShopCountry { shop { billingAddress { countryCodeV2 } } }`),
            new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error("Shop country lookup timed out")), timeoutMs);
            }),
        ]);
        const shopData = await response.json();
        const code = shopData?.data?.shop?.billingAddress?.countryCodeV2;
        if (typeof code === "string" && code.trim().length > 0) {
            const normalized = code.toUpperCase();
            if (cacheKey) {
                shopCountryCodeCache.set(cacheKey, { code: normalized, at: Date.now() });
                if (shopCountryCodeCache.size > SHOP_COUNTRY_CODE_CACHE_MAX) {
                    const oldest = shopCountryCodeCache.keys().next().value;
                    if (oldest != null) shopCountryCodeCache.delete(oldest);
                }
            }
            return normalized;
        }
    } catch (e) {
        console.warn("Shop country lookup failed, using US fallback:", e);
    }
    return "US";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;
    const url = new URL(request.url);
    const formIdParam = url.searchParams.get("formId");
    const isNew = url.searchParams.get("new") === "1";
    const formTypeParam = url.searchParams.get("formType") || "wholesale";

    let shopCountryCode = "US";
    const shopCountryCodePromise = resolveShopCountryCode(admin, shop);

    let config: { fields: FormField[] } = { fields: [] };
    let formId: string | null = null;
    let name = "";
    let formType = formTypeParam;
    let isDefault = false;
    let enabled = true;
    /** Multi-step only: storefront progress bar. Default on for new multi-step forms. */
    let showProgressBar = formTypeParam === "multi_step";
    let storefrontHeading = "";
    let storefrontDescription = "";
    let themeSettings: ThemeSettings = THEME_DEFAULTS;
    let customCss = "";
    let appearanceTemplateId: AppearanceTemplateId = getAppearanceTemplateId(undefined);
    let formUpdatedAt: string | null = null;
    const appSettingsSelect = {
        themeSettings: true,
        customCss: true,
        customerApprovalSettings: true,
        shopCountryCode: true,
    } as const;

    if (isNew) {
        const [resolvedShopCountryCode, existingForm, appRow] = await Promise.all([
            shopCountryCodePromise,
            prisma.formConfig.findFirst({ where: { shop }, select: { id: true } }),
            prisma.appSettings.findUnique({ where: { shop }, select: appSettingsSelect }),
        ]);
        shopCountryCode = resolvedShopCountryCode;
        config = { fields: [...DEFAULT_FIELDS] };
        formType = ["wholesale", "multi_step"].includes(formTypeParam) ? formTypeParam : "wholesale";
        showProgressBar = formType === "multi_step";
        isDefault = !existingForm;
        enabled = true;
        const a = shopAppearanceFromRow(appRow);
        themeSettings = a.themeSettings;
        customCss = a.customCss;
        appearanceTemplateId = a.appearanceTemplateId;
    } else if (formIdParam) {
        try {
            const [resolvedShopCountryCode, dbForm, appRow] = await Promise.all([
                shopCountryCodePromise,
                prisma.formConfig.findFirst({ where: { id: formIdParam, shop } }),
                prisma.appSettings.findUnique({ where: { shop }, select: appSettingsSelect }),
            ]);
            shopCountryCode = resolvedShopCountryCode;
            if (!dbForm) {
                return new Response(null, { status: 302, headers: { Location: "/app/form-config" } });
            }
            const r = dbForm as {
                name?: string;
                formType?: string;
                isDefault?: boolean;
                enabled?: boolean;
                showProgressBar?: boolean;
                storefrontHeading?: string | null;
                storefrontDescription?: string | null;
            };
            formId = dbForm.id;
            formUpdatedAt = dbForm.updatedAt.toISOString();
            name = r.name ?? name;
            formType = r.formType ?? "wholesale";
            isDefault = r.isDefault ?? false;
            enabled = r.enabled !== false;
            showProgressBar = r.formType === "multi_step" ? r.showProgressBar !== false : false;
            storefrontHeading = typeof r.storefrontHeading === "string" ? r.storefrontHeading : "";
            storefrontDescription = typeof r.storefrontDescription === "string" ? r.storefrontDescription : "";
            config = { fields: (dbForm.fields ?? []) as unknown as FormField[] };
            const a = shopAppearanceFromRow(appRow);
            themeSettings = a.themeSettings;
            customCss = a.customCss;
            appearanceTemplateId = a.appearanceTemplateId;
        } catch (e) {
            console.warn("Form load failed:", e);
            return new Response(null, { status: 302, headers: { Location: "/app/form-config" } });
        }
    } else {
        const [resolvedShopCountryCode, dbForm, appRow] = await Promise.all([
            shopCountryCodePromise,
            prisma.formConfig.findFirst({
                where: { shop },
                orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
            } as never),
            prisma.appSettings.findUnique({ where: { shop }, select: appSettingsSelect }),
        ]);
        shopCountryCode = resolvedShopCountryCode;
        if (dbForm) {
            const r = dbForm as {
                name?: string;
                formType?: string;
                isDefault?: boolean;
                enabled?: boolean;
                showProgressBar?: boolean;
                storefrontHeading?: string | null;
                storefrontDescription?: string | null;
            };
            formId = dbForm.id;
            formUpdatedAt = dbForm.updatedAt.toISOString();
            name = r.name ?? name;
            formType = r.formType ?? "wholesale";
            isDefault = r.isDefault ?? false;
            enabled = r.enabled !== false;
            showProgressBar = r.formType === "multi_step" ? r.showProgressBar !== false : false;
            storefrontHeading = typeof r.storefrontHeading === "string" ? r.storefrontHeading : "";
            storefrontDescription = typeof r.storefrontDescription === "string" ? r.storefrontDescription : "";
            config = { fields: (dbForm.fields ?? []) as unknown as FormField[] };
        } else {
            config = { fields: [...DEFAULT_FIELDS] };
            isDefault = true;
            enabled = true;
        }
        const a = shopAppearanceFromRow(appRow);
        themeSettings = a.themeSettings;
        customCss = a.customCss;
        appearanceTemplateId = a.appearanceTemplateId;
    }

    config.fields = config.fields.map((f) => {
        const normalized = normalizeFieldOptions(f as FormField);
        const normalizedType = normalizeFieldType(f.type);
        return {
            ...normalized,
            type: normalizedType,
            required: Boolean(f.required),
            enabled: coalesceFieldEnabled((f as FormField).enabled),
            width: f.width === "30" || f.width === "50" ? f.width : "100",
            phoneCountryCode: f.phoneCountryCode && COUNTRY_TO_DIAL[(f.phoneCountryCode as string).toUpperCase()] ? (f.phoneCountryCode as string).toUpperCase() : undefined,
        };
    });

    const defaultTypes = ["first_name", "last_name", "email"];
    const hasAllDefaults = defaultTypes.every((t) => config.fields.some((f) => f.type === t));
    if (!hasAllDefaults) {
        const customFields = config.fields.filter((f) => !defaultTypes.includes(f.type) && (f.type || "").toLowerCase() !== "heading");
        config.fields = [...DEFAULT_FIELDS, ...customFields];
    } else {
        config.fields = config.fields.map((f) =>
            defaultTypes.includes(f.type)
                ? {
                    ...f,
                    isDefault: true,
                    required: Boolean(f.required),
                }
                : f
        );
        if (!config.fields.some((f) => String(f.type).toLowerCase() === "password")) {
            const emailIdx = config.fields.findIndex((f) => String(f.type).toLowerCase() === "email");
            const pwdField: FormField = {
                label: "Password",
                type: "password",
                required: false,
                enabled: true,
                step: 1,
                isDefault: false,
                sortKey: newFieldSortKey(),
            };
            if (emailIdx >= 0) {
                config.fields = [...config.fields.slice(0, emailIdx + 1), pwdField, ...config.fields.slice(emailIdx + 1)];
            } else {
                config.fields = [...config.fields, pwdField];
            }
        }
    }

    return {
        config,
        shopCountryCode,
        themeSettings,
        customCss,
        appearanceTemplateId,
        formId,
        formUpdatedAt,
        name,
        formType,
        isDefault,
        enabled,
        showProgressBar,
        storefrontHeading,
        storefrontDescription,
        isNew,
    };
};

/** Validate and normalize a single field for persistence */
function validateField(raw: unknown): FormField | null {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim() : "Field";
    const type = typeof o.type === "string" ? String(o.type).trim() || "text" : "text";
    const normalizedType = normalizeFieldType(type);
    const required = LOCKED_REQUIRED_FIELD_TYPES.has(normalizedType) ? true : Boolean(o.required);
    const enabled = coalesceFieldEnabled(o.enabled);
    const step = typeof o.step === "number" && o.step >= 1 ? o.step : 1;
    const isDefault = ["first_name", "last_name", "email"].includes(normalizedType);
    const helpText = typeof o.helpText === "string" ? o.helpText : undefined;
    const placeholder = typeof o.placeholder === "string" ? o.placeholder : undefined;
    const width = o.width === "30" || o.width === "50" ? o.width : "100";
    const headingLevel = o.headingLevel === "h2" || o.headingLevel === "h4" ? o.headingLevel : "h3";
    let options: string[] | undefined;
    if (Array.isArray(o.options)) {
        options = o.options.map((x) => String(x).trim()).filter(Boolean);
    } else if (typeof o.options === "string") {
        options = parseOptionsFromText(o.options);
    }
    const phoneCountryCode = typeof o.phoneCountryCode === "string" ? o.phoneCountryCode : undefined;
    const ALLOWED_FILE_SIZE_MB = [2, 5, 10, 15, 20, 25] as const;
    let maxFileCount: number | undefined;
    let maxFileSizeMb: number | undefined;
    if (type === "file_upload") {
        const raw = o.maxFileCount;
        if (typeof raw === "number" && raw >= 1 && raw <= 20) maxFileCount = Math.floor(raw);
        else if (typeof raw === "string") {
            const n = parseInt(raw, 10);
            if (!Number.isNaN(n) && n >= 1 && n <= 20) maxFileCount = n;
        }
        if (maxFileCount === undefined) maxFileCount = 1;

        const rawSize = o.maxFileSizeMb;
        if (
            typeof rawSize === "number" &&
            ALLOWED_FILE_SIZE_MB.includes(rawSize as (typeof ALLOWED_FILE_SIZE_MB)[number])
        ) {
            maxFileSizeMb = rawSize as (typeof ALLOWED_FILE_SIZE_MB)[number];
        } else if (typeof rawSize === "string") {
            const n = parseInt(rawSize, 10);
            if (
                !Number.isNaN(n) &&
                ALLOWED_FILE_SIZE_MB.includes(n as (typeof ALLOWED_FILE_SIZE_MB)[number])
            ) {
                maxFileSizeMb = n as (typeof ALLOWED_FILE_SIZE_MB)[number];
            }
        }
        if (maxFileSizeMb === undefined) maxFileSizeMb = 5;
    }
    const validDateFormats = new Set(DATE_FORMAT_OPTIONS.map((o) => o.value));
    const dateFormat =
        type === "date"
            ? typeof o.dateFormat === "string" && validDateFormats.has(o.dateFormat.trim())
                ? o.dateFormat.trim()
                : "dd_slash_mm_yyyy"
            : undefined;
    let minRequired: number | undefined;
    if (type === "checkbox") {
        const raw = o.minRequired;
        if (typeof raw === "number" && raw >= 0 && raw <= 10) minRequired = Math.floor(raw);
        else if (typeof raw === "string") {
            const n = parseInt(raw, 10);
            if (!Number.isNaN(n) && n >= 0 && n <= 10) minRequired = n;
        }
    }
    const field: FormField = {
        label,
        type,
        required,
        enabled,
        step,
        isDefault: isDefault || undefined,
        helpText: helpText || undefined,
        placeholder: placeholder || undefined,
        width: width as "30" | "50" | "100",
        headingLevel: type === "heading" ? (headingLevel as "h2" | "h3" | "h4") : undefined,
        options: options?.length ? options : undefined,
        phoneCountryCode: phoneCountryCode || undefined,
        dateFormat: dateFormat ?? undefined,
        maxFileCount: maxFileCount ?? undefined,
        maxFileSizeMb: maxFileSizeMb ?? undefined,
        minRequired: minRequired ?? undefined,
    };
    return normalizeFieldOptions(field);
}

function trimStorefrontCopy(raw: FormDataEntryValue | null, maxLen: number): string | null {
    if (raw == null || typeof raw !== "string") return null;
    const t = raw.trim();
    if (!t) return null;
    return t.length > maxLen ? t.slice(0, maxLen) : t;
}

async function persistShopAppearance(
    shop: string,
    payload: { themeSettings: ThemeSettings; customCss: string; appearanceTemplateId: string },
) {
    const themeForStore = normalizeThemeSettings(payload.themeSettings);
    const cssTrim = payload.customCss.trim();
    const templateId = getAppearanceTemplateId(payload.appearanceTemplateId);
    const existing = await prisma.appSettings.findUnique({ where: { shop } });
    let merged: Record<string, unknown> = {};
    const rawCas = existing?.customerApprovalSettings;
    if (rawCas && typeof rawCas === "object" && !Array.isArray(rawCas)) {
        merged = { ...(rawCas as Record<string, unknown>) };
    } else if (typeof rawCas === "string") {
        try {
            const p = JSON.parse(rawCas) as unknown;
            if (p && typeof p === "object" && !Array.isArray(p)) merged = { ...(p as Record<string, unknown>) };
        } catch {
            merged = {};
        }
    }
    merged.appearanceTemplateId = templateId;
    await prisma.appSettings.upsert({
        where: { shop },
        update: {
            themeSettings: themeForStore as unknown as Prisma.InputJsonValue,
            customCss: cssTrim.length > 0 ? payload.customCss : null,
            customerApprovalSettings: merged as unknown as Prisma.InputJsonValue,
        },
        create: {
            shop,
            defaultLanguage: "en",
            languageOptions: [],
            themeSettings: themeForStore as unknown as Prisma.InputJsonValue,
            customCss: cssTrim.length > 0 ? payload.customCss : null,
            customerApprovalSettings: merged as unknown as Prisma.InputJsonValue,
        },
    });
}

export const action = async ({ request }: ActionFunctionArgs) => {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const configStr = formData.get("config") as string | null;
    const formIdParam = (formData.get("formId") as string)?.trim() || null;
    const name = (formData.get("name") as string)?.trim() ?? "";
    const formType = (formData.get("formType") as string)?.trim() || "wholesale";
    const isDefault = formData.get("isDefault") === "true" || formData.get("isDefault") === "1";
    const enabled = formData.get("enabled") !== "false" && formData.get("enabled") !== "0";
    const showProgressBarRaw = formData.get("showProgressBar");
    const storefrontHeading = trimStorefrontCopy(formData.get("storefrontHeading"), 200);
    const storefrontDescription = trimStorefrontCopy(formData.get("storefrontDescription"), 2000);

    if (!configStr || typeof configStr !== "string") {
        return { success: false, error: "Missing form configuration." };
    }
    let config: { fields?: unknown[] };
    try {
        config = JSON.parse(configStr);
    } catch {
        return { success: false, error: "Invalid form configuration." };
    }
    if (!Array.isArray(config.fields)) {
        config.fields = [];
    }
    const validatedFields = config.fields.map(validateField).filter((f): f is FormField => f != null);
    const fieldsJson = JSON.parse(JSON.stringify(validatedFields));

    const safeFormType = ["wholesale", "multi_step"].includes(formType) ? formType : "wholesale";
    const showProgressBar =
        safeFormType === "multi_step" && showProgressBarRaw !== "false" && showProgressBarRaw !== "0";

    let appearancePayload: { themeSettings: ThemeSettings; customCss: string; appearanceTemplateId: string } | null = null;
    const shopAppearanceRaw = formData.get("shopAppearance") as string | null;
    if (shopAppearanceRaw && typeof shopAppearanceRaw === "string") {
        try {
            const p = JSON.parse(shopAppearanceRaw) as Record<string, unknown>;
            appearancePayload = {
                themeSettings: normalizeThemeSettings(p.themeSettings ?? THEME_DEFAULTS),
                customCss: typeof p.customCss === "string" ? p.customCss : "",
                appearanceTemplateId: getAppearanceTemplateId(p.appearanceTemplateId),
            };
        } catch {
            appearancePayload = null;
        }
    }

    try {
        if (isDefault) {
            await prisma.formConfig.updateMany({ where: { shop }, data: { isDefault: false } } as never);
        }

        // Form fields just changed — drop the per-shop label/layout cache so admin pages
        // (customer detail, customers list, CSV export) see the new schema immediately.
        invalidateFormFieldsCache(shop);

        if (formIdParam) {
            const existing = await prisma.formConfig.findFirst({ where: { id: formIdParam, shop } });
            if (!existing) {
                return { success: false, error: "Form not found." };
            }
            await prisma.formConfig.update({
                where: { id: formIdParam },
                data: {
                    fields: fieldsJson,
                    name,
                    formType: safeFormType,
                    isDefault,
                    enabled,
                    showProgressBar,
                    storefrontHeading,
                    storefrontDescription,
                },
            } as never);

            try {
                const defaultForm = await prisma.formConfig.findFirst({
                    where: { shop },
                    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
                } as never);

                if (defaultForm && admin) {
                    const appInstallationResponse = await admin.graphql(`#graphql query { currentAppInstallation { id } }`);
                    const appData = await appInstallationResponse.json();
                    const appInstallationId = appData.data?.currentAppInstallation?.id;
                    if (appInstallationId) {
                        await admin.graphql(
                            `#graphql mutation saveAppConfig($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { metafields { id } userErrors { field message } } }`,
                            {
                                variables: {
                                    metafields: [
                                        {
                                            namespace: "custom",
                                            key: "registration_form",
                                            type: "json",
                                            value: JSON.stringify({ fields: validatedFields }),
                                            ownerId: appInstallationId,
                                        },
                                    ],
                                },
                            }
                        );
                    }
                }
            } catch (e) {
                console.warn("Metafields save failed after form update (non-fatal):", e);
            }
            if (appearancePayload) {
                try {
                    await persistShopAppearance(shop, appearancePayload);
                } catch (e) {
                    console.warn("Shop appearance save failed:", e);
                }
            }
            const fresh = await prisma.formConfig.findFirst({ where: { id: formIdParam, shop }, select: { updatedAt: true } });
            return { success: true, formId: formIdParam, formUpdatedAt: fresh?.updatedAt.toISOString() ?? null };
        } else {
            const created = await prisma.formConfig.create({
                data: {
                    shop,
                    name,
                    formType: safeFormType,
                    fields: fieldsJson,
                    isDefault,
                    enabled,
                    showProgressBar,
                    storefrontHeading,
                    storefrontDescription,
                },
            } as never);
            if (isDefault && admin) {
                try {
                    const appInstallationResponse = await admin.graphql(`#graphql query { currentAppInstallation { id } }`);
                    const appData = await appInstallationResponse.json();
                    const appInstallationId = appData.data?.currentAppInstallation?.id;
                    if (appInstallationId) {
                        await admin.graphql(
                            `#graphql mutation saveAppConfig($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { metafields { id } userErrors { field message } } }`,
                            {
                                variables: {
                                    metafields: [
                                        {
                                            namespace: "custom",
                                            key: "registration_form",
                                            type: "json",
                                            value: JSON.stringify({ fields: validatedFields }),
                                            ownerId: appInstallationId,
                                        },
                                    ],
                                },
                            }
                        );
                    }
                } catch (e) {
                    console.warn("Metafields save failed after form create (non-fatal):", e);
                }
            }
            if (appearancePayload) {
                try {
                    await persistShopAppearance(shop, appearancePayload);
                } catch (e) {
                    console.warn("Shop appearance save failed:", e);
                }
            }
            return { success: true, formId: created.id, formUpdatedAt: created.updatedAt.toISOString() };
        }
    } catch (dbError) {
        console.error("DB config save failed:", dbError);
        const msg = dbError instanceof Error ? dbError.message : String(dbError);
        if (msg.includes("showProgressBar") || msg.includes("does not exist")) {
            return {
                success: false,
                error:
                    "Database schema is out of date (missing columns). Run `npx prisma migrate deploy` on the server, or apply the latest SQL migrations.",
            };
        }
        if (msg.includes("P2002") || msg.includes("Unique constraint")) {
            return {
                success: false,
                error:
                    "Could not save: this shop’s form row conflicts with the database (often an old “one form per shop” constraint). Apply migrations or run the FormConfig fix SQL from the repo.",
            };
        }
        return { success: false, error: "Failed to save configuration." };
    }
};

// ─── Main Component ───

/** Programmatic Save Bar id (do not combine with data-save-bar on the same form). */
const FORM_BUILDER_SAVE_BAR_ID = "approvefy-form-builder-save-bar";

export default function FormBuilder() {
    const {
        config: initialConfig,
        shopCountryCode = "US",
        formId: loaderFormId,
        name: loaderName,
        formType: loaderFormType,
        isDefault: loaderIsDefault,
        enabled: loaderEnabled,
        showProgressBar: loaderShowProgressBar,
        storefrontHeading: loaderStorefrontHeading,
        storefrontDescription: loaderStorefrontDescription,
        isNew: loaderIsNew,
        themeSettings: loaderThemeSettings,
        customCss: loaderCustomCss,
        appearanceTemplateId: loaderAppearanceTemplateId,
        formUpdatedAt: loaderFormUpdatedAt,
    } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const submit = useSubmit();
    const navigation = useNavigation();
    const navigate = useNavigate();
    const revalidator = useRevalidator();
    /** One shared tagged list for initial `fields` and `savedState.fields` so sort keys match (Polaris has no sortable API; we use @dnd-kit + Polaris layout). */
    const initialFieldsForMountRef = useRef<FormField[] | null>(null);
    const bootstrapFieldListFromLoader = (): FormField[] => {
        if (initialFieldsForMountRef.current === null) {
            initialFieldsForMountRef.current = assignSortKeys(
                normalizeAndDeduplicateFieldTypes(initialConfig.fields || []),
            ).map((f) => ({ ...f }));
        }
        return initialFieldsForMountRef.current.map((f) => ({ ...f }));
    };
    const [fields, setFields] = useState<FormField[]>(() => bootstrapFieldListFromLoader());
    const [name, setName] = useState(loaderName ?? "");
    const [formType, setFormType] = useState(loaderFormType ?? "wholesale");
    const [isDefault, setIsDefault] = useState(loaderIsDefault ?? false);
    const [enabled, setEnabled] = useState(loaderEnabled !== false);
    const [showProgressBar, setShowProgressBar] = useState(
        (loaderFormType ?? "wholesale") === "multi_step" ? loaderShowProgressBar !== false : false
    );
    const [storefrontHeading, setStorefrontHeading] = useState(loaderStorefrontHeading ?? "");
    const [storefrontDescription, setStorefrontDescription] = useState(loaderStorefrontDescription ?? "");
    const [themeSettings, setThemeSettings] = useState<ThemeSettings>(loaderThemeSettings);
    const [customCss, setCustomCss] = useState(() => (typeof loaderCustomCss === "string" ? loaderCustomCss : ""));
    const [appearanceTemplateId, setAppearanceTemplateId] = useState(loaderAppearanceTemplateId);
    const previewTheme = useMemo(() => normalizeThemeSettings(themeSettings), [themeSettings]);
    const previewContainerStyle = useMemo(
        (): CSSProperties => ({
            fontFamily: previewTheme.fontFamily,
            fontSize: previewTheme.baseFontSize || "14px",
            borderRadius: "12px",
            background: previewTheme.cardBg,
            color: previewTheme.cardText,
            width: "100%",
            maxWidth: previewTheme.containerMaxWidth,
            boxSizing: "border-box",
        }),
        [previewTheme],
    );
    const previewFieldInputStyle = useMemo(
        (): CSSProperties => ({
            width: "100%",
            padding: "8px 10px",
            borderRadius: previewTheme.inputRadius,
            border: `1px solid ${previewTheme.inputBorder}`,
            background: previewTheme.inputBg,
            color: previewTheme.cardText,
            fontFamily: "inherit",
            fontSize: previewTheme.inputFontSize,
            boxSizing: "border-box",
        }),
        [previewTheme],
    );
    const previewPrimaryButtonStyle = useMemo(
        (): CSSProperties => ({
            padding: "9px 14px",
            width: "100%",
            maxWidth: "100%",
            border: "none",
            borderRadius: previewTheme.buttonRadius,
            background: previewTheme.primaryButtonBg,
            color: previewTheme.primaryButtonText,
            fontFamily: "inherit",
            fontSize: previewTheme.buttonFontSize,
            fontWeight: 600,
            cursor: "default",
            boxSizing: "border-box",
        }),
        [previewTheme],
    );
    const [savedState, setSavedState] = useState(() => ({
        fields: bootstrapFieldListFromLoader(),
        name: loaderName ?? "",
        formType: loaderFormType ?? "wholesale",
        isDefault: loaderIsDefault ?? false,
        enabled: loaderEnabled !== false,
        showProgressBar:
            (loaderFormType ?? "wholesale") === "multi_step" ? loaderShowProgressBar !== false : false,
        storefrontHeading: loaderStorefrontHeading ?? "",
        storefrontDescription: loaderStorefrontDescription ?? "",
        themeSettings: loaderThemeSettings,
        customCss: typeof loaderCustomCss === "string" ? loaderCustomCss : "",
        appearanceTemplateId: loaderAppearanceTemplateId,
        formUpdatedAt: loaderFormUpdatedAt ?? null,
    }));
    const [lastSavedAtDisplay, setLastSavedAtDisplay] = useState<string | null>(loaderFormUpdatedAt ?? null);
    const lastSyncedFormIdRef = useRef<string | null | undefined>(undefined);
    useEffect(() => {
        if (lastSyncedFormIdRef.current === undefined) {
            lastSyncedFormIdRef.current = loaderFormId ?? null;
            return;
        }
        const fid = loaderFormId ?? null;
        if (lastSyncedFormIdRef.current === fid) return;
        lastSyncedFormIdRef.current = fid;
        initialFieldsForMountRef.current = null;
        const tagged = assignSortKeys(normalizeAndDeduplicateFieldTypes(initialConfig.fields || [])).map((f) => ({ ...f }));
        initialFieldsForMountRef.current = tagged;
        setFields(tagged.map((f) => ({ ...f })));
        setSavedState((s) => ({
            ...s,
            fields: tagged.map((f) => ({ ...f })),
            formUpdatedAt: loaderFormUpdatedAt ?? null,
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-bootstrap field ids when switching forms; revalidate keeps the same formId
    }, [loaderFormId, loaderFormUpdatedAt]);
    const [showToast, setShowToast] = useState(false);
    const [showErrorToast, setShowErrorToast] = useState(false);
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
    const [addFieldPopoverActive, setAddFieldPopoverActive] = useState(false);
    const [leaveStayModal, setLeaveStayModal] = useState<"blocker" | null>(null);
    const [previewStep, setPreviewStep] = useState(1);
    const [saveClicked, setSaveClicked] = useState(false);
    const [builderLeftTab, setBuilderLeftTab] = useState(0);
    const formRef = useRef<HTMLFormElement>(null);
    const handleBack = useCallback(() => {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate("/app");
        }
    }, [navigate]);

    const enabledPreviewFields = useMemo(
        () =>
            fields.filter((f: FormField) => {
                if (normalizeFieldType(f.type) === "password") return true;
                return f.enabled !== false;
            }),
        [fields]
    );
    const previewStepCount = useMemo(() => {
        if (formType !== "multi_step") return 1;
        let max = 1;
        enabledPreviewFields.forEach((f: FormField) => {
            const s = typeof f.step === "number" && f.step >= 1 ? f.step : 1;
            if (s > max) max = s;
        });
        return max;
    }, [formType, enabledPreviewFields]);
    const previewFieldsByStep = useMemo(() => {
        const map: Record<number, FormField[]> = {};
        enabledPreviewFields.forEach((f: FormField) => {
            const s = formType === "multi_step" ? (typeof f.step === "number" && f.step >= 1 ? f.step : 1) : 1;
            if (!map[s]) map[s] = [];
            map[s].push(f);
        });
        return map;
    }, [formType, enabledPreviewFields]);
    const currentPreviewStep = Math.min(Math.max(1, previewStep), previewStepCount);
    const previewFieldsToShow = previewStepCount > 1 ? (previewFieldsByStep[currentPreviewStep] || []) : enabledPreviewFields;

    if (actionData?.success && !showToast) {
        setTimeout(() => setShowToast(true), 100);
    }
    useEffect(() => {
        if (actionData?.success && actionData.formId && loaderIsNew) {
            navigate(`/app/form-builder?formId=${actionData.formId}`, { replace: true });
        }
    }, [actionData?.success, actionData?.formId, loaderIsNew, navigate]);
    // After successful save, mark current values as the new saved baseline and revalidate loader
    useEffect(() => {
        if (actionData?.success) {
            const at = (actionData as { formUpdatedAt?: string | null }).formUpdatedAt ?? null;
            if (at) setLastSavedAtDisplay(at);
            setSavedState({
                fields,
                name,
                formType,
                isDefault,
                enabled,
                showProgressBar: formType === "multi_step" ? showProgressBar : false,
                storefrontHeading,
                storefrontDescription,
                themeSettings,
                customCss,
                appearanceTemplateId,
                formUpdatedAt: at,
            });
            revalidator.revalidate();
        }
    }, [
        actionData?.success,
        fields,
        name,
        formType,
        isDefault,
        enabled,
        showProgressBar,
        storefrontHeading,
        storefrontDescription,
        themeSettings,
        customCss,
        appearanceTemplateId,
        revalidator,
    ]);
    if (actionData?.success === false && actionData?.error && !showErrorToast) {
        setTimeout(() => setShowErrorToast(true), 100);
    }

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const sortableFieldIds = useMemo(() => fields.map((f) => f.sortKey as string), [fields]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = fields.findIndex((f) => f.sortKey === active.id);
        const newIndex = fields.findIndex((f) => f.sortKey === over.id);
        if (oldIndex < 0 || newIndex < 0) return;
        setFields(arrayMove(fields, oldIndex, newIndex));
        if (expandedIndex !== null) {
            if (expandedIndex === oldIndex) setExpandedIndex(newIndex);
            else if (oldIndex < expandedIndex && newIndex >= expandedIndex) setExpandedIndex(expandedIndex - 1);
            else if (oldIndex > expandedIndex && newIndex <= expandedIndex) setExpandedIndex(expandedIndex + 1);
        }
    };

    const addFieldWithType = (type: string) => {
        const normalizedType = normalizeFieldType(type);
        const requestedType = ADDRESS_BUNDLE_CHILD_TYPES.has(normalizedType) ? "address" : normalizedType;
        if (
            SINGLE_INSTANCE_FIELD_TYPES.has(requestedType) &&
            fields.some((f) => normalizeFieldType(f.type) === requestedType)
        ) {
            setAddFieldPopoverActive(false);
            return;
        }

        const newField = createFieldFromType(requestedType, 1);

        const nextIndex = fields.length;
        const newFields = [...fields, newField];
        if (requestedType === "address") {
            const existingTypes = new Set(newFields.map((f) => normalizeFieldType(f.type)));
            ADDRESS_BUNDLE_TYPES.forEach((bundleType) => {
                if (existingTypes.has(bundleType)) return;
                newFields.push(createFieldFromType(bundleType, 1));
                existingTypes.add(bundleType);
            });
        }
        setFields(newFields);
        setExpandedIndex(nextIndex);
        setAddFieldPopoverActive(false);
    };
    const addableCustomFieldTypeOptions = useMemo(
        () =>
            getSelectableCustomTypeOptions(CUSTOM_FIELD_TYPE_OPTIONS).filter((opt) => {
                const normalizedType = normalizeFieldType(opt.value);
                if (!SINGLE_INSTANCE_FIELD_TYPES.has(normalizedType)) return true;
                return !fields.some((f) => normalizeFieldType(f.type) === normalizedType);
            }),
        [fields]
    );
    const getAvailableCustomTypeOptionsForIndex = useCallback(
        (index: number) => {
            const currentType = normalizeFieldType(fields[index]?.type);
            return getSelectableCustomTypeOptions(CUSTOM_FIELD_TYPE_OPTIONS, currentType).filter((opt) => {
                const normalizedType = normalizeFieldType(opt.value);
                if (!SINGLE_INSTANCE_FIELD_TYPES.has(normalizedType)) return true;
                if (normalizedType === currentType) return true;
                return !fields.some((f, i) => i !== index && normalizeFieldType(f.type) === normalizedType);
            });
        },
        [fields]
    );

    const removeField = (index: number) => {
        if (fields[index]?.isDefault) return;
        const targetType = normalizeFieldType(fields[index]?.type);
        if (ADDRESS_BUNDLE_CHILD_TYPES.has(targetType)) return;

        let removedIndices: number[] = [index];
        let newFields = [...fields];

        if (targetType === "address") {
            removedIndices = fields
                .map((field, i) => ({ i, type: normalizeFieldType(field.type) }))
                .filter(({ type }) => ADDRESS_BUNDLE_TYPES.includes(type as (typeof ADDRESS_BUNDLE_TYPES)[number]))
                .map(({ i }) => i);
            newFields = fields.filter(
                (field) => !ADDRESS_BUNDLE_TYPES.includes(normalizeFieldType(field.type) as (typeof ADDRESS_BUNDLE_TYPES)[number]),
            );
        } else {
            newFields.splice(index, 1);
        }

        setFields(newFields);
        if (expandedIndex === null) return;
        if (removedIndices.includes(expandedIndex)) {
            setExpandedIndex(null);
            return;
        }
        const removedBeforeExpanded = removedIndices.filter((removedIndex) => removedIndex < expandedIndex).length;
        if (removedBeforeExpanded > 0) {
            setExpandedIndex(expandedIndex - removedBeforeExpanded);
        }
    };

    const updateField = (index: number, key: keyof FormField, value: string | boolean | number | string[]) => {
        const newFields = [...fields];
        const next = { ...newFields[index], [key]: value };
        const currentType = normalizeFieldType(newFields[index]?.type);

        if (key === "required" && currentType === "email") {
            next.required = true;
        }
        if (key === "required" && LOCKED_REQUIRED_FIELD_TYPES.has(currentType)) {
            next.required = true;
        }
        if (key === "enabled" && currentType === "address") {
            const nextEnabled = value !== false;
            newFields.forEach((field, i) => {
                if (i === index) return;
                if (ADDRESS_BUNDLE_CHILD_TYPES.has(normalizeFieldType(field.type))) {
                    newFields[i] = { ...field, enabled: nextEnabled };
                }
            });
        }
        if (key === "type") {
            const nextType = normalizeFieldType(value);
            if (
                SINGLE_INSTANCE_FIELD_TYPES.has(nextType) &&
                newFields.some((f, i) => i !== index && normalizeFieldType(f.type) === nextType)
            ) {
                return;
            }
            next.type = nextType;
        }
        if (key === "type" && ["dropdown", "checkbox", "radio"].includes(normalizeFieldType(value)) && (!next.options || next.options.length === 0)) {
            next.options = ["Option 1", "Option 2"];
        }
        if (key === "type" && normalizeFieldType(value) === "newsletter") {
            if (!next.label || next.label.trim() === "" || next.label === "New Field") {
                next.label = "Subscribe to newsletter";
            }
            // Default option text comes from backend translations where available.
            // We still set a sensible English fallback in the config.
            next.options = ["Yes, I want email updates"];
            next.minRequired = next.required ? 1 : 0;
        }
        if (key === "type" && normalizeFieldType(value) === "email") {
            next.required = true;
        }
        if (key === "type" && DEFAULT_REQUIRED_FIELD_TYPES.has(normalizeFieldType(value))) {
            next.required = true;
        }
        newFields[index] = next;
        if (key === "type" && normalizeFieldType(value) === "address") {
            const existingTypes = new Set(newFields.map((f) => normalizeFieldType(f.type)));
            const inheritedStep = typeof next.step === "number" && next.step > 0 ? next.step : 1;
            ADDRESS_BUNDLE_TYPES.forEach((type) => {
                if (existingTypes.has(type)) return;
                newFields.push(createFieldFromType(type, inheritedStep));
                existingTypes.add(type);
            });
        }
        setFields(newFields);
    };

    const toggleExpand = (index: number) => {
        setExpandedIndex(expandedIndex === index ? null : index);
    };

    const discardChanges = useCallback(() => {
        setFields(JSON.parse(JSON.stringify(savedState.fields || [])));
        setName(savedState.name ?? "");
        setFormType(savedState.formType ?? "wholesale");
        setIsDefault(savedState.isDefault ?? false);
        setEnabled(savedState.enabled !== false);
        setShowProgressBar(
            (savedState.formType ?? "wholesale") === "multi_step" ? savedState.showProgressBar !== false : false
        );
        setStorefrontHeading(savedState.storefrontHeading ?? "");
        setStorefrontDescription(savedState.storefrontDescription ?? "");
        setThemeSettings(savedState.themeSettings);
        setCustomCss(savedState.customCss ?? "");
        setAppearanceTemplateId(savedState.appearanceTemplateId);
        setLastSavedAtDisplay(savedState.formUpdatedAt ?? null);
        setExpandedIndex(null);
    }, [savedState]);

    const hasUnsavedChanges =
        JSON.stringify(fields) !== JSON.stringify(savedState.fields || []) ||
        name !== (savedState.name ?? "") ||
        formType !== (savedState.formType ?? "wholesale") ||
        isDefault !== (savedState.isDefault ?? false) ||
        enabled !== (savedState.enabled !== false) ||
        (formType === "multi_step" ? showProgressBar !== (savedState.showProgressBar !== false) : false) ||
        (storefrontHeading ?? "").trim() !== (savedState.storefrontHeading ?? "").trim() ||
        (storefrontDescription ?? "").trim() !== (savedState.storefrontDescription ?? "").trim() ||
        JSON.stringify(themeSettings) !== JSON.stringify(savedState.themeSettings) ||
        (customCss ?? "").trim() !== (savedState.customCss ?? "").trim() ||
        appearanceTemplateId !== savedState.appearanceTemplateId;

    // Don't show leave/stay popup when user clicked Save (blocker would block the submit).
    const isSaving = navigation.state === "submitting";
    const handleSaveBarSubmit = useCallback(
        (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (isSaving) return;
            flushSync(() => setSaveClicked(true));
            const fd = new FormData();
            fd.set("config", JSON.stringify({ fields }));
            if (loaderFormId) fd.set("formId", loaderFormId);
            fd.set("name", name);
            fd.set("formType", formType);
            fd.set("isDefault", isDefault ? "true" : "false");
            fd.set("enabled", enabled ? "true" : "false");
            fd.set("showProgressBar", formType === "multi_step" && showProgressBar ? "true" : "false");
            fd.set("storefrontHeading", storefrontHeading);
            fd.set("storefrontDescription", storefrontDescription);
            fd.set(
                "shopAppearance",
                JSON.stringify({
                    themeSettings,
                    customCss,
                    appearanceTemplateId,
                }),
            );
            submit(fd, { method: "post" });
        },
        [
            isSaving,
            fields,
            loaderFormId,
            name,
            formType,
            isDefault,
            enabled,
            showProgressBar,
            storefrontHeading,
            storefrontDescription,
            themeSettings,
            customCss,
            appearanceTemplateId,
            submit,
        ],
    );
    const handleSaveBarReset = useCallback(
        (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (isSaving) return;
            flushSync(() => {
                discardChanges();
            });
        },
        [isSaving, discardChanges],
    );
    const blocker = useBlocker(hasUnsavedChanges && !isSaving && !saveClicked);

    useEffect(() => {
        if (blocker.state === "blocked") setLeaveStayModal("blocker");
    }, [blocker.state]);

    useEffect(() => {
        if (navigation.state === "submitting" && saveClicked) {
            setSaveClicked(false);
        }
    }, [navigation.state, saveClicked]);

    useEffect(() => {
        if (!hasUnsavedChanges) return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [hasUnsavedChanges]);

    // Polaris-controlled fields do not reliably trigger the automatic data-save-bar; sync visibility explicitly.
    useEffect(() => {
        const shouldShow = hasUnsavedChanges && !isSaving;
        const saveBar = typeof window !== "undefined" ? window.shopify?.saveBar : undefined;
        if (!saveBar) return;
        let cancelled = false;
        const sync = () => {
            if (cancelled) return;
            const p = shouldShow ? saveBar.show(FORM_BUILDER_SAVE_BAR_ID) : saveBar.hide(FORM_BUILDER_SAVE_BAR_ID);
            void p.catch(() => {});
        };
        sync();
        const raf = requestAnimationFrame(sync);
        const t = window.setTimeout(sync, 400);
        return () => {
            cancelled = true;
            cancelAnimationFrame(raf);
            window.clearTimeout(t);
            void saveBar.hide(FORM_BUILDER_SAVE_BAR_ID).catch(() => {});
        };
    }, [hasUnsavedChanges, isSaving]);

    useEffect(() => {
        setLastSavedAtDisplay(loaderFormUpdatedAt ?? null);
    }, [loaderFormUpdatedAt]);

    const formLastSavedSubtitle =
        lastSavedAtDisplay != null
            ? `Last saved: ${new Date(lastSavedAtDisplay).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
            : undefined;

    const typeOptions = FIELD_TYPE_OPTIONS;

    const getInputType = (fieldType: string) => {
        const map: Record<string, string> = {
            first_name: "text", last_name: "text", text: "text",
            email: "email",
            password: "password",
            phone: "tel", number: "number", company: "text", date: "date",
            textarea: "text", file_upload: "file",
            address: "text", zip_code: "text", city: "text", state: "text", country: "text",
        };
        return map[fieldType] || "text";
    };

    const toastMarkup = showToast ? (
        <Toast content="Form configuration saved successfully!" onDismiss={() => setShowToast(false)} />
    ) : null;
    const errorBannerMarkup = showErrorToast && actionData?.success === false ? (
        <Banner tone="critical" onDismiss={() => setShowErrorToast(false)}>
            {actionData?.error ?? "Failed to save."}
        </Banner>
    ) : null;

    const handleLeaveStayLeave = useCallback(() => {
        if (leaveStayModal === "blocker") blocker.proceed?.();
        setLeaveStayModal(null);
    }, [leaveStayModal, blocker]);

    const handleLeaveStayStay = useCallback(() => {
        if (leaveStayModal === "blocker") blocker.reset?.();
        setLeaveStayModal(null);
    }, [leaveStayModal, blocker]);

    return (
        <>
            <ui-save-bar id={FORM_BUILDER_SAVE_BAR_ID}>
                <button
                    type="button"
                    {...({ variant: "primary" } as Record<string, unknown>)}
                    onClick={() => {
                        if (isSaving) return;
                        formRef.current?.requestSubmit();
                    }}
                >
                    Save
                </button>
                <button
                    type="button"
                    onClick={() => {
                        if (isSaving) return;
                        flushSync(() => {
                            discardChanges();
                        });
                    }}
                >
                    Discard
                </button>
            </ui-save-bar>
            <Modal
                open={leaveStayModal !== null}
                onClose={handleLeaveStayStay}
                title="Unsaved changes"
                primaryAction={{
                    content: "Leave",
                    destructive: true,
                    onAction: handleLeaveStayLeave,
                }}
                secondaryActions={[
                    {
                        content: "Stay",
                        onAction: handleLeaveStayStay,
                    },
                ]}
            >
                <Modal.Section>
                    <Text as="p">
                        You have unsaved changes. Do you want to leave or stay?
                    </Text>
                </Modal.Section>
            </Modal>
            <Page
                title={name || "Registration form"}
                subtitle={formLastSavedSubtitle}
                backAction={{ content: "Back", onAction: handleBack }}
            >
                <form ref={formRef} onSubmit={handleSaveBarSubmit} onReset={handleSaveBarReset}>
                {toastMarkup}
                {errorBannerMarkup}
                <Box paddingBlockEnd="400" className="fb-form-builder-page">
                    <BlockStack gap="400">
                        <Layout>
                            <Layout.Section variant="oneHalf">
                                <div className="fb-layout-left">
                                    <Tabs tabs={[...FORM_BUILDER_LEFT_TABS]} selected={builderLeftTab} onSelect={setBuilderLeftTab}>
                                        <Box paddingBlockStart="300">
                                            <BlockStack gap="400">
                                                {builderLeftTab === 0 && (
                                                    <>
                                                        <Card>
                                                            <BlockStack gap="400">
                                                                <Text as="h2" variant="headingMd">Form status</Text>
                                                                <InlineStack gap="200">
                                                                    <Button variant={enabled ? "primary" : "secondary"} onClick={() => setEnabled(true)}>
                                                                        Enable
                                                                    </Button>
                                                                    <Button variant={!enabled ? "primary" : "secondary"} tone={!enabled ? "critical" : undefined} onClick={() => setEnabled(false)}>
                                                                        Disable
                                                                    </Button>
                                                                </InlineStack>
                                                                <TextField
                                                                    label="Form name"
                                                                    value={name}
                                                                    onChange={setName}
                                                                    autoComplete="off"
                                                                    placeholder="e.g. Wholesale registration"
                                                                    helpText="Internal name in the app (form list). Not shown on the storefront."
                                                                    maxLength={200}
                                                                    showCharacterCount
                                                                />
                                                            </BlockStack>
                                                        </Card>
                                                        <Card>
                                                            <BlockStack gap="300">
                                                                <Text as="h2" variant="headingMd">Form details</Text>
                                                                <TextField
                                                                    label="Storefront heading"
                                                                    value={storefrontHeading}
                                                                    onChange={setStorefrontHeading}
                                                                    autoComplete="off"
                                                                    placeholder={STOREFRONT_FORM_DEFAULTS_EN.create_your_account}
                                                                    helpText="Large title above the form on your store. Leave blank to use Settings → Translations."
                                                                    maxLength={200}
                                                                    showCharacterCount
                                                                />
                                                                <TextField
                                                                    label="Storefront description"
                                                                    value={storefrontDescription}
                                                                    onChange={setStorefrontDescription}
                                                                    autoComplete="off"
                                                                    placeholder={STOREFRONT_FORM_DEFAULTS_EN.form_description}
                                                                    helpText="Subtitle under the heading. Leave blank to use the translation default."
                                                                    multiline={3}
                                                                    maxLength={2000}
                                                                    showCharacterCount
                                                                />
                                                                <div className="fb-form-details-row">
                                                                    <InlineStack gap="400" blockAlign="start" wrap>
                                                                        <div className="fb-form-type-select" style={{ minWidth: 0 }}>
                                                                            <Select
                                                                                label="Form type"
                                                                                options={FORM_TYPE_OPTIONS}
                                                                                value={formType}
                                                                                onChange={(v) => {
                                                                                    setFormType(v);
                                                                                    if (v === "multi_step") {
                                                                                        setShowProgressBar(true);
                                                                                    } else {
                                                                                        setShowProgressBar(false);
                                                                                    }
                                                                                }}
                                                                            />
                                                                        </div>
                                                                        <Box paddingBlockStart="400">
                                                                            <Checkbox
                                                                                label="Use as default form (shown on storefront when no form is selected)"
                                                                                checked={isDefault}
                                                                                onChange={setIsDefault}
                                                                            />
                                                                        </Box>
                                                                    </InlineStack>
                                                                </div>
                                                                {formType === "multi_step" && (
                                                                    <Checkbox
                                                                        label="Show progress bar on storefront"
                                                                        checked={showProgressBar}
                                                                        onChange={setShowProgressBar}
                                                                        helpText="Shows a bar and completion percentage between steps (multi-step forms only)."
                                                                    />
                                                                )}
                                                            </BlockStack>
                                                        </Card>
                                                        <Card padding="0">
                                                            <Box paddingBlockStart="400" paddingInline="400" paddingBlockEnd="300">
                                                                <InlineStack align="space-between" blockAlign="center" wrap={false}>
                                                                    <Text as="h2" variant="headingMd">
                                                                        Form elements
                                                                    </Text>
                                                                    <Text as="span" variant="bodySm" tone="subdued">
                                                                        Fields
                                                                    </Text>
                                                                </InlineStack>
                                                            </Box>
                                                            <Divider />
                                                            {/* Reorder: Polaris has no built-in sortable list; @dnd-kit + PointerSensor on the handle is the usual Shopify admin pattern. */}
                                                            <DndContext
                                                                sensors={sensors}
                                                                collisionDetection={closestCenter}
                                                                onDragEnd={handleDragEnd}
                                                            >
                                                                <SortableContext items={sortableFieldIds} strategy={verticalListSortingStrategy}>
                                                                    {fields.map((field: FormField, index: number) => (
                                                                        <SortableFieldRow
                                                                            key={field.sortKey}
                                                                            field={field}
                                                                            index={index}
                                                                            fieldId={field.sortKey as string}
                                                                            expandedIndex={expandedIndex}
                                                                            onToggleExpand={toggleExpand}
                                                                            onUpdate={updateField}
                                                                            onRemove={removeField}
                                                                            typeOptions={field.isDefault ? typeOptions : getAvailableCustomTypeOptionsForIndex(index)}
                                                                            shopCountryCode={shopCountryCode}
                                                                            showStepField={formType === "multi_step"}
                                                                        />
                                                                    ))}
                                                                </SortableContext>
                                                            </DndContext>
                                                            <Divider />
                                                            <Box padding="400">
                                                                <Popover
                                                                    active={addFieldPopoverActive}
                                                                    preferredPosition="above"
                                                                    preferredAlignment="left"
                                                                    fullWidth
                                                                    onClose={() => setAddFieldPopoverActive(false)}
                                                                    activator={
                                                                        <Button
                                                                            variant="primary"
                                                                            fullWidth
                                                                            icon={PlusCircleIcon}
                                                                            disclosure="down"
                                                                            pressed={addFieldPopoverActive}
                                                                            onClick={() => setAddFieldPopoverActive((open) => !open)}
                                                                            accessibilityLabel="Add field — choose field type"
                                                                        >
                                                                            Add field
                                                                        </Button>
                                                                    }
                                                                >
                                                                    <Popover.Pane maxHeight="min(320px, 50vh)">
                                                                        <OptionList
                                                                            options={addableCustomFieldTypeOptions.map((o) => ({
                                                                                value: o.value,
                                                                                label: o.label,
                                                                            }))}
                                                                            selected={[]}
                                                                            onChange={(selected) => {
                                                                                const v = selected[0];
                                                                                if (v) addFieldWithType(v);
                                                                            }}
                                                                        />
                                                                    </Popover.Pane>
                                                                </Popover>
                                                            </Box>
                                                        </Card>
                                                    </>
                                                )}
                                                {builderLeftTab === 1 && (
                                                    <FormAppearancePanel
                                                        themeSettings={themeSettings}
                                                        setThemeSettings={setThemeSettings}
                                                        customCss={customCss}
                                                        setCustomCss={setCustomCss}
                                                        appearanceTemplateId={appearanceTemplateId}
                                                        setAppearanceTemplateId={setAppearanceTemplateId}
                                                        disabled={isSaving}
                                                        saveActionLabel="Save"
                                                    />
                                                )}
                                            </BlockStack>
                                        </Box>
                                    </Tabs>
                                </div>
                            </Layout.Section>

                            <Layout.Section variant="oneHalf">
                    <div className="fb-layout-right">
                        <div className="fb-preview-sticky app-backend-card">
                        <Card padding="0">
                            <BlockStack gap="0">
                            <Box padding="400" paddingBlockEnd="200">
                                <Text as="h2" variant="headingMd">Live Preview (Storefront Look)</Text>
                            </Box>
                            <div className="fb-preview">
                                <div className="form-preview-wrapper">
                                    <div className="custom-registration-container fb-preview-storefront" style={previewContainerStyle}>
                                        <div id="fb-preview-form">
                                            <h2
                                                style={{
                                                    margin: "0 0 12px 0",
                                                    fontSize: previewTheme.formTitleFontSize,
                                                    fontWeight: 700,
                                                    color: previewTheme.headingColor,
                                                    letterSpacing: "-0.02em",
                                                    textAlign: previewTheme.formTitleTextAlign,
                                                }}
                                            >
                                                {(storefrontHeading || "").trim() || STOREFRONT_FORM_DEFAULTS_EN.create_your_account}
                                            </h2>
                                            <p
                                                className="form-description"
                                                style={{
                                                    margin: "0 0 24px 0",
                                                    fontSize: previewTheme.formDescriptionFontSize,
                                                    lineHeight: 1.7,
                                                    color: previewTheme.formDescriptionColor,
                                                    textAlign: previewTheme.formDescriptionTextAlign,
                                                }}
                                            >
                                                {(storefrontDescription || "").trim() || STOREFRONT_FORM_DEFAULTS_EN.form_description}
                                            </p>
                                            {formType === "multi_step" && previewStepCount > 1 && (
                                                <>
                                                    {showProgressBar && (
                                                        <div style={{ margin: "0 0 12px 0" }}>
                                                            <div
                                                                style={{
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    gap: "12px",
                                                                }}
                                                            >
                                                                <div
                                                                    style={{
                                                                        flex: 1,
                                                                        minWidth: 0,
                                                                        height: "10px",
                                                                        borderRadius: "999px",
                                                                        background: previewTheme.inputBorder,
                                                                        opacity: 0.45,
                                                                        overflow: "hidden",
                                                                    }}
                                                                >
                                                                    <div
                                                                        style={{
                                                                            width: `${Math.min(100, Math.round((currentPreviewStep / previewStepCount) * 100))}%`,
                                                                            height: "100%",
                                                                            borderRadius: "999px",
                                                                            background: previewTheme.accentColor,
                                                                        }}
                                                                    />
                                                                </div>
                                                                <span
                                                                    style={{
                                                                        flexShrink: 0,
                                                                        fontSize: "13px",
                                                                        fontWeight: 600,
                                                                        color: previewTheme.cardText,
                                                                        opacity: 0.85,
                                                                    }}
                                                                >
                                                                    {Math.min(100, Math.round((currentPreviewStep / previewStepCount) * 100))}% complete
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <p style={{ margin: "0 0 12px 0", fontSize: previewTheme.formDescriptionFontSize, color: previewTheme.cardText, opacity: 0.75 }}>
                                                        Step {currentPreviewStep} of {previewStepCount}
                                                    </p>
                                                </>
                                            )}
                                            <div className="form-fields-grid">
                                                {previewFieldsToShow.length === 0 && (
                                                    <p style={{ textAlign: "center", color: previewTheme.cardText, opacity: 0.7, gridColumn: "1 / -1", margin: 0 }}>No fields added yet.</p>
                                                )}
                                                {previewFieldsToShow.map((field: FormField, i: number) => {
                                                        const type = (field.type || "").toLowerCase();
                                                        const widthClass = "field-w-" + (field.width ?? "100");
                                                        if (type === "heading") {
                                                            return (
                                                                <div key={i} className={`custom-form-field custom-form-heading ${widthClass}`}>
                                                                    <div
                                                                        className={field.headingLevel === "h2" ? "custom-heading-h2" : field.headingLevel === "h4" ? "custom-heading-h4" : "custom-heading-h3"}
                                                                        style={{ color: previewTheme.headingColor }}
                                                                    >
                                                                        {field.label || "Heading"}
                                                                    </div>
                                                                    {field.helpText && (
                                                                        <p
                                                                            className="custom-help-text"
                                                                            style={{ color: previewTheme.formDescriptionColor }}
                                                                        >
                                                                            {field.helpText}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            );
                                                        }
                                                        return (
                                                            <div key={i} className={`custom-form-field ${widthClass}`}>
                                                                <label
                                                                    style={{
                                                                        fontSize: previewTheme.labelFontSize,
                                                                        color: previewTheme.cardText,
                                                                    }}
                                                                >
                                                                    {field.label}
                                                                    {field.required && (
                                                                        <span className="required" style={{ color: previewTheme.errorColor }}>
                                                                            *
                                                                        </span>
                                                                    )}
                                                                </label>
                                                                {field.helpText && (
                                                                    <p
                                                                        className="custom-help-text"
                                                                        style={{ color: previewTheme.formDescriptionColor }}
                                                                    >
                                                                        {field.helpText}
                                                                    </p>
                                                                )}
                                                                {type === "phone" ? (
                                                                    <div className="custom-phone-wrapper">
                                                                        <select
                                                                            disabled
                                                                            className="phone-country-select"
                                                                            value={COUNTRY_TO_DIAL[field.phoneCountryCode || shopCountryCode] ?? "+1"}
                                                                        >
                                                                            {Object.entries(COUNTRY_TO_DIAL).map(([cc, dial]) => (
                                                                                <option key={cc} value={dial}>{dial} {cc}</option>
                                                                            ))}
                                                                        </select>
                                                                        <input
                                                                            type="tel"
                                                                            placeholder={field.placeholder || "Phone number"}
                                                                            disabled
                                                                            style={previewFieldInputStyle}
                                                                        />
                                                                    </div>
                                                                ) : type === "file_upload" ? (
                                                                    <div className="custom-file-upload-zone">
                                                                        <IconFileUpload />
                                                                        <span className="custom-file-upload-text">Click or drag to upload</span>
                                                                        <span className="custom-file-upload-hint">
                                                                            JPG, PNG, PDF — Max {field.maxFileSizeMb ?? 5} MB
                                                                            {(field.maxFileCount ?? 1) > 1 && ` · Max ${field.maxFileCount} files`}
                                                                        </span>
                                                                    </div>
                                                                ) : type === "dropdown" ? (
                                                                    <div className="custom-select-dropdown">
                                                                        <div className="custom-select-trigger">
                                                                            <span className="custom-select-trigger-text placeholder">{field.placeholder || "Select..."}</span>
                                                                            <svg viewBox="0 0 12 12"><path fill="currentColor" d="M6 8L1 3h10z"/></svg>
                                                                        </div>
                                                                        <div className="custom-select-list">
                                                                            {(field.options || ["Option 1", "Option 2"]).map((opt, j) => (
                                                                                <div key={j} className="custom-select-item">{opt}</div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                ) : type === "country" ? (
                                                                    <select disabled className="custom-country-select" style={previewFieldInputStyle}>
                                                                        <option value="">Select country</option>
                                                                        <option value="US">United States</option>
                                                                        <option value="FR">France</option>
                                                                        <option value="IN">India</option>
                                                                        <option value="GB">United Kingdom</option>
                                                                        <option value="DE">Germany</option>
                                                                    </select>
                                                                ) : type === "radio" ? (
                                                                    <div className="custom-options-group">
                                                                        {(field.options || ["Option 1", "Option 2"]).map((opt, j) => (
                                                                            <label key={j} className="custom-radio-item">
                                                                                <input type="radio" name={`preview-r-${i}`} disabled />
                                                                                <span className="custom-option-label-text">{opt}</span>
                                                                            </label>
                                                                        ))}
                                                                    </div>
                                                                ) : type === "checkbox" ? (
                                                                    <div className="custom-options-group">
                                                                        {(field.options || ["Option 1", "Option 2"]).map((opt, j) => (
                                                                            <label key={j} className="custom-checkbox-item">
                                                                                <input type="checkbox" disabled />
                                                                                <span className="custom-option-label-text">{opt}</span>
                                                                            </label>
                                                                        ))}
                                                                    </div>
                                                                ) : type === "newsletter" ? (
                                                                    <div className="custom-options-group">
                                                                        <label className="custom-checkbox-item">
                                                                            <input type="checkbox" disabled />
                                                                            <span className="custom-option-label-text">
                                                                                {(field.options && field.options[0]) || "Yes, I want email updates"}
                                                                            </span>
                                                                        </label>
                                                                    </div>
                                                                ) : type === "textarea" ? (
                                                                    <textarea
                                                                        disabled
                                                                        rows={4}
                                                                        placeholder={field.placeholder || `Enter ${field.label}`}
                                                                        style={previewFieldInputStyle}
                                                                    />
                                                                ) : type === "password" ? (
                                                                    <input
                                                                        type="password"
                                                                        autoComplete="new-password"
                                                                        placeholder={field.placeholder || `Enter ${field.label}`}
                                                                        disabled
                                                                        style={previewFieldInputStyle}
                                                                    />
                                                                ) : type === "date" && field.dateFormat ? (
                                                                    <input
                                                                        type="text"
                                                                        placeholder={
                                                                            field.placeholder ||
                                                                            DATE_FORMAT_PLACEHOLDERS[field.dateFormat] ||
                                                                            "YYYY-MM-DD"
                                                                        }
                                                                        disabled
                                                                        style={previewFieldInputStyle}
                                                                    />
                                                                ) : (
                                                                    <input
                                                                        type={getInputType(field.type)}
                                                                        placeholder={
                                                                            field.placeholder ||
                                                                            (type === "address"
                                                                                ? "Enter Address"
                                                                                : `Enter ${field.label}`)
                                                                        }
                                                                        disabled
                                                                        style={previewFieldInputStyle}
                                                                    />
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                            {formType === "multi_step" && previewStepCount > 1 ? (
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "20px", flexWrap: "wrap", gap: "12px" }}>
                                                    <button
                                                        type="button"
                                                        className="custom-submit-btn"
                                                        style={{ ...previewPrimaryButtonStyle, maxWidth: "140px", width: "auto" }}
                                                        disabled={currentPreviewStep <= 1}
                                                        onClick={() => setPreviewStep((s) => Math.max(1, s - 1))}
                                                    >
                                                        Previous step
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="custom-submit-btn"
                                                        style={{ ...previewPrimaryButtonStyle, maxWidth: "140px", width: "auto" }}
                                                        onClick={() => {
                                                            if (currentPreviewStep >= previewStepCount) return;
                                                            setPreviewStep((s) => s + 1);
                                                        }}
                                                    >
                                                        {currentPreviewStep >= previewStepCount ? "Submit" : "Next step"}
                                                    </button>
                                                </div>
                                            ) : (
                                                <button type="button" className="custom-submit-btn" style={previewPrimaryButtonStyle}>
                                                    {STOREFRONT_FORM_DEFAULTS_EN.create_account_btn}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            </BlockStack>
                        </Card>
                        </div>
                    </div>
                            </Layout.Section>
                        </Layout>
                    </BlockStack>
                </Box>
                </form>
            </Page>
        </>
    );
}
