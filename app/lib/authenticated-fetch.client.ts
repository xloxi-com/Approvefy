import createApp from "@shopify/app-bridge";
import { getSessionToken } from "@shopify/app-bridge-utils";

declare global {
  interface Window {
    __SHOPIFY_API_KEY__?: string;
    __SHOPIFY_APP_DEBUG__?: boolean;
  }
}

type AppBridgeFetchInit = RequestInit & {
  headers?: HeadersInit;
};

let appBridgeInstance: ReturnType<typeof createApp> | null = null;

function getDebug(): boolean {
  if (typeof window === "undefined") return false;
  return !!(
    window.__SHOPIFY_APP_DEBUG__ ||
    (typeof localStorage !== "undefined" && localStorage.getItem("SHOPIFY_APP_DEBUG") === "1")
  );
}

function getHostParamFromUrl(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const host = params.get("host") || "";
  if (getDebug() && !host) {
    console.warn("[Approvefy] No host param in URL. Embedded apps require ?host= in the URL from Shopify Admin.", {
      search: window.location.search,
    });
  }
  return host;
}

function getOrCreateAppBridge() {
  if (typeof window === "undefined") return null;
  if (appBridgeInstance) return appBridgeInstance;

  const apiKey = window.__SHOPIFY_API_KEY__ || "";
  const host = getHostParamFromUrl();

  if (!apiKey) {
    if (getDebug()) console.warn("[Approvefy] No apiKey for App Bridge. window.__SHOPIFY_API_KEY__ not set.");
    return null;
  }
  if (!host) {
    if (getDebug()) console.warn("[Approvefy] No host param. Cannot create App Bridge. Ensure app is opened from Shopify Admin iframe.");
    return null;
  }

  appBridgeInstance = createApp({
    apiKey,
    host,
    forceRedirect: true,
  });

  if (getDebug()) console.log("[Approvefy] App Bridge created", { apiKey: apiKey.slice(0, 8) + "...", hasHost: !!host });

  return appBridgeInstance;
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: AppBridgeFetchInit = {},
) {
  const app = getOrCreateAppBridge();
  const headers = new Headers(init.headers || {});

  if (app) {
    const token = await getSessionToken(app);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
      if (getDebug()) console.log("[Approvefy] Session token attached to request", { url: String(input).slice(0, 80) });
    } else {
      if (getDebug()) console.warn("[Approvefy] getSessionToken returned no token");
    }
  } else {
    if (getDebug()) console.warn("[Approvefy] authenticatedFetch: No App Bridge, request sent without session token", { url: String(input) });
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? "same-origin",
  });
}
