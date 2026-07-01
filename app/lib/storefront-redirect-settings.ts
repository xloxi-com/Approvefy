import { REGISTRATION_PAGE_PATH } from "./registration-page.constants";

/** Default storefront guard / redirect toggles for new shops and unset JSON keys. Safe for client + server. */
export const STOREFRONT_REDIRECT_DEFAULTS = {
  redirectGuestsFromCheckout: true,
  blockLoggedInWithoutApprovedTag: true,
  redirectSignInLinksToFormPage: true,
  guestCheckoutRedirectUrl: REGISTRATION_PAGE_PATH,
} as const;

export type StorefrontRedirectBooleanKey = keyof Pick<
  typeof STOREFRONT_REDIRECT_DEFAULTS,
  "redirectGuestsFromCheckout" | "blockLoggedInWithoutApprovedTag" | "redirectSignInLinksToFormPage"
>;

export function readStorefrontRedirectBooleanSetting(
  parsed: Record<string, unknown>,
  key: StorefrontRedirectBooleanKey,
): boolean {
  const value = parsed[key];
  if (typeof value === "boolean") return value;
  return STOREFRONT_REDIRECT_DEFAULTS[key];
}
