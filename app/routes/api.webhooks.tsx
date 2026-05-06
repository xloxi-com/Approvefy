import type { ActionFunctionArgs } from "react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

function verifyShopifyHmac(rawBody: string, hmacHeader: string | null, secret: string): boolean {
  if (!hmacHeader) return false;

  const generatedHmac = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  const trusted = Buffer.from(generatedHmac, "utf8");
  const received = Buffer.from(hmacHeader.trim(), "utf8");

  if (trusted.length !== received.length) return false;

  try {
    return timingSafeEqual(trusted, received);
  } catch {
    return false;
  }
}

export const loader = () => new Response("Method Not Allowed", { status: 405 });

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await request.text();
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  const topic = request.headers.get("x-shopify-topic");
  const secret = process.env.SHOPIFY_API_SECRET?.trim();

  if (!secret || !verifyShopifyHmac(rawBody, hmacHeader, secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  switch (topic) {
    case "customers/data_request":
    case "customers/redact":
    case "shop/redact":
      break;
    default:
      break;
  }

  return new Response("OK", { status: 200 });
};
