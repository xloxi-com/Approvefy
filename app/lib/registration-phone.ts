/** NANP: country code 1 + 10 digits (US/CA and other +1 regions). */
const NANP_DIGITS = /^1[2-9]\d{2}[2-9]\d{6}$/;

/** Strip all whitespace (spaces, tabs, etc.) for storage and comparison. */
export function normalizeRegistrationPhone(phoneRaw: string): string {
  return String(phoneRaw ?? "").replace(/\s/g, "");
}

/**
 * Validate a stored / admin-edited phone (typically E.164-style).
 * Empty is allowed. Leading +1 must be a full 11-digit NANP number.
 * Safe for client and server (no Node-only APIs).
 */
export function validateStoredRegistrationPhone(phoneRaw: string): string | null {
  const compact = normalizeRegistrationPhone(phoneRaw);
  if (!compact) return null;
  const digits = compact.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    return "Phone number must be between 8 and 15 digits.";
  }
  if (digits[0] === "1") {
    if (!NANP_DIGITS.test(digits)) {
      return "Enter a valid US or Canadian number (10 digits after +1).";
    }
    return null;
  }
  if (digits.startsWith("91") && digits.length !== 12) {
    return "Indian numbers must use +91 and 10 additional digits.";
  }
  return null;
}
