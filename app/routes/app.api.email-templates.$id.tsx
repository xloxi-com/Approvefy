import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getEmailTemplateById,
  updateEmailTemplate,
  deleteEmailTemplate,
} from "../models/email-template.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session?.shop ?? "";
  const id = params.id ?? "";
  if (!shop || !id) {
    return new Response(JSON.stringify({ error: "Unauthorized or missing id" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const template = await getEmailTemplateById(shop, id);
  if (!template) {
    return new Response(JSON.stringify({ error: "Template not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify(template), {
    headers: { "Content-Type": "application/json" },
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session?.shop ?? "";
  const id = params.id ?? "";
  if (!shop || !id) {
    return new Response(JSON.stringify({ error: "Unauthorized or missing id" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (request.method === "PUT") {
    try {
      const body = await request.json();
      const result = await updateEmailTemplate(shop, id, {
        name: body.name,
        subject: body.subject,
        bodyHtml: body.bodyHtml,
        bodyText: body.bodyText,
      });
      if (result.error) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(result.template), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to update template";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
  if (request.method === "DELETE") {
    const result = await deleteEmailTemplate(shop, id);
    if (result.error) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
};
