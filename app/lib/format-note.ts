/**
 * Format customer note for display: shorten base64 file/image data
 * so the UI doesn't show huge raw strings.
 */
const MAX_PLAIN_LENGTH = 800;
const FILE_PLACEHOLDER = "[File attached]";

/** Returns true if the value looks like a file upload JSON (single object or array). */
export function isFileUploadValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.length > 0 && typeof parsed[0] === "object" && parsed[0] !== null && ("data" in parsed[0] || "url" in parsed[0]);
    }
    if (typeof parsed === "object" && parsed !== null) {
      return "data" in parsed || "url" in parsed;
    }
  } catch {
    // not JSON
  }
  return false;
}

function shortenFileUploadValue(value: unknown): string {
  if (typeof value !== "string") return String(value);
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      // If this is an array of primitive values (e.g. ["Option 1","Option 2"]),
      // format as a human-readable list instead of raw JSON.
      const allPrimitive = parsed.every(
        (item) =>
          item == null ||
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean"
      );
      if (allPrimitive) {
        return parsed.map((item) => String(item)).join(" | ");
      }

      // Otherwise, assume it's a file upload JSON (objects with name/data/url).
      const count = parsed.length;
      if (count === 0) return "[]";
      if (count === 1 && parsed[0] && typeof parsed[0] === "object" && "name" in (parsed[0] as object)) {
        return `[File: ${(parsed[0] as { name?: string }).name ?? "file"}]`;
      }
      return `[${count} files attached]`;
    }
    const obj = parsed as Record<string, unknown>;
    if (obj && typeof obj === "object" && "data" in obj) {
      const data = obj.data;
      const name = (obj.name as string) || "file";
      if (typeof data === "string" && /^data:([^;]+);base64,/.test(data)) {
        return `[File: ${name}]`;
      }
    }
  } catch {
    // not JSON or invalid
  }
  if (value.length > 200 && /^data:[^;]+;base64,/.test(value)) {
    return FILE_PLACEHOLDER;
  }
  return value;
}

/** Parsed file-upload JSON from customData (e.g. image with base64 data) */
export type FileUploadValue =
  | { kind: "image"; dataUrl: string; fileName: string; mimeType: string }
  | { kind: "pdf"; dataUrl: string; fileName: string; mimeType: string }
  | { kind: "file"; dataUrl: string; fileName: string; mimeType: string }
  | null;

function parseOneFileUpload(obj: unknown): FileUploadValue {
  if (!obj || typeof obj !== "object" || !("data" in obj)) return null;
  const parsed = obj as Record<string, unknown>;
  const data = parsed.data;
  const name = (parsed.name as string) || "file";
  const type = (parsed.type as string) || "";
  if (typeof data !== "string" || !/^data:([^;]+);base64,/.test(data)) return null;
  const isImage = /^image\//.test(type) || /^data:image\//.test(data);
  const isPdf = type === "application/pdf" || /^data:application\/pdf/.test(data);
  if (isImage) {
    return { kind: "image", dataUrl: data, fileName: name, mimeType: type || "image/png" };
  }
  if (isPdf) {
    return { kind: "pdf", dataUrl: data, fileName: name, mimeType: type || "application/pdf" };
  }
  return { kind: "file", dataUrl: data, fileName: name, mimeType: type };
}

/**
 * If the value is a file-upload JSON (e.g. from Doc Upload) with image data,
 * returns info for showing a preview. Otherwise returns null.
 */
export function parseFileUploadValue(value: unknown): FileUploadValue {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return null;
    return parseOneFileUpload(parsed);
  } catch {
    // not JSON or invalid
  }
  return null;
}

/**
 * Parses customData value that may be a single file-upload object or an array of file-upload objects.
 * Returns a single FileUploadValue, an array of FileUploadValue, or null.
 */
export function parseFileUploadValueOrArray(value: unknown): FileUploadValue | FileUploadValue[] | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      const arr = (parsed as unknown[])
        .map((item) => parseOneFileUpload(item))
        .filter((v): v is NonNullable<FileUploadValue> => v != null);
      return arr.length > 0 ? arr : null;
    }
    return parseOneFileUpload(parsed);
  } catch {
    // not JSON or invalid
  }
  return null;
}

export function formatNoteForDisplay(note: string | null | undefined): string {
  if (note == null || note === "") return "";

  try {
    const parsed = JSON.parse(note) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const cleaned: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed)) {
        cleaned[key] = typeof value === "string" ? shortenFileUploadValue(value) : value;
      }
      return JSON.stringify(cleaned, null, 2);
    }
  } catch {
    // not JSON
  }

  if (note.length > MAX_PLAIN_LENGTH) {
    return note.slice(0, MAX_PLAIN_LENGTH) + "\n… (truncated)";
  }
  return note;
}

/** Known key -> readable label for Shopify customer note */
const NOTE_LABELS: Record<string, string> = {
  company: "Company",
  address: "Address",
  city: "City",
  state: "State",
  zipCode: "ZIP Code",
};

function keyToLabel(key: string): string {
  if (NOTE_LABELS[key]) return NOTE_LABELS[key];
  const lower = key.toLowerCase();
  const match = lower.match(/^custom_(text|text_area|number|date|dropdown|radio|file_upload|new_field|multible_checkbox|multiple_checkbox)_(\d+)$/);
  if (match) {
    const type = match[1];
    const num = match[2];
    const typeLabel =
      type === "text" ? "Text" :
      type === "text_area" ? "Text Area" :
      type === "number" ? "Number" :
      type === "date" ? "Date" :
      type === "dropdown" ? "Dropdown" :
      type === "radio" ? "Radio" :
      type === "file_upload" ? "File Upload" :
      type === "new_field" ? "New Field" :
      (type === "multible_checkbox" || type === "multiple_checkbox") ? "Multiple Checkbox" : type;
    return `Custom ${typeLabel} ${num}`;
  }
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const NOTE_KEY_ORDER = ["company", "address", "city", "state", "zipCode"];

/**
 * Format note for Shopify customer note field: JSON → readable lines.
 * Example: {"company":"XLOXI","city":"Vavuniya"} → "Company: XLOXI\nCity: Vavuniya"
 */
export function formatNoteForShopify(note: string | null | undefined): string {
  if (note == null || note === "") return "";

  try {
    const parsed = JSON.parse(note) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const lines: string[] = [];
      const keys = Object.keys(parsed);
      const ordered = [
        ...NOTE_KEY_ORDER.filter((k) => keys.includes(k)),
        ...keys.filter((k) => !NOTE_KEY_ORDER.includes(k)).sort(),
      ];
      for (const key of ordered) {
        const value = parsed[key];
        if (value == null || value === "") continue;
        const label = keyToLabel(key);
        const displayValue =
          typeof value === "string" ? shortenFileUploadValue(value) : String(value);
        lines.push(`${label}: ${displayValue}`);
      }
      if (lines.length === 0) return "";
      const heading = "=== APPROVEFY ===";
      // Add an extra blank line after the heading for readability
      return `${heading}\n\n${lines.join("\n")}`;
    }
  } catch {
    // not JSON
  }
  return note;
}
