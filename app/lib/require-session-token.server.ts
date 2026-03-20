import jwt from "jsonwebtoken";

type SessionTokenPayload = jwt.JwtPayload & {
  aud?: string;
  dest?: string;
};

const DEBUG = process.env.SHOPIFY_APP_DEBUG === "1" || process.env.NODE_ENV === "development";

function unauthorized(message: string): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Shopify-Retry-Invalid-Session-Request": "1",
  };
  if (DEBUG) {
    headers["X-Debug-Auth"] = message;
  }
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers,
  });
}

export function requireValidSessionToken(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  if (DEBUG) {
    console.log("[Approvefy] Session token check:", {
      hasAuth: !!authHeader,
      authPrefix: authHeader.slice(0, 20),
    });
  }
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return unauthorized("Missing or invalid Authorization header");

  const token = match[1].trim();
  const secret = process.env.SHOPIFY_API_SECRET?.trim();
  if (!secret) {
    return new Response(JSON.stringify({ error: "Server auth misconfiguration" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
    }) as SessionTokenPayload;

    const expectedAudience = (process.env.SHOPIFY_API_KEY || "").trim();
    const aud = decoded?.aud;
    const audOk =
      typeof aud === "string"
        ? aud === expectedAudience
        : Array.isArray(aud)
          ? aud.includes(expectedAudience)
          : false;
    if (!expectedAudience || !audOk) {
      return unauthorized("Invalid token audience");
    }

    const dest = typeof decoded.dest === "string" ? decoded.dest : "";
    let shopFromDest = "";
    try {
      shopFromDest = dest ? new URL(dest).hostname : "";
    } catch {
      return unauthorized("Invalid token destination");
    }
    if (!shopFromDest || !shopFromDest.endsWith(".myshopify.com")) {
      return unauthorized("Invalid token destination");
    }

    if (DEBUG) {
      console.log("[Approvefy] Session token verified:", { shopFromDest, aud: decoded.aud });
    }
    return {
      token,
      payload: decoded,
      shopFromDest,
    };
  } catch (err) {
    if (DEBUG) {
      console.error("[Approvefy] Session token verification failed:", err);
    }
    return unauthorized("Invalid or expired session token");
  }
}
