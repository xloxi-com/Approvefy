import type { ActionFunctionArgs } from "react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

type CompliancePayload = Record<string, unknown>;

function verifyShopifyWebhookHmac(
  rawBody: Buffer,
  hmacHeader: string | null,
  secret: string,
): boolean {
  if (!hmacHeader) return false;

  let receivedDigest: Buffer;
  try {
    receivedDigest = Buffer.from(hmacHeader.trim(), "base64");
  } catch {
    return false;
  }

  if (receivedDigest.length === 0) return false;

  const expectedDigest = createHmac("sha256", secret).update(rawBody).digest();
  if (expectedDigest.length !== receivedDigest.length) return false;

  try {
    return timingSafeEqual(expectedDigest, receivedDigest);
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
    console.error("Compliance webhook rejected: SHOPIFY_API_SECRET is missing.");
    return new Response("Server misconfigured", { status: 500 });
  }

  let rawBody: Buffer;
  try {
    rawBody = Buffer.from(await request.arrayBuffer());
  } catch (error) {
    console.error("Compliance webhook body read failed.", error);
    return new Response("Invalid body", { status: 400 });
  }

  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  const topic = request.headers.get("x-shopify-topic") ?? "unknown";

  if (!verifyShopifyWebhookHmac(rawBody, hmacHeader, secret)) {
    console.warn(`Compliance webhook rejected: invalid HMAC (topic: ${topic}).`);
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: CompliancePayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as CompliancePayload;
  } catch (error) {
    console.error(`Compliance webhook JSON parse failed (topic: ${topic}).`, error);
    return new Response("Invalid JSON payload", { status: 400 });
  }

  // Log topic and payload for audit/debugging while keeping response fast.
  console.info(`Compliance webhook received (topic: ${topic}).`);
  console.info("Compliance webhook payload:", payload);

  return new Response(null, { status: 200 });
};
