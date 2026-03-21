import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_PREFIX = "scrypt17:";

/** Hash password for storage (scrypt). */
export function hashMerchantLoginPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 64, { N: 16384, r: 8, p: 1 });
  return `${SCRYPT_PREFIX}${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Constant-time verify against stored hash. */
export function verifyMerchantLoginPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored || !plain || !stored.startsWith(SCRYPT_PREFIX)) return false;
  const rest = stored.slice(SCRYPT_PREFIX.length);
  const colon = rest.indexOf(":");
  if (colon < 1) return false;
  const saltHex = rest.slice(0, colon);
  const hashHex = rest.slice(colon + 1);
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = scryptSync(plain, salt, expected.length, { N: 16384, r: 8, p: 1 });
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
