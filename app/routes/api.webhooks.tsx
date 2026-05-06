import type { ActionFunctionArgs } from "react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

type ComplianceTopic =
  | "customers/data_request"
  | "customers/redact"
  | "shop/redact";

const COMPLIANCE_TOPICS: ReadonlySet<string> = new Set([
  "customers/data_request",
  "customers/redact",
  "shop/redact",
]);

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

  const topic = request.headers.get("x-shopify-topic")?.trim().toLowerCase();
  if (!topic || !COMPLIANCE_TOPICS.has(topic)) {
    return new Response(null, { status: 200 });
  }

  // Parse to ensure valid JSON payload for compliance topics.
  try {
    JSON.parse(rawBody.toString("utf8"));
  } catch {
    return new Response(null, { status: 401 });
  }

  const complianceTopic = topic as ComplianceTopic;
  console.log(`Received compliance webhook topic: ${complianceTopic}`);

  return new Response(null, { status: 200 });
};
