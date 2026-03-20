import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { admin, payload, topic, shop } = await authenticate.webhook(request);

    if (!admin) {
        return new Response();
    }

    console.log(`Received ${topic} webhook for ${shop}`);

    // Customer ID is in payload.id
    const customerId = `gid://shopify/Customer/${payload.id}`;

    // Check if customer already has status:pending, status:approved, or status:denied
    const tags = (payload.tags || "") as string;
    const tagList = tags.split(",").map(t => t.trim());

    const hasStatusTag = tagList.some(tag => tag.startsWith("status:"));

    if (!hasStatusTag) {
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
