import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getAnalytics } from "../models/approval.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session?.shop ?? "";
  if (!shop) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const analytics = await getAnalytics(shop);
    return new Response(JSON.stringify(analytics), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error loading analytics", error);
    return new Response(JSON.stringify({ error: "Failed to load analytics" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

