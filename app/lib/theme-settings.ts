export type ThemeSettings = {
  fontFamily: string;
  cardBg: string;
  cardText: string;
  headingColor: string;
  baseFontSize: string;
  formTitleFontSize: string;
  formDescriptionFontSize: string;
  labelFontSize: string;
  inputFontSize: string;
  buttonFontSize: string;
  primaryButtonBg: string;
  primaryButtonText: string;
  inputBg: string;
  inputBorder: string;
  inputRadius: string;
  buttonRadius: string;
  containerMaxWidth: string;
  /** Focus, checkbox/radio checked, links */
  accentColor: string;
  /** Required asterisk and validation error messages */
  errorColor: string;
};

const SYSTEM_FONT_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Light preset – default theme. */
export const THEME_DEFAULTS: ThemeSettings = {
  fontFamily: SYSTEM_FONT_STACK,
  cardBg: "#ffffff",
  cardText: "#111827",
  headingColor: "#111827",
  baseFontSize: "14px",
  formTitleFontSize: "28px",
  formDescriptionFontSize: "15px",
  labelFontSize: "15px",
  inputFontSize: "15px",
  buttonFontSize: "15px",
  primaryButtonBg: "#111827",
  primaryButtonText: "#ffffff",
  inputBg: "#ffffff",
  inputBorder: "#d1d5db",
  inputRadius: "8px",
  buttonRadius: "10px",
  containerMaxWidth: "700px",
  accentColor: "#667eea",
  errorColor: "#dc2626",
};

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Return "r, g, b" for box-shadow alpha or null if invalid. */
function hexToRgb(hex: string): string | null {
  if (!hex || !HEX_RE.test(hex)) return null;
  const h = hex.slice(1);
  const r =
    h.length === 3
      ? parseInt(h[0] + h[0], 16)
      : parseInt(h.slice(0, 2), 16);
  const g =
    h.length === 3
      ? parseInt(h[1] + h[1], 16)
      : parseInt(h.slice(2, 4), 16);
  const b =
    h.length === 3
      ? parseInt(h[2] + h[2], 16)
      : parseInt(h.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function asRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function normalizeHex(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const v = raw.trim();
  return HEX_RE.test(v) ? v : fallback;
}

function normalizePx(
  raw: unknown,
  fallbackPx: string,
  opts?: { min?: number; max?: number }
): string {
  const fallback = Number.parseInt(fallbackPx, 10);
  const min = opts?.min ?? Number.NEGATIVE_INFINITY;
  const max = opts?.max ?? Number.POSITIVE_INFINITY;

  const num =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : NaN;

  const safe = Number.isFinite(num) ? Math.round(num) : fallback;
  const clamped = Math.min(max, Math.max(min, safe));
  return `${clamped}px`;
}

function normalizeFontFamily(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const v = raw.trim();
  return v.length > 0 ? v : fallback;
}

/** Google Fonts that need to be loaded when selected (system fonts like Arial are not included). */
const GOOGLE_FONT_NAMES = ["Open Sans", "Roboto", "Lato", "Montserrat", "Poppins"];

/** If theme fontFamily uses a Google Font, return its name for loading; otherwise null. */
export function getGoogleFontName(fontFamily: string): string | null {
  if (!fontFamily || typeof fontFamily !== "string") return null;
  const normalized = fontFamily.replace(/\s+/g, " ").trim();
  for (const name of GOOGLE_FONT_NAMES) {
    if (normalized.includes('"' + name + '"') || normalized.includes("'" + name + "'")) return name;
  }
  return null;
}

export function normalizeThemeSettings(raw: unknown): ThemeSettings {
  const o = asRecord(raw);
  return {
    fontFamily: normalizeFontFamily(o.fontFamily, THEME_DEFAULTS.fontFamily),
    cardBg: normalizeHex(o.cardBg, THEME_DEFAULTS.cardBg),
    cardText: normalizeHex(o.cardText, THEME_DEFAULTS.cardText),
    headingColor: normalizeHex(o.headingColor, THEME_DEFAULTS.headingColor),
    baseFontSize: normalizePx(o.baseFontSize, THEME_DEFAULTS.baseFontSize, {
      min: 10,
      max: 32,
    }),
    formTitleFontSize: normalizePx(
      o.formTitleFontSize,
      THEME_DEFAULTS.formTitleFontSize,
      { min: 14, max: 48 }
    ),
    formDescriptionFontSize: normalizePx(
      o.formDescriptionFontSize,
      THEME_DEFAULTS.formDescriptionFontSize,
      { min: 12, max: 24 }
    ),
    labelFontSize: normalizePx(
      o.labelFontSize,
      THEME_DEFAULTS.labelFontSize,
      { min: 11, max: 20 }
    ),
    inputFontSize: normalizePx(
      o.inputFontSize,
      THEME_DEFAULTS.inputFontSize,
      { min: 10, max: 24 }
    ),
    buttonFontSize: normalizePx(
      o.buttonFontSize,
      THEME_DEFAULTS.buttonFontSize,
      { min: 10, max: 24 }
    ),
    primaryButtonBg: normalizeHex(
      o.primaryButtonBg,
      THEME_DEFAULTS.primaryButtonBg
    ),
    primaryButtonText: normalizeHex(
      o.primaryButtonText,
      THEME_DEFAULTS.primaryButtonText
    ),
    inputBg: normalizeHex(o.inputBg, THEME_DEFAULTS.inputBg),
    inputBorder: normalizeHex(o.inputBorder, THEME_DEFAULTS.inputBorder),
    inputRadius: normalizePx(o.inputRadius, THEME_DEFAULTS.inputRadius, {
      min: 0,
      max: 24,
    }),
    buttonRadius: normalizePx(o.buttonRadius, THEME_DEFAULTS.buttonRadius, {
      min: 0,
      max: 999,
    }),
    containerMaxWidth: normalizePx(
      o.containerMaxWidth,
      THEME_DEFAULTS.containerMaxWidth,
      { min: 320, max: 1500 }
    ),
    accentColor: normalizeHex(o.accentColor, THEME_DEFAULTS.accentColor),
    errorColor: normalizeHex(o.errorColor, THEME_DEFAULTS.errorColor),
  };
}

export function buildThemeCss(theme: ThemeSettings): string {
  const {
    fontFamily,
    cardBg,
    cardText,
    headingColor,
    baseFontSize,
    formTitleFontSize,
    formDescriptionFontSize,
    labelFontSize,
    inputFontSize,
    buttonFontSize,
    primaryButtonBg,
    primaryButtonText,
    inputBg,
    inputBorder,
    inputRadius,
    buttonRadius,
    containerMaxWidth,
    accentColor,
    errorColor,
  } = theme;
  const accentRgb = hexToRgb(accentColor) ?? "102, 126, 234";
  const errorRgb = hexToRgb(errorColor) ?? "220, 38, 38";

  return `/* Apply selected font to all text in the form so it overrides base CSS */
#custom-registration-container,
#custom-registration-container * {
  font-family: ${fontFamily} !important;
}

#custom-registration-container,
#custom-registration-container input,
#custom-registration-container select,
#custom-registration-container textarea,
#custom-registration-container button {
  font-size: ${baseFontSize} !important;
}

#custom-registration-container {
  background: ${cardBg};
  color: ${cardText};
  max-width: ${containerMaxWidth};
}

#custom-registration-container h2 {
  color: ${headingColor};
  font-size: ${formTitleFontSize} !important;
}

#custom-registration-container .form-description {
  font-size: ${formDescriptionFontSize} !important;
}

#custom-registration-container .custom-form-field > label {
  font-size: ${labelFontSize} !important;
}

#custom-registration-form .custom-form-field input:not([type="radio"]):not([type="checkbox"]),
#custom-registration-form .custom-form-field textarea,
#custom-registration-form .custom-form-field select {
  font-size: ${inputFontSize} !important;
  background: ${inputBg};
  border-color: ${inputBorder};
  border-radius: ${inputRadius};
  color: ${cardText};
}

#custom-registration-container .custom-submit-btn {
  background: ${primaryButtonBg};
  color: ${primaryButtonText};
  border-radius: ${buttonRadius};
  font-size: ${buttonFontSize} !important;
}

#custom-registration-form .custom-country-select-trigger,
#custom-registration-form .custom-select-trigger {
  border-radius: ${inputRadius};
  font-size: ${inputFontSize} !important;
}

/* Date field: one rectangle - wrapper uses same radius as other inputs */
#custom-registration-form .custom-date-input-wrap {
  border-radius: ${inputRadius};
  border-color: ${inputBorder};
}

/* Phone field: one rectangle - wrapper has border/radius, dropdown + input inside (no inner radius/border) */
#custom-registration-form .custom-phone-wrapper {
  border-radius: ${inputRadius};
  border-color: ${inputBorder};
  background: ${inputBg};
}
#custom-registration-form .custom-phone-wrapper input[type="tel"] {
  border: none !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}
#custom-registration-form .custom-phone-country-trigger {
  border: none !important;
  border-right: 1px solid ${inputBorder} !important;
  border-radius: 0 !important;
  background: transparent !important;
}

/* Accent color: focus, checkbox, radio */
#custom-registration-form .custom-form-field input:not([type="radio"]):not([type="checkbox"]):focus,
#custom-registration-form .custom-form-field select:focus {
  border-color: ${accentColor};
  box-shadow: 0 0 0 3px rgba(${accentRgb}, 0.25);
}
#custom-registration-form .custom-date-input-wrap:focus-within {
  border-color: ${accentColor};
  box-shadow: 0 0 0 3px rgba(${accentRgb}, 0.25);
}
#custom-registration-form .custom-phone-country-search:focus {
  border-bottom-color: ${accentColor};
}
#custom-registration-container .custom-radio-item input[type="radio"]:hover,
#custom-registration-container .custom-checkbox-item input[type="checkbox"]:hover {
  border-color: ${accentColor};
}
#custom-registration-container .custom-radio-item input[type="radio"]:focus,
#custom-registration-container .custom-checkbox-item input[type="checkbox"]:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(${accentRgb}, 0.25);
}
#custom-registration-container .custom-radio-item input[type="radio"]:checked {
  border-color: ${accentColor};
  background-image: radial-gradient(circle at center, ${accentColor} 35%, transparent 36%);
}
#custom-registration-container .custom-radio-item input[type="radio"]:checked:hover {
  border-color: ${accentColor};
  background-image: radial-gradient(circle at center, ${accentColor} 35%, transparent 36%);
}
#custom-registration-container .custom-checkbox-item input[type="checkbox"]:checked {
  border-color: ${accentColor};
  background: ${accentColor};
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 10l4 4 8-8'/%3E%3C/svg%3E");
}
#custom-registration-container .custom-checkbox-item input[type="checkbox"]:checked:hover {
  border-color: ${accentColor};
  background-color: ${accentColor};
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 10l4 4 8-8'/%3E%3C/svg%3E");
}

/* Error color: required asterisk and validation messages */
#custom-registration-container .custom-form-field .required {
  color: ${errorColor};
}
#custom-registration-container .custom-field-error,
#custom-registration-container .custom-checkbox-error,
#custom-registration-container .custom-phone-error,
#custom-registration-container .custom-file-upload-error {
  color: ${errorColor};
}
#custom-registration-container .custom-message.error {
  background: rgba(${errorRgb}, 0.12);
  color: ${errorColor};
  border: 1px solid rgba(${errorRgb}, 0.4);
}
`;
}

