import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const rawId = params.id;

  if (!rawId) {
    return new Response("Missing id", { status: 400 });
  }

  const url = new URL(request.url);
  const field = url.searchParams.get("field");
  if (!field) {
    return new Response("Missing field", { status: 400 });
  }

  const id = decodeURIComponent(rawId);

  const isDbOnly = id.startsWith("db-");
  const registrationId = isDbOnly ? id.slice(3) : null;

  const reg = await prisma.registration.findFirst({
    where: isDbOnly ? { id: registrationId as string } : { customerId: id },
    select: { customData: true },
  });

  if (!reg || !reg.customData || typeof reg.customData !== "object" || Array.isArray(reg.customData)) {
    return new Response("File not found", { status: 404 });
  }

  const source = reg.customData as Record<string, unknown>;
  const raw = source[field];
  if (typeof raw !== "string") {
    return new Response("File not found", { status: 404 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Response("File not found", { status: 404 });
  }

  const pickFile = (value: unknown) => {
    if (!value || typeof value !== "object") return null;
    if (Array.isArray(value)) {
      return value.length > 0 && typeof value[0] === "object" ? (value[0] as Record<string, unknown>) : null;
    }
    return value as Record<string, unknown>;
  };

  const file = pickFile(parsed) as ({ data?: string; type?: string; name?: string } & Record<string, unknown>) | null;

  // base64-encoded data stored in DB
  const data = file?.data;
  if (typeof data !== "string" || !data) {
    return new Response("File not found", { status: 404 });
  }

  const binary =
    typeof atob === "function"
      ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      : Uint8Array.from(Buffer.from(data, "base64"));

  const mime = typeof file.type === "string" && file.type ? (file.type as string) : "application/octet-stream";
  const name = typeof file.name === "string" && file.name ? (file.name as string) : "download";

  return new Response(binary, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": binary.byteLength.toString(),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
      "Cache-Control": "no-store",
    },
  });
};

