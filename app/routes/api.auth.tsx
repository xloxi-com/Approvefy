/**
 * Shopify OAuth redirect URL is configured as /api/auth in Partner Dashboard.
 * This route forwards to /auth so the app's auth handler (authPathPrefix: "/auth") can process the callback.
 */
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  // shopifyApp(authPathPrefix: "/auth") expects the OAuth callback at /auth/callback
  // (and the install/login entrypoint at /auth).
  throw redirect(query ? `/auth/callback?${query}` : "/auth");
};
