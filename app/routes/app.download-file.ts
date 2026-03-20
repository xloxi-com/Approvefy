import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { requireValidSessionToken } from "../lib/require-session-token.server";

/**
 * Proxy route: /app/download-file?url=<supabase_url>&name=<filename>
 *
 * Fetches the file from Supabase on the server side and returns it
 * with Content-Disposition: attachment so the browser downloads it
 * rather than viewing it (cross-origin download attribute doesn't work).
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const tokenResult = requireValidSessionToken(request);
  if (tokenResult instanceof Response) return tokenResult;

  // Authenticate to make sure only logged-in admins can use this
  const { session } = await authenticate.admin(request);
  if (tokenResult.shopFromDest !== session.shop) {
    return new Response(JSON.stringify({ error: "Token shop mismatch" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const searchParams = new URL(request.url).searchParams;
  const fileUrl = searchParams.get("url");
  const fileName = searchParams.get("name") || "download";

  if (!fileUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }

  // Only allow Supabase URLs to prevent SSRF abuse
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(fileUrl);
  } catch {
    return new Response("Invalid url parameter", { status: 400 });
  }

  const supabaseHost = process.env.SUPABASE_URL
    ? new URL(process.env.SUPABASE_URL).hostname
    : null;

  if (!supabaseHost || parsedUrl.hostname !== supabaseHost) {
    return new Response("URL not allowed", { status: 403 });
  }

  try {
    const upstream = await fetch(fileUrl);
    if (!upstream.ok) {
      return new Response("Failed to fetch file from storage", {
        status: upstream.status,
      });
    }

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const body = await upstream.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    console.error("Download proxy error:", err);
    return new Response("Failed to download file", { status: 500 });
  }
};
