import { apiVersion } from "../shopify.server";
import { getOfflineAccessTokenForShop } from "../models/approval.server";

type AdminGraphql = {
    graphql: (
        query: string,
        options?: { variables?: Record<string, unknown> },
    ) => Promise<Response>;
};

const CUSTOMER_TAGS_QUERY = `#graphql
  query ApprovefyStorefrontCustomerTags($id: ID!) {
    customer(id: $id) { tags }
  }`;

/** Storefront guard: load Shopify customer tags even when app-proxy session has no Admin client. */
export async function fetchStorefrontCustomerTags(
    shop: string,
    customerDigits: string,
    admin: AdminGraphql | null,
): Promise<string[] | null> {
    const normalizedShop = (shop || "").trim();
    const digits = (customerDigits || "").trim();
    if (!normalizedShop || !digits || !/^\d{1,20}$/.test(digits)) {
        return null;
    }

    const gid = `gid://shopify/Customer/${digits}`;
    const variables = { id: gid };

    try {
        let res: Response | null = null;
        if (admin) {
            res = await admin.graphql(CUSTOMER_TAGS_QUERY, { variables });
        } else {
            const token = await getOfflineAccessTokenForShop(normalizedShop);
            if (!token) return null;
            res = await fetch(
                `https://${normalizedShop}/admin/api/${apiVersion}/graphql.json`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Shopify-Access-Token": token,
                    },
                    body: JSON.stringify({ query: CUSTOMER_TAGS_QUERY, variables }),
                },
            );
        }
        if (!res?.ok) return null;
        const json = (await res.json()) as {
            data?: { customer?: { tags?: string[] } | null };
        };
        const tags = json.data?.customer?.tags;
        return Array.isArray(tags) ? tags.map((t) => String(t)) : [];
    } catch {
        return null;
    }
}
