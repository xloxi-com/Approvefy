import { createHmac, timingSafeEqual } from "node:crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import db from "../db.server";

const HMAC_HEADER = "x-shopify-hmac-sha256";
const TOPIC_HEADER = "x-shopify-topic";
const SHOP_DOMAIN_HEADER = "x-shopify-shop-domain";

/**
 * GET requests (e.g. browser navigation) get 405 - compliance webhooks require POST.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- loader must accept LoaderFunctionArgs
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return new Response(
    JSON.stringify({ error: "Method Not Allowed", message: "This endpoint accepts POST requests only (Shopify webhooks)" }),
    { status: 405, headers: { "Content-Type": "application/json" } }
  );
};

/**
 * Verify Shopify webhook using raw body and X-Shopify-Hmac-SHA256.
 * Must use raw body (not parsed JSON) for HMAC to pass App Store checks.
 */
function verifyShopifyWebhookHmac(rawBody: string, hmacHeader: string | null, secret: string): boolean {
  const trimmed = hmacHeader?.trim();
  if (!trimmed || !secret) return false;
  const computed = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  try {
    const a = Buffer.from(computed, "base64");
    const b = Buffer.from(trimmed, "base64");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Mandatory GDPR compliance webhooks (App Store requirement):
 * - customers/data_request, customers/redact, shop/redact
 * Verifies HMAC with raw request body; returns 401 if invalid, 200 after processing.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.error("Compliance webhook: SHOPIFY_API_SECRET not set");
    return new Response("Unauthorized", { status: 401 });
  }

  const rawBody = await request.text();
  const hmacHeader = request.headers.get(HMAC_HEADER);
  if (!verifyShopifyWebhookHmac(rawBody, hmacHeader, secret)) {
    console.error("Compliance webhook: HMAC verification failed");
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    console.error("Compliance webhook: invalid JSON body");
    return new Response("OK", { status: 200 });
  }

  const topic = request.headers.get(TOPIC_HEADER) ?? (payload.topic as string) ?? "";
  const shop = request.headers.get(SHOP_DOMAIN_HEADER) ?? (payload.shop_domain as string) ?? "";

  const shopDomain = (payload.shop_domain as string) || shop || "";
  if (!shopDomain) {
    console.warn("Compliance webhook: missing shop domain");
    return new Response("OK", { status: 200 });
  }

  switch (topic) {
    case "customers/data_request":
    case "CUSTOMERS_DATA_REQUEST":
      await handleCustomersDataRequest(payload, shopDomain);
      break;
    case "customers/redact":
    case "CUSTOMERS_REDACT":
      await handleCustomersRedact(payload, shopDomain);
      break;
    case "shop/redact":
    case "SHOP_REDACT":
      await handleShopRedact(payload, shopDomain);
      break;
    default:
      console.warn(`Unhandled compliance webhook topic: ${topic}`);
  }

  return new Response("OK", { status: 200 });
};

async function handleCustomersDataRequest(
  payload: Record<string, unknown>,
  shopDomain: string
): Promise<void> {
  const customer = payload.customer as { id?: number; email?: string; phone?: string } | undefined;
  if (!customer) return;

  const customerId = customer.id ? `gid://shopify/Customer/${customer.id}` : null;
  const email = ((customer.email as string) || "").trim().toLowerCase();
  if (!customerId && !email) return;

  try {
    const registrations = await db.registration.findMany({
      where: {
        shop: shopDomain,
        ...(customerId
          ? { OR: [{ customerId }, { email: email.toLowerCase() }] }
          : { email: email.toLowerCase() }),
      },
    });

    // Per GDPR: provide stored data to the store owner within 30 days.
    // Log for fulfillment; store owner receives via their process.
    console.log("Customer data request:", {
      shop: shopDomain,
      customerId,
      email,
      dataRequestId: (payload.data_request as { id?: number })?.id,
      recordsCount: registrations.length,
    });

    // TODO: In production, queue a job to compile and send data to store owner
    // (e.g. export CSV/JSON and email or provide via dashboard).
  } catch (err) {
    console.error("Error processing customers/data_request:", err);
  }
}

async function handleCustomersRedact(
  payload: Record<string, unknown>,
  shopDomain: string
): Promise<void> {
  const customer = payload.customer as { id?: number; email?: string } | undefined;
  if (!customer) return;

  const customerId = customer.id ? `gid://shopify/Customer/${customer.id}` : null;
  const email = (customer.email as string) || "";

  try {
    const result = await db.registration.deleteMany({
      where: {
        shop: shopDomain,
        ...(customerId
          ? { OR: [{ customerId }, { email: email.toLowerCase() }] }
          : { email: email.toLowerCase() }),
      },
    });
    console.log("Customer redact completed:", {
      shop: shopDomain,
      customerId,
      email,
      deletedCount: result.count,
    });
  } catch (err) {
    console.error("Error processing customers/redact:", err);
  }
}

async function handleShopRedact(payload: Record<string, unknown>, shopDomain: string): Promise<void> {
  try {
    // Session is already deleted by app/uninstalled webhook.
    // Delete all other shop-specific data.
    await db.registration.deleteMany({ where: { shop: shopDomain } });
    await db.appSettings.deleteMany({ where: { shop: shopDomain } });
    await db.formConfig.deleteMany({ where: { shop: shopDomain } });
    await db.emailTemplate.deleteMany({ where: { shop: shopDomain } });
    await db.smtpSettings.deleteMany({ where: { shop: shopDomain } });

    const b2bCount = await db.b2BSettings.deleteMany({ where: { shop: shopDomain } });

    console.log("Shop redact completed:", {
      shop: shopDomain,
      shopId: payload.shop_id,
      b2bSettingsDeleted: b2bCount.count,
    });
  } catch (err) {
    console.error("Error processing shop/redact:", err);
  }
}
