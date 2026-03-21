import type { LoginError } from "@shopify/shopify-app-react-router/server";
import { LoginErrorType } from "@shopify/shopify-app-react-router/server";

export interface LoginErrorMessage {
  shop?: string;
}

export function loginErrorMessage(loginErrors: LoginError): LoginErrorMessage {
  if (loginErrors?.shop === LoginErrorType.MissingShop) {
    return { shop: "Please enter your shop domain to log in" };
  } else if (loginErrors?.shop === LoginErrorType.InvalidShop) {
    return { shop: "Please enter a valid shop domain (e.g. mystore.myshopify.com)" };
  }

  return {};
}

/** Normalizes shop domain: adds .myshopify.com if missing */
export function normalizeShopDomain(shop: string): string {
  const trimmed = shop.trim().toLowerCase();
  if (!trimmed) return trimmed;
  if (trimmed.endsWith(".myshopify.com")) return trimmed;
  // If it looks like just the subdomain (no dots or single word)
  if (!trimmed.includes(".")) {
    return `${trimmed}.myshopify.com`;
  }
  return trimmed;
}
