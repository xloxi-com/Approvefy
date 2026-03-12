import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { checkPhoneExists } from "../models/approval.server";

/**
 * GET /api/check-phone?shop=xxx&phone=yyy
 * Used by registration form to show "already registered" at the phone field.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.public.appProxy(request);
    if (!admin || !session?.shop) {
      return new Response(
        JSON.stringify({ taken: false, error: "Unauthorized" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const url = new URL(request.url);
    const phone = (url.searchParams.get("phone") || "").trim();
    if (!phone) {
      return new Response(JSON.stringify({ taken: false }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const taken = await checkPhoneExists(session.shop, phone, admin);
    return new Response(JSON.stringify({ taken }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.error("Check phone error:", e);
    return new Response(JSON.stringify({ taken: false }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
};
