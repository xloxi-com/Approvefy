import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = () => new Response(null, { status: 405 });

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} compliance webhook for ${shop}`);

  // Compliance webhooks must acknowledge receipt even when the shop
  // has already uninstalled and no session exists.
  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
    case "SHOPS_REDACT":
      return new Response(null, { status: 200 });
    default:
      return new Response(null, { status: 200 });
  }
};
