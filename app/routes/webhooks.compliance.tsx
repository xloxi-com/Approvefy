import type { ActionFunctionArgs } from "react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import db from "../db.server";

function verifyShopifyHmacSha256(
  rawBody: Buffer,
  hmacHeader: string | null,
  secret: string,
): boolean {
  if (!hmacHeader) return false;

  const digest = createHmac("sha256", secret).update(rawBody).digest("base64");

  const expectedBuf = Buffer.from(digest, "utf8");
  const receivedBuf = Buffer.from(hmacHeader.trim(), "utf8");

  if (expectedBuf.length !== receivedBuf.length) return false;

  try {
    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

export const loader = () => new Response(null, { status: 405 });

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  const secret = process.env.SHOPIFY_API_SECRET?.trim();
  if (!secret) {
    return new Response(null, { status: 401 });
  }

  const rawBody = Buffer.from(await request.arrayBuffer());
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");

  if (!verifyShopifyHmacSha256(rawBody, hmacHeader, secret)) {
    return new Response(null, { status: 401 });
  }

  let shopDomain: string | undefined;
  try {
    const payload = JSON.parse(rawBody.toString("utf8")) as {
      shop_domain?: unknown;
    };
    if (typeof payload.shop_domain === "string" && payload.shop_domain.trim()) {
      shopDomain = payload.shop_domain.trim();
    }
  } catch {
    return new Response(null, { status: 401 });
  }

  if (!shopDomain) {
    return new Response(null, { status: 401 });
  }

  const session = await db.session.findFirst({
    where: { shop: shopDomain },
    select: { id: true },
  });

  if (!session) {
    return new Response(null, { status: 401 });
  }

  return new Response(null, { status: 200 });
};
