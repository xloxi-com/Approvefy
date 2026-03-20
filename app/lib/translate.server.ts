/**
 * Auto-translation with multiple providers for unlimited/high usage.
 * 1. api-translator (Google Translate) – free, unlimited: https://github.com/egyjs/API-Translator
 * 2. LibreTranslate (self-hosted = unlimited): set LIBRETRANSLATE_URL in .env
 * 3. MyMemory (with email = 50k chars/day): set MYMEMORY_EMAIL in .env
 */

const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
const MYMEMORY_WARNING_PREFIX = "MYMEMORY WARNING";

type NormalizedLang = {
    /** Primary language subtag, lowercased (e.g. "pt" from "pt-BR") */
    primary: string;
    /** BCP47-ish normalized tag, language lower + region upper (e.g. "pt-BR") */
    bcp47: string;
};

function normalizeLangTag(tag: string): NormalizedLang {
    const raw = String(tag || "").trim().replace(/_/g, "-");
    if (!raw) return { primary: "en", bcp47: "en" };

    const parts = raw.split("-").filter(Boolean);
    const lang = (parts[0] || "en").toLowerCase();
    const region = parts.length > 1 && /^[a-z]{2}$/i.test(parts[1]) ? parts[1].toUpperCase() : null;
    const bcp47 = region ? `${lang}-${region}` : lang;
    return { primary: lang, bcp47 };
}

/** Thrown when all translation providers hit their limit or fail */
export class MyMemoryLimitError extends Error {
    /** Seconds until translation is available again (from MyMemory "NEXT AVAILABLE IN" message) */
    nextAvailableSeconds?: number;

    constructor(message = "Translation limit reached. Try again later or edit translations manually.", nextAvailableSeconds?: number) {
        super(message);
        this.name = "MyMemoryLimitError";
        this.nextAvailableSeconds = nextAvailableSeconds;
    }
}

/** Parse "NEXT AVAILABLE IN X HOURS Y MINUTES Z SECONDS" from MyMemory warning; returns total seconds or null */
function parseMyMemoryNextAvailableSeconds(warningText: string): number | null {
    const upper = warningText.toUpperCase();
    const match = upper.match(/NEXT\s+AVAILABLE\s+IN\s+(\d+)\s*HOURS?\s+(\d+)\s*MINUTES?\s+(\d+)\s*SECONDS?/i);
    if (!match) return null;
    const hours = parseInt(match[1], 10) || 0;
    const minutes = parseInt(match[2], 10) || 0;
    const seconds = parseInt(match[3], 10) || 0;
    return hours * 3600 + minutes * 60 + seconds;
}

function isMyMemoryWarning(text: string): boolean {
    return typeof text === "string" && text.toUpperCase().includes(MYMEMORY_WARNING_PREFIX);
}

function getLibreTranslateUrl(): string | null {
    const url = process.env.LIBRETRANSLATE_URL?.trim();
    if (!url) return null;
    return url.replace(/\/$/, "");
}

function getMyMemoryEmail(): string | null {
    const email = process.env.MYMEMORY_EMAIL?.trim();
    if (!email) return null;
    return email;
}

/**
 * Translate entire object via api-translator (Google Translate – free, unlimited).
 * Uses: https://github.com/egyjs/API-Translator
 * Requires: npm i api-translator (uses Puppeteer; may be slow on first run).
 */
async function translateWithApiTranslator(
    texts: Record<string, string>,
    sourceLang: string,
    targetLang: string
): Promise<Record<string, string> | null> {
    try {
        const mod = await import("api-translator");
        const translate = mod.translate ?? mod.default?.translate ?? mod.default;
        if (typeof translate !== "function") return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await translate(texts, { from: sourceLang, to: targetLang } as any);
        if (result && typeof result === "object" && !Array.isArray(result)) {
            const out: Record<string, string> = {};
            for (const key of Object.keys(texts)) {
                const val = (result as Record<string, unknown>)[key];
                const str = typeof val === "string" ? val : "";
                out[key] = str && !isMyMemoryWarning(str) ? str : (texts[key] ?? "");
            }
            return out;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Translate via LibreTranslate (self-hosted = unlimited).
 */
async function translateWithLibreTranslate(
    text: string,
    sourceLang: string,
    targetLang: string
): Promise<string | null> {
    const baseUrl = getLibreTranslateUrl();
    if (!baseUrl) return null;
    try {
        const apiKey = process.env.LIBRETRANSLATE_API_KEY?.trim();
        const body: Record<string, string> = {
            q: text,
            source: sourceLang,
            target: targetLang,
        };
        if (apiKey) body.api_key = apiKey;
        const res = await fetch(`${baseUrl}/translate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { translatedText?: string };
        const translated = data?.translatedText;
        return typeof translated === "string" ? translated : null;
    } catch {
        return null;
    }
}

/**
 * Translate via MyMemory.
 * Returns { translated, nextAvailableSeconds } so caller can show countdown when limit hit.
 */
async function translateWithMyMemory(
    text: string,
    sourceLang: string,
    targetLang: string
): Promise<{ translated: string | null; nextAvailableSeconds?: number }> {
    try {
        const params = new URLSearchParams({
            q: text,
            langpair: `${sourceLang}|${targetLang}`,
        });
        const email = getMyMemoryEmail();
        if (email) params.set("de", email);
        const res = await fetch(`${MYMEMORY_URL}?${params.toString()}`, {
            headers: { Accept: "application/json" },
        });
        const data = await res.json();
        const translated = data?.responseData?.translatedText;
        if (translated && typeof translated === "string") {
            if (isMyMemoryWarning(translated)) {
                const nextAvailableSeconds = parseMyMemoryNextAvailableSeconds(translated);
                return { translated: null, nextAvailableSeconds: nextAvailableSeconds ?? undefined };
            }
            return { translated };
        }
        return { translated: null };
    } catch {
        return { translated: null };
    }
}

/**
 * Translate single text (used when batch api-translator is not available).
 */
export async function translateText(
    text: string,
    targetLang: string,
    sourceLang = "en"
): Promise<string> {
    if (!text || !text.trim()) return text;
    const target = normalizeLangTag(targetLang);
    const source = normalizeLangTag(sourceLang);
    if (target.primary === source.primary) return text;

    const libre = await translateWithLibreTranslate(text, source.primary, target.primary);
    if (libre != null && libre.trim() && !isMyMemoryWarning(libre)) return libre;

    const mymem = await translateWithMyMemory(text, source.primary, target.primary);
    if (mymem.translated != null && mymem.translated.trim() && !isMyMemoryWarning(mymem.translated)) return mymem.translated;
    if (mymem.nextAvailableSeconds != null) throw new MyMemoryLimitError(undefined, mymem.nextAvailableSeconds);
    return text;
}

const BATCH_CONCURRENCY = 12;
const BATCH_DELAY_MS = 0;

/**
 * Translate batch: first try api-translator (unlimited Google Translate), then fall back to per-item translation (parallel chunks).
 */
export async function translateBatch(
    texts: Record<string, string>,
    targetLang: string,
    sourceLang = "en"
): Promise<Record<string, string>> {
    const target = normalizeLangTag(targetLang);
    const source = normalizeLangTag(sourceLang);

    // Try Google Translate automation first (supports some region tags).
    let batch = await translateWithApiTranslator(texts, source.bcp47, target.bcp47);
    // If region tags fail, retry with primary language.
    if (batch == null && target.bcp47 !== target.primary) {
        batch = await translateWithApiTranslator(texts, source.primary, target.primary);
    }
    if (batch != null && Object.keys(batch).length > 0) {
        const unchanged = Object.keys(texts).every((k) => String(batch?.[k] ?? "").trim() === String(texts[k] ?? "").trim());
        if (unchanged) {
            throw new Error("Auto-translation returned no changes. Language code may be unsupported or provider is unavailable.");
        }
        return batch;
    }

    const entries = Object.entries(texts);
    const result: Record<string, string> = {};
    let limitError: MyMemoryLimitError | null = null;

    for (let i = 0; i < entries.length; i += BATCH_CONCURRENCY) {
        const chunk = entries.slice(i, i + BATCH_CONCURRENCY);
        const outcomes = await Promise.all(
            chunk.map(async ([key, value]) => {
                try {
                    const translated = await translateText(value, target.primary, source.primary);
                    return { key, value: translated, error: null as MyMemoryLimitError | null };
                } catch (err) {
                    if (err instanceof MyMemoryLimitError) return { key, value, error: err };
                    return { key, value, error: null };
                }
            })
        );
        for (const { key, value, error } of outcomes) {
            if (error) limitError = error;
            result[key] = value;
        }
        if (limitError) throw limitError;
        if (i + BATCH_CONCURRENCY < entries.length) {
            await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
    }
    const unchanged = entries.every(([k, v]) => String(result[k] ?? "").trim() === String(v ?? "").trim());
    if (unchanged) {
        throw new Error("Auto-translation returned no changes. Language code may be unsupported or provider is unavailable.");
    }
    return result;
}
