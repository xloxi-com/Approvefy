import { redirect } from "react-router";

/**
 * If the request is an embedded admin load (shop + host), bounce through
 * `/auth/session-token` so App Bridge can attach a fresh `id_token`.
 * Call only after a 401 from `authenticate.admin`.
 */
export function maybeThrowSessionTokenBounce(request: Request): void {
  const url = new URL(request.url);
  if (!url.searchParams.get("shop") || !url.searchParams.get("host")) return;

  const appUrl = (process.env.SHOPIFY_APP_URL || url.origin).replace(/\/$/, "");
  const sp = new URLSearchParams(url.searchParams);
  sp.delete("id_token");
  const qs = sp.toString();
  const reload = `${appUrl}${url.pathname}${qs ? `?${qs}` : ""}`;
  sp.set("shopify-reload", reload);
  throw redirect(`/auth/session-token?${sp.toString()}`);
}
