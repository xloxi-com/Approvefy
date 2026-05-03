import { THEME_DEFAULTS, type ThemeSettings } from "./theme-settings";

export type AppearanceTemplateId =
    | "clean"
    | "aurora"
    | "midnight"
    | "sand"
    | "ocean"
    | "blush"
    | "graphite"
    | "emerald"
    | "violet"
    | "neo";

export type AppearanceTemplate = {
    id: AppearanceTemplateId;
    label: string;
    /** A full ThemeSettings preset to apply in Admin. */
    theme: ThemeSettings;
    /** Extra CSS appended after buildThemeCss(). Keep selectors scoped to #custom-registration-container. */
    extraCss: string;
};

function t(theme: Partial<ThemeSettings>): ThemeSettings {
    return { ...THEME_DEFAULTS, ...theme };
}

/** Shared polish: smooth button + modern container radius (buildThemeCss uses 16px; we refine per template). */
const BTN_TRANSITION = `
#custom-registration-container .custom-submit-btn {
  transition: transform 0.18s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}
#custom-registration-container .custom-submit-btn:hover {
  transform: translateY(-1px);
}
`;

export const APPEARANCE_TEMPLATES: AppearanceTemplate[] = [
    {
        id: "clean",
        label: "Minimal Light",
        theme: t({
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            cardBg: "#fcfcfd",
            cardText: "#18181b",
            headingColor: "#09090b",
            formDescriptionColor: "#71717a",
            primaryButtonBg: "#18181b",
            primaryButtonText: "#fafafa",
            inputBg: "#ffffff",
            inputBorder: "#e4e4e7",
            accentColor: "#6366f1",
            errorColor: "#ef4444",
            formTitleFontSize: "30px",
            formDescriptionFontSize: "16px",
            inputRadius: "12px",
            buttonRadius: "12px",
            containerMaxWidth: "680px",
        }),
        extraCss: `
#custom-registration-container {
  border-radius: 20px;
  border: 1px solid rgba(24, 24, 27, 0.08);
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 20px 50px -18px rgba(15, 23, 42, 0.1);
}
#custom-registration-container .custom-submit-btn {
  box-shadow: 0 2px 8px rgba(24, 24, 27, 0.12);
}
${BTN_TRANSITION}
`,
    },
    {
        id: "aurora",
        label: "Aurora Night",
        theme: t({
            fontFamily: '"Poppins", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            cardBg: "#0a0a0f",
            cardText: "#e4e4e7",
            headingColor: "#fafafa",
            formDescriptionColor: "#a1a1aa",
            primaryButtonBg: "#14b8a6",
            primaryButtonText: "#042f2e",
            inputBg: "#12121a",
            inputBorder: "#27272a",
            accentColor: "#2dd4bf",
            errorColor: "#fb7185",
            formTitleFontSize: "32px",
            formDescriptionFontSize: "16px",
            inputRadius: "14px",
            buttonRadius: "999px",
            containerMaxWidth: "720px",
        }),
        extraCss: `
#custom-registration-container {
  position: relative;
  border-radius: 22px;
  border: 1px solid rgba(45, 212, 191, 0.15);
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.04) inset,
    0 32px 64px -16px rgba(0, 0, 0, 0.55);
  background-image:
    radial-gradient(1000px 420px at 0% -10%, rgba(45, 212, 191, 0.12), transparent 55%),
    radial-gradient(800px 360px at 100% 0%, rgba(99, 102, 241, 0.14), transparent 50%),
    radial-gradient(700px 400px at 50% 120%, rgba(236, 72, 153, 0.08), transparent 55%);
}
#custom-registration-container .custom-submit-btn {
  background-image: linear-gradient(135deg, #14b8a6, #06b6d4);
  color: #042f2e !important;
  box-shadow: 0 4px 20px rgba(20, 184, 166, 0.35);
}
${BTN_TRANSITION}
`,
    },
    {
        id: "midnight",
        label: "Midnight Indigo",
        theme: t({
            fontFamily: '"Montserrat", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            cardBg: "#0c0a1a",
            cardText: "#e2e8f0",
            headingColor: "#f8fafc",
            formDescriptionColor: "#94a3b8",
            primaryButtonBg: "#4f46e5",
            primaryButtonText: "#ffffff",
            inputBg: "#131022",
            inputBorder: "#312e81",
            accentColor: "#818cf8",
            errorColor: "#fda4af",
            formTitleFontSize: "31px",
            formDescriptionFontSize: "16px",
            inputRadius: "14px",
            buttonRadius: "14px",
            containerMaxWidth: "700px",
        }),
        extraCss: `
#custom-registration-container {
  border-radius: 20px;
  border: 1px solid rgba(129, 140, 248, 0.22);
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.03) inset,
    0 28px 56px -12px rgba(15, 23, 42, 0.75);
  background-image:
    radial-gradient(ellipse 900px 400px at 50% -20%, rgba(79, 70, 229, 0.25), transparent 65%);
}
#custom-registration-container .custom-submit-btn {
  background-image: linear-gradient(180deg, #6366f1, #4f46e5);
  box-shadow: 0 6px 24px rgba(79, 70, 229, 0.4);
}
${BTN_TRANSITION}
`,
    },
    {
        id: "sand",
        label: "Warm Stone",
        theme: t({
            fontFamily: '"Open Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            cardBg: "#fafaf9",
            cardText: "#292524",
            headingColor: "#1c1917",
            formDescriptionColor: "#78716c",
            primaryButtonBg: "#44403c",
            primaryButtonText: "#fafaf9",
            inputBg: "#ffffff",
            inputBorder: "#e7e5e4",
            accentColor: "#d97706",
            errorColor: "#dc2626",
            formTitleFontSize: "29px",
            formDescriptionFontSize: "16px",
            inputRadius: "12px",
            buttonRadius: "12px",
            containerMaxWidth: "680px",
        }),
        extraCss: `
#custom-registration-container {
  border-radius: 18px;
  border: 1px solid rgba(68, 64, 60, 0.1);
  box-shadow:
    0 1px 3px rgba(28, 25, 23, 0.04),
    0 24px 48px -20px rgba(120, 113, 108, 0.15);
  background-image:
    radial-gradient(900px 280px at 100% 0%, rgba(217, 119, 6, 0.06), transparent 60%);
}
#custom-registration-container .custom-submit-btn {
  box-shadow: 0 2px 12px rgba(68, 64, 60, 0.2);
}
${BTN_TRANSITION}
`,
    },
    {
        id: "ocean",
        label: "Coastal Blue",
        theme: t({
            fontFamily: '"Roboto", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            cardBg: "#f8fafc",
            cardText: "#0f172a",
            headingColor: "#0c4a6e",
            formDescriptionColor: "#475569",
            primaryButtonBg: "#0369a1",
            primaryButtonText: "#ffffff",
            inputBg: "#ffffff",
            inputBorder: "#cbd5e1",
            accentColor: "#0ea5e9",
            errorColor: "#e11d48",
            formTitleFontSize: "30px",
            formDescriptionFontSize: "16px",
            inputRadius: "12px",
            buttonRadius: "12px",
            containerMaxWidth: "700px",
        }),
        extraCss: `
#custom-registration-container {
  border-radius: 20px;
  border: 1px solid rgba(14, 165, 233, 0.12);
  box-shadow:
    0 1px 2px rgba(14, 165, 233, 0.06),
    0 24px 56px -16px rgba(3, 105, 161, 0.12);
  background-image:
    radial-gradient(1000px 320px at 100% -10%, rgba(14, 165, 233, 0.1), transparent 55%),
    radial-gradient(800px 280px at 0% 110%, rgba(3, 105, 161, 0.06), transparent 55%);
}
#custom-registration-container .custom-submit-btn {
  background-image: linear-gradient(135deg, #0284c7, #0ea5e9);
  box-shadow: 0 4px 18px rgba(14, 165, 233, 0.28);
}
${BTN_TRANSITION}
`,
    },
    {
        id: "blush",
        label: "Rose Clay",
        theme: t({
            fontFamily: '"Lato", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            cardBg: "#fff5f5",
            cardText: "#1f2937",
            headingColor: "#9f1239",
            formDescriptionColor: "#9d174d",
            primaryButtonBg: "#be123c",
            primaryButtonText: "#ffffff",
            inputBg: "#ffffff",
            inputBorder: "#fecdd3",
            accentColor: "#fb7185",
            errorColor: "#b91c1c",
            formTitleFontSize: "30px",
            formDescriptionFontSize: "16px",
            inputRadius: "14px",
            buttonRadius: "14px",
            containerMaxWidth: "680px",
        }),
        extraCss: `
#custom-registration-container {
  border-radius: 20px;
  border: 1px solid rgba(190, 18, 60, 0.1);
  box-shadow:
    0 1px 2px rgba(190, 18, 60, 0.04),
    0 26px 52px -18px rgba(190, 18, 60, 0.14);
  background-image:
    radial-gradient(900px 300px at 0% 0%, rgba(251, 113, 133, 0.12), transparent 58%),
    radial-gradient(700px 260px at 100% 100%, rgba(190, 18, 60, 0.06), transparent 55%);
}
#custom-registration-container .custom-submit-btn {
  background-image: linear-gradient(135deg, #be123c, #e11d48);
  box-shadow: 0 4px 20px rgba(190, 18, 60, 0.25);
}
${BTN_TRANSITION}
`,
    },
    {
        id: "graphite",
        label: "Zinc Pro",
        theme: t({
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            cardBg: "#ffffff",
            cardText: "#18181b",
            headingColor: "#09090b",
            formDescriptionColor: "#71717a",
            primaryButtonBg: "#27272a",
            primaryButtonText: "#fafafa",
            inputBg: "#fafafa",
            inputBorder: "#d4d4d8",
            accentColor: "#3b82f6",
            errorColor: "#dc2626",
            formTitleFontSize: "28px",
            formDescriptionFontSize: "15px",
            inputRadius: "10px",
            buttonRadius: "10px",
            containerMaxWidth: "640px",
        }),
        extraCss: `
#custom-registration-container {
  border-radius: 16px;
  border: 1px solid rgba(24, 24, 27, 0.08);
  box-shadow:
    0 1px 3px rgba(24, 24, 27, 0.05),
    0 20px 40px -20px rgba(24, 24, 27, 0.12);
}
#custom-registration-container .custom-submit-btn {
  box-shadow: 0 2px 10px rgba(39, 39, 42, 0.15);
}
${BTN_TRANSITION}
`,
    },
    {
        id: "emerald",
        label: "Mint Forest",
        theme: t({
            fontFamily: '"Poppins", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            cardBg: "#f0fdf4",
            cardText: "#14532d",
            headingColor: "#14532d",
            formDescriptionColor: "#166534",
            primaryButtonBg: "#15803d",
            primaryButtonText: "#ffffff",
            inputBg: "#ffffff",
            inputBorder: "#bbf7d0",
            accentColor: "#22c55e",
            errorColor: "#e11d48",
            formTitleFontSize: "30px",
            formDescriptionFontSize: "16px",
            inputRadius: "14px",
            buttonRadius: "999px",
            containerMaxWidth: "700px",
        }),
        extraCss: `
#custom-registration-container {
  border-radius: 20px;
  border: 1px solid rgba(34, 197, 94, 0.15);
  box-shadow:
    0 1px 2px rgba(21, 83, 45, 0.04),
    0 24px 48px -16px rgba(22, 163, 74, 0.14);
  background-image:
    radial-gradient(900px 300px at 90% -10%, rgba(34, 197, 94, 0.12), transparent 55%);
}
#custom-registration-container .custom-submit-btn {
  background-image: linear-gradient(135deg, #15803d, #22c55e);
  box-shadow: 0 4px 18px rgba(21, 128, 61, 0.28);
}
${BTN_TRANSITION}
`,
    },
    {
        id: "violet",
        label: "Lilac SaaS",
        theme: t({
            fontFamily: '"Montserrat", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            cardBg: "#faf5ff",
            cardText: "#1e1b4b",
            headingColor: "#4c1d95",
            formDescriptionColor: "#6d28d9",
            primaryButtonBg: "#7c3aed",
            primaryButtonText: "#ffffff",
            inputBg: "#ffffff",
            inputBorder: "#ddd6fe",
            accentColor: "#8b5cf6",
            errorColor: "#dc2626",
            formTitleFontSize: "30px",
            formDescriptionFontSize: "16px",
            inputRadius: "14px",
            buttonRadius: "14px",
            containerMaxWidth: "700px",
        }),
        extraCss: `
#custom-registration-container {
  border-radius: 20px;
  border: 1px solid rgba(124, 58, 237, 0.12);
  box-shadow:
    0 1px 2px rgba(76, 29, 149, 0.04),
    0 26px 56px -18px rgba(109, 40, 217, 0.12);
  background-image:
    radial-gradient(900px 300px at 0% 0%, rgba(167, 139, 250, 0.15), transparent 55%),
    radial-gradient(700px 260px at 100% 100%, rgba(124, 58, 237, 0.08), transparent 55%);
}
#custom-registration-container .custom-submit-btn {
  background-image: linear-gradient(135deg, #6d28d9, #8b5cf6);
  box-shadow: 0 4px 22px rgba(124, 58, 237, 0.3);
}
${BTN_TRANSITION}
`,
    },
    {
        id: "neo",
        label: "Glass Neo",
        theme: t({
            fontFamily: '"Roboto", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            cardBg: "#0f1117",
            cardText: "#e2e8f0",
            headingColor: "#f8fafc",
            formDescriptionColor: "#94a3b8",
            primaryButtonBg: "#f1f5f9",
            primaryButtonText: "#0f172a",
            inputBg: "#1a1d26",
            inputBorder: "#334155",
            accentColor: "#38bdf8",
            errorColor: "#fb7185",
            formTitleFontSize: "32px",
            formDescriptionFontSize: "16px",
            inputRadius: "14px",
            buttonRadius: "14px",
            containerMaxWidth: "720px",
        }),
        extraCss: `
#custom-registration-container {
  border-radius: 22px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.05) inset,
    0 32px 64px -12px rgba(0, 0, 0, 0.5);
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  background-image:
    radial-gradient(1000px 380px at 20% -15%, rgba(56, 189, 248, 0.12), transparent 55%),
    radial-gradient(800px 320px at 100% 0%, rgba(129, 140, 248, 0.1), transparent 50%),
    radial-gradient(700px 360px at 50% 110%, rgba(244, 114, 182, 0.06), transparent 55%);
}
#custom-registration-container .custom-form-field input:not([type="radio"]):not([type="checkbox"]),
#custom-registration-container .custom-form-field select,
#custom-registration-container .custom-form-field textarea {
  background: rgba(255,255,255,0.05) !important;
  border-color: rgba(148, 163, 184, 0.28) !important;
}
#custom-registration-container .custom-submit-btn {
  background-image: linear-gradient(135deg, #e2e8f0, #f8fafc);
  color: #0f172a !important;
  box-shadow: 0 4px 24px rgba(248, 250, 252, 0.15);
}
${BTN_TRANSITION}
`,
    },
];

export function getAppearanceTemplateId(raw: unknown): AppearanceTemplateId {
    const v = typeof raw === "string" ? (raw.trim() as AppearanceTemplateId) : "clean";
    return (APPEARANCE_TEMPLATES.some((t0) => t0.id === v) ? v : "clean") as AppearanceTemplateId;
}

export function getAppearanceTemplate(id: unknown): AppearanceTemplate {
    const safeId = getAppearanceTemplateId(id);
    return APPEARANCE_TEMPLATES.find((x) => x.id === safeId) ?? APPEARANCE_TEMPLATES[0]!;
}

export function appendAppearanceTemplateCss(baseCss: string, templateId: unknown): string {
    const tpl = getAppearanceTemplate(templateId);
    const extra = (tpl.extraCss ?? "").trim();
    if (!extra) return baseCss;
    return `${baseCss}\n\n/* Appearance template: ${tpl.id} */\n${extra}\n`;
}
