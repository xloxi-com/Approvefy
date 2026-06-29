import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { runAppInstallSetup } from "./lib/app-install.server";
import { resolveAppOAuthScopes } from "./lib/app-scopes.server";
import { invalidateAppSubscriptionCache } from "./lib/app-subscription.server";
import { invalidateMerchantPlanCache } from "./lib/merchant-plan.server";

/** Canonical app URL; must match Partners `application_url` / redirect URLs for OAuth. */
function resolveAppUrl(): string {
  const explicit =
    process.env.SHOPIFY_APP_URL?.trim() || process.env.HOST?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod)
    return (prod.startsWith("http") ? prod : `https://${prod}`).replace(
      /\/$/,
      "",
    );

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "");
    return `https://${host.replace(/\/$/, "")}`;
  }

  return "";
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: resolveAppOAuthScopes(),
  appUrl: resolveAppUrl(),
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      invalidateAppSubscriptionCache(session.shop);
      invalidateMerchantPlanCache(session.shop);
      // Never block OAuth on Vercel — install setup can take 30s+ (theme API / CLI). Runs again from app layout loader.
      void runAppInstallSetup(
        admin,
        session.shop,
        session.accessToken,
        session.scope,
      ).catch((error) => {
        console.error("[afterAuth] install setup failed:", error);
      });
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;

/** One `authenticate.admin` per HTTP request — layout + leaf loaders share the same session lookup. */
const adminAuthByRequest = new WeakMap<
  Request,
  ReturnType<typeof shopify.authenticate.admin>
>();

function authenticateAdmin(request: Request) {
  let pending = adminAuthByRequest.get(request);
  if (!pending) {
    pending = shopify.authenticate.admin(request);
    adminAuthByRequest.set(request, pending);
  }
  return pending;
}

export const authenticate = {
  ...shopify.authenticate,
  admin: authenticateAdmin,
};
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
