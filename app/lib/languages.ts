export interface LanguageOption {
    code: string;
    name: string;
}

export const CORE_LANGUAGES: LanguageOption[] = [
    { code: "en", name: "English" },
    { code: "fr", name: "French" },
    { code: "de", name: "German" },
    { code: "es", name: "Spanish" },
    { code: "it", name: "Italian" },
    { code: "nl", name: "Dutch" },
    { code: "pl", name: "Polish" },
    { code: "pt", name: "Portuguese" },
];

export const CORE_LANGUAGE_CODES = CORE_LANGUAGES.map((l) => l.code) as ReadonlyArray<string>;

export function normalizeLangCode(code: unknown): string {
    return String(code ?? "").trim().toLowerCase();
}

export function isCoreLanguageCode(code: string): boolean {
    return CORE_LANGUAGE_CODES.includes(code);
}

export function coreLanguageName(code: string): string | null {
    const c = normalizeLangCode(code);
    const found = CORE_LANGUAGES.find((l) => l.code === c);
    return found?.name ?? null;
}

