import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  listEmailTemplates,
  createEmailTemplate,
} from "../models/email-template.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session?.shop ?? "";
  if (!shop) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const templates = await listEmailTemplates(shop);
  return new Response(JSON.stringify({ templates }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session?.shop ?? "";
  if (!shop) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const body = await request.json();
    const slug = typeof body.slug === "string" ? body.slug : "";
    const name = typeof body.name === "string" ? body.name : slug;
    const subject = typeof body.subject === "string" ? body.subject : "";
    const bodyHtml = typeof body.bodyHtml === "string" ? body.bodyHtml : "";
    const bodyText = typeof body.bodyText === "string" ? body.bodyText : undefined;
    const result = await createEmailTemplate(shop, {
      slug,
      name,
      subject,
      bodyHtml,
      bodyText,
    });
    if (result.error) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(result.template), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create template";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
