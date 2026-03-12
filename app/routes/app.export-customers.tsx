import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getCustomersForExport } from "../models/approval.server";
import type { RegistrationExportRow } from "../models/approval.server";
import { buildCustomDataLabels, type FormFieldForLabels } from "../lib/form-config-labels.server";

function escapeCsvCell(value: string | null | undefined): string {
  if (value == null) return "";
  const s = String(value).trim();
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function customDataValueToStr(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join("; ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session?.shop ?? "";
  const url = new URL(request.url);
  const query = url.searchParams.get("query") || "";
  const status = url.searchParams.get("status") || "all";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const idsParam = url.searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

  const [{ rows, error }, dbConfig] = await Promise.all([
    getCustomersForExport(shop, query, status, from || null, to || null, 10000, ids),
    prisma.formConfig.findFirst({ where: { shop, isDefault: true }, select: { fields: true } } as never)
      ?? prisma.formConfig.findFirst({ where: { shop }, orderBy: { createdAt: "asc" }, select: { fields: true } }),
  ]);

  if (error) {
    return new Response(error, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Collect all customData keys across rows (Other form fields)
  const customKeysSet = new Set<string>();
  for (const r of rows) {
    if (r.customData && typeof r.customData === "object") {
      for (const k of Object.keys(r.customData)) customKeysSet.add(k);
    }
  }
  const customKeys = Array.from(customKeysSet).sort();

  // Resolve labels for custom columns (same as "Other form fields" on customer detail)
  let customDataLabels: Record<string, string> = {};
  try {
    let config: { fields: FormFieldForLabels[] } = { fields: [] };
    if (dbConfig?.fields && Array.isArray(dbConfig.fields)) {
      config = { fields: dbConfig.fields as unknown as FormFieldForLabels[] };
    }
    if (config.fields.length === 0 && admin) {
      const res = await admin.graphql(
        `#graphql
        query getAppConfig {
          currentAppInstallation {
            metafield(namespace: "custom", key: "registration_form") { value }
          }
        }`
      );
      const data = await res.json();
      const configJson = data?.data?.currentAppInstallation?.metafield?.value;
      if (configJson) {
        const parsed = JSON.parse(configJson) as { fields?: FormFieldForLabels[] };
        if (Array.isArray(parsed.fields)) config.fields = parsed.fields;
      }
    }
    customDataLabels = buildCustomDataLabels(config.fields);
  } catch {
    /* fallback: use key with underscores as spaces */
  }

  const baseHeaders = [
    "ID",
    "Customer ID (Shopify)",
    "First Name",
    "Last Name",
    "Email",
    "Phone",
    "Company",
    "Status",
    "Note",
    "Reviewed At",
    "Reviewed By",
    "Created At",
    "Updated At",
  ];
  const customHeaders = customKeys.map(
    (k) => customDataLabels[k] ?? k.replace(/_/g, " ")
  );
  const headers = [...baseHeaders, ...customHeaders];

  const statusLabel = (s: string) => (s === "approved" ? "Approved" : s === "denied" ? "Rejected" : "Pending");
  const rowToCells = (r: RegistrationExportRow): string[] => {
    const base = [
      escapeCsvCell(r.id),
      escapeCsvCell(r.customerId),
      escapeCsvCell(r.firstName),
      escapeCsvCell(r.lastName),
      escapeCsvCell(r.email),
      escapeCsvCell(r.phone),
      escapeCsvCell(r.company),
      escapeCsvCell(statusLabel(r.status)),
      escapeCsvCell(r.note),
      escapeCsvCell(r.reviewedAt),
      escapeCsvCell(r.reviewedBy),
      escapeCsvCell(r.createdAt),
      escapeCsvCell(r.updatedAt),
    ];
    const customCells = customKeys.map((k) => {
      const val = r.customData && typeof r.customData === "object" ? r.customData[k] : undefined;
      return escapeCsvCell(customDataValueToStr(val));
    });
    return [...base, ...customCells];
  };

  const dataLines = rows.map((r) => rowToCells(r).join(","));
  const headerLine = headers.map(escapeCsvCell).join(",");
  const csv = [headerLine, ...dataLines].join("\r\n");

  const filename = `customers-export-full-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
};
