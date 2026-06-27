import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getCustomerApprovalModeForShop } from "../models/approval.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { admin, payload, topic, shop } = await authenticate.webhook(request);

    if (!admin) {
        return new Response();
    }

    console.log(`Received ${topic} webhook for ${shop}`);

    const customerId = `gid://shopify/Customer/${payload.id}`;

    const tags = (payload.tags || "") as string;
    const tagList = tags.split(",").map(t => t.trim());

    const hasStatusTag = tagList.some(tag => tag.startsWith("status:"));

    if (!hasStatusTag) {
        const approvalMode = shop ? await getCustomerApprovalModeForShop(shop) : "manual";
        if (approvalMode === "auto") {
            console.log(
                `Skipping status:pending tag for ${customerId} — shop uses auto approval.`,
            );
            return new Response();
        }

        console.log(`Tagging customer ${customerId} as status:pending`);

        await admin.graphql(
            `#graphql
      mutation tagsAdd($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          userErrors {
            field
            message
          }
        }
      }`,
            {
                variables: {
                    id: customerId,
                    tags: ["status:pending"],
                },
            }
        );

        console.log(`Customer ${customerId} tagged successfully.`);
    } else {
        console.log(`Customer ${customerId} already has status tags: ${tags}`);
    }

    return new Response();
};
