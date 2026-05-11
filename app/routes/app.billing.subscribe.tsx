import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  isPricingTierId,
  SUBSCRIPTION_AMOUNT_USD,
  SUBSCRIPTION_DISPLAY_NAMES,
  trialDaysFromCopy,
} from "../lib/billing-plans";

function resolvePublicAppUrl(request: Request): string {
  const explicit =
    process.env.SHOPIFY_APP_URL?.trim() || process.env.HOST?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}

/** Test subscriptions (no real charge): env override > Partner development store heuristic. */
async function shouldUseTestBilling(admin: {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
}): Promise<boolean> {
  const force = process.env.SHOPIFY_APP_SUBSCRIPTION_TEST?.trim().toLowerCase();
  if (force === "1" || force === "true" || force === "yes") return true;
  if (force === "0" || force === "false" || force === "no") return false;
  try {
    const res = await admin.graphql(
      `#graphql
      query BillingTestMode {
        shop {
          plan {
            partnerDevelopment
          }
        }
      }`,
    );
    const j = (await res.json()) as {
      data?: { shop?: { plan?: { partnerDevelopment?: boolean | null } } };
    };
    return Boolean(j?.data?.shop?.plan?.partnerDevelopment);
  } catch {
    return false;
  }
}

/** Starts Shopify-managed recurring billing; browser must navigate to returned `confirmationUrl`. */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json(
      { ok: false as const, error: "Method not allowed" },
      { status: 405 },
    );
  }

  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const planRaw = formData.get("plan");

  if (!isPricingTierId(planRaw)) {
    return Response.json(
      { ok: false as const, error: "Invalid plan selected." },
      { status: 400 },
    );
  }

  const appUrl = resolvePublicAppUrl(request);
  const shop = session.shop?.trim();
  if (!shop) {
    return Response.json(
      { ok: false as const, error: "Missing shop session." },
      { status: 400 },
    );
  }

  /**
   * Embedded apps must land with `host` (and `shop`) after external billing so
   * `authenticate.admin` can restore the admin session — otherwise merchants hit /auth/login.
   */
  const hostRaw = formData.get("host");
  const host = typeof hostRaw === "string" ? hostRaw.trim() : "";
  if (!host) {
    return Response.json(
      {
        ok: false as const,
        error:
          "Missing embedded admin context (host). Close this tab, open Approvefy from Shopify admin → Settings → Apps → Approvefy, then subscribe again from Pricing.",
      },
      { status: 400 },
    );
  }

  const returnParams = new URLSearchParams({
    billing: "callback",
    shop,
    host,
  });
  /** After approve/decline Shopify redirects here with enough context to re-enter the iframe. */
  const returnUrl = `${appUrl}/app/pricing?${returnParams.toString()}`;

  const test = await shouldUseTestBilling(admin);
  const trialDays = trialDaysFromCopy();
  const amount = Number(SUBSCRIPTION_AMOUNT_USD[planRaw]);

  if (!Number.isFinite(amount) || amount <= 0) {
    return Response.json(
      { ok: false as const, error: "Billing amount configuration error." },
      { status: 500 },
    );
  }

  const lineItems = [
    {
      plan: {
        appRecurringPricingDetails: {
          price: {
            amount,
            currencyCode: "USD" as const,
          },
          interval: "EVERY_30_DAYS" as const,
        },
      },
    },
  ];

  const response = await admin.graphql(
    `#graphql
    mutation CreateAppSubscription(
      $name: String!
      $returnUrl: URL!
      $trialDays: Int!
      $lineItems: [AppSubscriptionLineItemInput!]!
      $replacementBehavior: AppSubscriptionReplacementBehavior!
      $test: Boolean!
    ) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        trialDays: $trialDays
        lineItems: $lineItems
        replacementBehavior: $replacementBehavior
        test: $test
      ) {
        confirmationUrl
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        name: SUBSCRIPTION_DISPLAY_NAMES[planRaw],
        returnUrl,
        trialDays,
        lineItems,
        replacementBehavior: "APPLY_IMMEDIATELY",
        test,
      },
    },
  );

  const json = (await response.json()) as {
    errors?: Array<{ message?: string }>;
    data?: {
      appSubscriptionCreate?: {
        confirmationUrl?: string | null;
        userErrors?: Array<{ message?: string }>;
      };
    };
  };

  const topErrors = json?.errors;
  if (topErrors?.length) {
    return Response.json(
      {
        ok: false as const,
        error: topErrors[0]?.message || "Billing request failed.",
      },
      { status: 400 },
    );
  }

  const payload = json?.data?.appSubscriptionCreate;
  const userErrors = payload?.userErrors ?? [];
  if (userErrors.length > 0) {
    return Response.json(
      {
        ok: false as const,
        error: userErrors.map((e) => e.message).filter(Boolean).join(" ") || "Billing error.",
      },
      { status: 400 },
    );
  }

  const confirmationUrl = payload?.confirmationUrl;
  if (!confirmationUrl) {
    return Response.json(
      { ok: false as const, error: "No confirmation URL returned from Shopify." },
      { status: 502 },
    );
  }

  return Response.json({
    ok: true as const,
    confirmationUrl,
  });
};
