import type { ActionFunctionArgs } from "react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

type ComplianceTopic =
  | "customers/data_request"
  | "customers/redact"
  | "shop/redact";

function verifyShopifyHmac(rawBody: Buffer, hmacHeader: string | null, secret: string) {
  if (!hmacHeader) return false;

  const digest = createHmac("sha256", secret).update(rawBody).digest("base64");

  const expected = Buffer.from(digest, "utf8");
  const received = Buffer.from(hmacHeader.trim(), "utf8");

  if (expected.length !== received.length) return false;

  try {
    return timingSafeEqual(expected, received);
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

  // Read the raw body before any JSON parsing for HMAC verification.
  const rawBody = Buffer.from(await request.arrayBuffer());
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");

  if (!verifyShopifyHmac(rawBody, hmacHeader, secret)) {
    return new Response(null, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
  } catch {
    // Valid HMAC but invalid JSON should not retry forever for compliance webhooks.
    return new Response(null, { status: 200 });
  }

  const topic = request.headers.get("x-shopify-topic") as ComplianceTopic | null;

  switch (topic) {
    case "customers/data_request":
      console.log("Received customers/data_request webhook", payload);
      return new Response(null, { status: 200 });

    case "customers/redact":
      console.log("Received customers/redact webhook", payload);
      // TODO: delete or anonymize customer data tied to payload.customer.id.
      return new Response(null, { status: 200 });

    case "shop/redact":
      console.log("Received shop/redact webhook", payload);
      // TODO: delete shop data tied to payload.shop_id or payload.shop_domain.
      return new Response(null, { status: 200 });

    default:
      return new Response(null, { status: 200 });
  }
};
