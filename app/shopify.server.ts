import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

/** Keep in sync with `scopes` in shopify.app.toml — used if SCOPES is unset in production. */
const DEFAULT_SCOPES =
  "read_customers,write_customers,write_app_proxy,read_locales";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY?.trim(),
  apiSecretKey: (process.env.SHOPIFY_API_SECRET || "").trim(),
  apiVersion: ApiVersion.October25,
  scopes: (process.env.SCOPES ?? DEFAULT_SCOPES).split(",").map((s) => s.trim()).filter(Boolean),
  appUrl: (process.env.SHOPIFY_APP_URL || "").trim(),
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
