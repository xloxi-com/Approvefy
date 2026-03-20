import type { ActionFunctionArgs } from "react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const primarySecret = process.env.SHOPIFY_API_SECRET ?? "";
  const previousSecret = process.env.SHOPIFY_API_SECRET_PREVIOUS ?? "";
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");

  const verify = (secret: string): boolean => {
    if (!secret || !hmacHeader) return false;
    const computed = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
    try {
      const a = Buffer.from(computed, "base64");
      const b = Buffer.from(hmacHeader.trim(), "base64");
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  };

  const isValid = verify(primarySecret) || verify(previousSecret);
  if (!isValid) {
    console.error("webhooks.app.uninstalled: HMAC verification failed");
    return new Response("Unauthorized", { status: 401 });
  }

  const topic = request.headers.get("x-shopify-topic") ?? "app/uninstalled";
  const shop = request.headers.get("x-shopify-shop-domain") ?? "";
  if (!shop) {
    console.warn("webhooks.app.uninstalled: missing shop domain header");
    return new Response("OK", { status: 200 });
  }

  console.log(`Received ${topic} webhook for ${shop}`);
  await db.session.deleteMany({ where: { shop } });
  return new Response("OK", { status: 200 });
};
