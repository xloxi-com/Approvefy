import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getSmtpSettings, upsertSmtpSettings } from "../lib/smtp.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session?.shop ?? "";
  if (!shop) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const settings = await getSmtpSettings(shop);
  return new Response(JSON.stringify(settings ?? null), {
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
    const host = typeof body.host === "string" ? body.host.trim() : "";
    const port = typeof body.port === "number" ? body.port : Number(body.port) || 587;
    const secure = Boolean(body.secure);
    const user = typeof body.user === "string" ? body.user : undefined;
    const password = typeof body.password === "string" ? body.password : undefined;
    const fromEmail = typeof body.fromEmail === "string" ? body.fromEmail.trim() : "";
    const fromName = typeof body.fromName === "string" ? body.fromName : undefined;
    if (!host || !fromEmail) {
      return new Response(
        JSON.stringify({ error: "host and fromEmail are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    await upsertSmtpSettings(shop, {
      host,
      port,
      secure,
      user: user || null,
      password: password || null,
      fromEmail,
      fromName: fromName || null,
    });
    const settings = await getSmtpSettings(shop);
    return new Response(JSON.stringify(settings), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save SMTP settings";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
