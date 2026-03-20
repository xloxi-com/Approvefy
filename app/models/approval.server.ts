/**
 * Approvefy Model
 * Handles all GraphQL operations + database persistence for B2B customer approval workflow.
 */

import { createDecipheriv, scryptSync } from "node:crypto";
import prisma from "../db.server";
import { deleteSupabaseFilesFromCustomData } from "../lib/supabase.server";
import { formatNoteForShopify, isFileUploadValue } from "../lib/format-note";
import { buildCustomDataLabels, type FormFieldForLabels } from "../lib/form-config-labels.server";

async function getCustomDataLabelsForShop(shop: string | null | undefined): Promise<Record<string, string>> {
  if (!shop) return {};
  try {
    const [defaultForm, fallbackForm] = await Promise.all([
      prisma.formConfig.findFirst({ where: { shop, isDefault: true }, select: { fields: true } } as never),
      prisma.formConfig.findFirst({ where: { shop }, orderBy: { createdAt: "asc" }, select: { fields: true } } as never),
    ]);
    const config = defaultForm ?? fallbackForm;
    const fields = config?.fields;
    if (!fields || !Array.isArray(fields)) return {};
    return buildCustomDataLabels(fields as unknown as FormFieldForLabels[]);
  } catch {
    return {};
  }
}

/** Build note text for Shopify customer from customData, excluding address and file-upload style fields. */
async function getNoteForShopifyCustomer(
  reg: {
    note: string | null;
    company: string | null;
    customData: unknown;
    shop?: string;
  },
  shop?: string | null,
  labelMap?: Record<string, string> | null
): Promise<string | undefined> {
  const obj: Record<string, unknown> = {};

  if (reg.company) obj.company = reg.company;

  const cd =
    reg.customData && typeof reg.customData === "object" && !Array.isArray(reg.customData)
      ? (reg.customData as Record<string, unknown>)
      : {};

  const DISALLOWED_KEYS = new Set(["address", "city", "state", "zip", "zipcode", "zipCode", "country"]);

  for (const [rawKey, value] of Object.entries(cd)) {
    if (value == null || value === "") continue;
    const key = String(rawKey);
    const lower = key.toLowerCase();

    if (DISALLOWED_KEYS.has(key) || DISALLOWED_KEYS.has(lower)) continue;
    if (lower.includes("newsletter")) continue;
    if (isFileUploadValue(value)) continue;
    if (lower.includes("file") && lower.includes("upload")) continue;

    obj[key] = value;
  }

  if (Object.keys(obj).length === 0) return undefined;

  const labels = labelMap ?? (await getCustomDataLabelsForShop(shop ?? reg.shop ?? null));
  const labelled: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value == null || value === "") continue;
    const label = labels[key] || key;
    labelled[label] = value;
  }

  return formatNoteForShopify(JSON.stringify(labelled));
}

/** Build default address for Shopify from registration (phone, company, address fields from customData) */
function getDefaultAddressFromRegistration(reg: {
  firstName: string;
  lastName: string;
  phone: string | null;
  company: string | null;
  customData: unknown;
}): { address1?: string; city?: string; province?: string; zip?: string; country?: string; company?: string; phone?: string; first_name: string; last_name: string } | null {
  const cd = reg.customData && typeof reg.customData === "object" && !Array.isArray(reg.customData)
    ? (reg.customData as Record<string, unknown>) : {};
  const address1 = (cd.address as string)?.trim() || "";
  const city = (cd.city as string)?.trim() || "";
  const province = (cd.state as string)?.trim() || "";
  const zip = (cd.zipCode as string)?.trim() || "";
  const country = (cd.country as string)?.trim() || "";
  const company = (reg.company?.trim() || (cd.company as string)?.trim()) || "";
  const phone = reg.phone?.trim() || (cd.phone as string)?.trim() || "";
  const hasAny = address1 || city || province || zip || country || company || phone;
  if (!hasAny) return null;
  return {
    ...(address1 && { address1 }),
    ...(city && { city }),
    ...(province && { province }),
    ...(zip && { zip }),
    ...(country && { country }),
    ...(company && { company }),
    ...(phone && { phone }),
    first_name: reg.firstName,
    last_name: reg.lastName,
  };
}

/** Detect if registration opted into newsletter / marketing emails. */
function hasNewsletterOptIn(customData: unknown): boolean {
  const cd =
    customData && typeof customData === "object" && !Array.isArray(customData)
      ? (customData as Record<string, unknown>)
      : {};

  for (const [rawKey, rawVal] of Object.entries(cd)) {
    const key = String(rawKey).toLowerCase();
    if (!key.includes("newsletter")) continue;

    const checkVal = (val: unknown): boolean => {
      if (val == null) return false;
      if (typeof val === "string") {
        const v = val.trim().toLowerCase();
        return v === "yes" || v === "true" || v === "1";
      }
      if (Array.isArray(val)) {
        return val.some((item) => checkVal(item));
      }
      return false;
    };

    if (checkVal(rawVal)) return true;
  }

  return false;
}

interface AdminGraphQL {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

/** Get the tag to assign when a customer is approved (from AppSettings or default). Returns single string for backward compatibility. */
export async function getApprovedTag(shop: string): Promise<string> {
  const tags = await getApprovedTags(shop);
  return tags.length > 0 ? tags[0] : "status:approved";
}

/** Get all tags to assign when a customer is approved. Supports multiple tags separated by commas (e.g. "wholesale, VIP customer, 2025"). */
export async function getApprovedTags(shop: string): Promise<string[]> {
  try {
    const settings = await prisma.appSettings.findUnique({ where: { shop } });
    const cas = (settings as { customerApprovalSettings?: unknown })?.customerApprovalSettings;
    if (cas && typeof cas === "object" && !Array.isArray(cas)) {
      const tag = (cas as Record<string, unknown>).approvedTag;
      if (typeof tag === "string" && tag.trim()) {
        return tag.split(",").map((t) => t.trim()).filter(Boolean);
      }
    }
  } catch {
    // ignore
  }
  return ["status:approved"];
}

/** Turn Shopify REST/GraphQL customer errors into a short, user-friendly message */
function formatShopifyCustomerError(errors: unknown): string {
  if (errors == null) return "Customer could not be created.";
  if (typeof errors === "string") return errors;
  if (typeof errors !== "object") return String(errors);
  const obj = errors as Record<string, unknown>;
  const phoneMsg = Array.isArray(obj.phone) ? obj.phone[0] : obj.phone;
  if (phoneMsg && String(phoneMsg).toLowerCase().includes("already been taken")) {
    return "This phone number is already in use by another customer. Please use a different number or clear the phone field and try again.";
  }
  const emailMsg = Array.isArray(obj.email) ? obj.email[0] : obj.email;
  if (emailMsg && String(emailMsg).toLowerCase().includes("already been taken")) {
    return "This email is already in use by another customer.";
  }
  const parts: string[] = [];
  for (const [field, value] of Object.entries(obj)) {
    const msg = Array.isArray(value) ? value[0] : value;
    if (msg != null && msg !== "") parts.push(`${field}: ${msg}`);
  }
  return parts.length > 0 ? parts.join(". ") : "Customer could not be created.";
}

function getEncryptionKey(): Buffer {
  const secret = process.env.SHOPIFY_API_SECRET || "fallback-secret-key";
  return scryptSync(secret, "b2b-pwd-salt", 32);
}

function decryptPassword(stored: string): string | null {
  try {
    if (!stored.startsWith("enc:")) return null;
    const parts = stored.split(":");
    const iv = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];
    const decipher = createDecipheriv("aes-256-cbc", getEncryptionKey(), iv);
    let decrypted = decipher.update(encrypted, "hex", "utf-8");
    decrypted += decipher.final("utf-8");
    return decrypted;
  } catch {
    return null;
  }
}

interface CustomerNode {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  phone: string | null;
  tags: string[];
  createdAt: string;
}

interface CustomersResponse {
  customers: CustomerNode[];
  error: string | null;
  isMock: boolean;
  totalCount: number;
}

interface AnalyticsResponse {
  total: number;
  pending: number;
  denied: number;
}

// ─── Get Customers ───

const DEFAULT_PAGE_SIZE = 50;

export async function getCustomers(
  shop: string,
  query: string,
  status: string,
  from?: string | null,
  to?: string | null,
  limit = DEFAULT_PAGE_SIZE,
  page = 1
): Promise<CustomersResponse> {
  try {
    const where: Record<string, unknown> = { shop };

    if (status !== "all") {
      where.status = status;
    }

    const createdAtFilter: Record<string, Date> = {};
    if (from) {
      const fromDate = new Date(from);
      if (!Number.isNaN(fromDate.getTime())) {
        createdAtFilter.gte = fromDate;
      }
    }
    if (to) {
      const toDate = new Date(to);
      if (!Number.isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        createdAtFilter.lte = toDate;
      }
    }
    if (Object.keys(createdAtFilter).length > 0) {
      where.createdAt = createdAtFilter;
    }

    if (query) {
      where.OR = [
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { company: { contains: query, mode: "insensitive" } },
        { phone: { contains: query, mode: "insensitive" } },
      ];
    }

    const take = Math.min(Math.max(1, limit), 10000);
    const skip = Math.max(0, (page - 1) * take);

    const [totalCount, dbCustomers] = await Promise.all([
      prisma.registration.count({ where }),
      prisma.registration.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          customerId: true,
          firstName: true,
          lastName: true,
          email: true,
          company: true,
          phone: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    const customers: CustomerNode[] = dbCustomers.map((c) => ({
      id: c.customerId || `db-${c.id}`,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      company: c.company ?? null,
      phone: c.phone ?? null,
      tags: [`status:${c.status}`],
      createdAt: c.createdAt.toISOString(),
    }));

    return { customers, error: null, isMock: false, totalCount };
  } catch (error) {
    console.error("Error fetching customers:", error);
    return { customers: [], error: "Failed to load customers.", isMock: false, totalCount: 0 };
  }
}

/** Full registration row for CSV export (all details) */
export interface RegistrationExportRow {
  id: string;
  customerId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  company: string | null;
  status: string;
  note: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
  customData: Record<string, unknown> | null;
}

export async function getCustomersForExport(
  shop: string,
  query: string,
  status: string,
  from?: string | null,
  to?: string | null,
  limit = 10000,
  ids?: string[]
): Promise<{ rows: RegistrationExportRow[]; error: string | null }> {
  try {
    const where: Record<string, unknown> = { shop };
    if (ids != null && ids.length > 0) {
      where.OR = ids.map((id) =>
        id.startsWith("db-") ? { id: id.slice(3) } : { customerId: id }
      );
    } else {
      if (status !== "all") where.status = status;
      const createdAtFilter: Record<string, Date> = {};
      if (from) {
        const fromDate = new Date(from);
        if (!Number.isNaN(fromDate.getTime())) createdAtFilter.gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (!Number.isNaN(toDate.getTime())) {
          toDate.setHours(23, 59, 59, 999);
          createdAtFilter.lte = toDate;
        }
      }
      if (Object.keys(createdAtFilter).length > 0) where.createdAt = createdAtFilter;
      if (query) {
        where.OR = [
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { company: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } },
        ];
      }
    }
    const take =
      ids != null && ids.length > 0
        ? Math.min(ids.length, 10000)
        : Math.min(Math.max(1, limit), 10000);
    const list = await prisma.registration.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        customerId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        company: true,
        status: true,
        note: true,
        reviewedAt: true,
        reviewedBy: true,
        createdAt: true,
        updatedAt: true,
        customData: true,
      },
    });
    const rows: RegistrationExportRow[] = list.map((c) => {
      let customData: Record<string, unknown> | null = null;
      if (c.customData != null) {
        if (typeof c.customData === "object" && !Array.isArray(c.customData)) {
          customData = c.customData as Record<string, unknown>;
        } else if (typeof c.customData === "string") {
          try {
            const parsed = JSON.parse(c.customData) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              customData = parsed as Record<string, unknown>;
            }
          } catch {
            /* ignore */
          }
        }
      }
      return {
        id: c.id,
        customerId: c.customerId,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone ?? null,
        company: c.company ?? null,
        status: c.status,
        note: c.note ?? null,
        reviewedAt: c.reviewedAt ? c.reviewedAt.toISOString() : null,
        reviewedBy: c.reviewedBy ?? null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        customData,
      };
    });
    return { rows, error: null };
  } catch (error) {
    console.error("Error fetching customers for export:", error);
    return { rows: [], error: "Failed to load customers for export." };
  }
}

// ─── Get Analytics ───

export async function getAnalytics(shop: string): Promise<AnalyticsResponse> {
  try {
    const groups = await prisma.registration.groupBy({
      by: ["status"],
      where: { shop },
      _count: { status: true },
    });

    let total = 0;
    let pending = 0;
    let denied = 0;

    for (const g of groups) {
      total += g._count.status;
      if (g.status === "pending") pending = g._count.status;
      else if (g.status === "denied") denied = g._count.status;
    }

    return { total, pending, denied };
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return { total: 0, pending: 0, denied: 0 };
  }
}

// ─── Approve Customer ───
// If id is "db-<registrationId>", create customer in Shopify first, then tag and update DB.
// Otherwise treat as existing Shopify customer GID and only update tags + DB.
// Pass opts.approvedTags and opts.customDataLabels when batching to avoid repeated DB/API calls.

export interface ApproveCustomerOpts {
  approvedTags?: string[];
  customDataLabels?: Record<string, string>;
}

export async function approveCustomer(
  admin: AdminGraphQL,
  id: string,
  shopDomain?: string,
  accessToken?: string,
  opts?: ApproveCustomerOpts
): Promise<{ activationUrl?: string | null }> {
  const tags = opts?.approvedTags ?? (await getApprovedTags(shopDomain || ""));
  const tagsToApply = tags.length > 0 ? tags : ["status:approved"];
  const labelMap = opts?.customDataLabels ?? null;
  let shopifyCustomerId: string;

  if (id.startsWith("db-")) {
    const registrationId = id.slice(3);
    const reg = await prisma.registration.findUnique({
      where: { id: registrationId },
    });
    if (!reg) {
      throw new Error("Registration not found. This customer may have been removed.");
    }
    if (reg.status !== "pending") {
      throw new Error(
        "Rejected or already approved customers cannot be approved again. They would need to register again to be approved."
      );
    }

    // Decrypt the stored password so we can set it on the Shopify customer
    const storedPwd = (reg as Record<string, unknown>).passwordHash as string | null;
    const plainPassword = storedPwd ? decryptPassword(storedPwd) : null;

    let activationUrl: string | null = null;

    const wantsNewsletter = hasNewsletterOptIn(reg.customData);

    if (plainPassword && shopDomain && accessToken) {
      const defaultAddress = getDefaultAddressFromRegistration(reg);
      const customerPayload: Record<string, unknown> = {
        first_name: reg.firstName,
        last_name: reg.lastName,
        email: reg.email,
        phone: reg.phone || undefined,
        note: (await getNoteForShopifyCustomer(reg, shopDomain || reg.shop, labelMap)) || undefined,
        tags: tagsToApply.join(", "),
        password: plainPassword,
        password_confirmation: plainPassword,
        verified_email: true,
        send_email_welcome: false,
      };
      if (wantsNewsletter) {
        // Let Shopify set consent_updated_at to avoid clock-skew errors
        customerPayload.email_marketing_consent = {
          state: "subscribed",
          opt_in_level: "single_opt_in",
        };
      }
      if (defaultAddress) {
        customerPayload.addresses = [{
          first_name: defaultAddress.first_name,
          last_name: defaultAddress.last_name,
          ...(defaultAddress.address1 && { address1: defaultAddress.address1 }),
          ...(defaultAddress.city && { city: defaultAddress.city }),
          ...(defaultAddress.province && { province: defaultAddress.province }),
          ...(defaultAddress.zip && { zip: defaultAddress.zip }),
          ...(defaultAddress.country && { country: defaultAddress.country }),
          ...(defaultAddress.company && { company: defaultAddress.company }),
          ...(defaultAddress.phone && { phone: defaultAddress.phone }),
          default: true,
        }];
      }
      const restRes = await fetch(
        `https://${shopDomain}/admin/api/2026-04/customers.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({ customer: customerPayload }),
        }
      );
      const restData = await restRes.json();

      if (!restRes.ok || !restData.customer) {
        const errMsg = restData.errors
          ? formatShopifyCustomerError(restData.errors)
          : "Could not create customer in Shopify. Please try again.";
        throw new Error(errMsg);
      }
      shopifyCustomerId = `gid://shopify/Customer/${restData.customer.id}`;
      console.log(`Customer created via REST with password: ${shopifyCustomerId}`);
    } else {
      // Fallback: create via GraphQL (no password), generate activation URL
      const noteForShopify =
        (await getNoteForShopifyCustomer(reg, shopDomain || reg.shop, labelMap)) || undefined;
      const input: Record<string, unknown> = {
        email: reg.email,
        firstName: reg.firstName,
        lastName: reg.lastName,
        phone: reg.phone || undefined,
        note: noteForShopify,
        tags: tagsToApply,
      };
      if (wantsNewsletter) {
        input.emailMarketingConsent = {
          marketingState: "SUBSCRIBED",
          marketingOptInLevel: "SINGLE_OPT_IN",
        };
      }

      const createRes = await admin.graphql(
        `#graphql
        mutation customerCreate($input: CustomerInput!) {
          customerCreate(input: $input) {
            customer { id email firstName lastName tags }
            userErrors { field message }
          }
        }`,
        { variables: { input } }
      );
      const createData = await createRes.json();
      const createResult = createData.data?.customerCreate;
      if (!createResult?.customer || (createResult.userErrors?.length ?? 0) > 0) {
        const raw = createResult?.userErrors?.map((e: { field?: string[]; message: string }) => e.message).join(", ") ?? "";
        const friendly = raw.toLowerCase().includes("already been taken")
          ? (raw.toLowerCase().includes("phone")
            ? "This phone number is already in use by another customer. Please use a different number or clear the phone field and try again."
            : raw.toLowerCase().includes("email")
              ? "This email is already in use by another customer."
              : raw)
          : raw;
        throw new Error(friendly || "Could not create customer in Shopify. Please try again.");
      }
      shopifyCustomerId = createResult.customer.id;

      // Save phone, company, address as default address in Shopify
      const defaultAddress = getDefaultAddressFromRegistration(reg);
      if (defaultAddress) {
        try {
          const countryStr = defaultAddress.country?.trim() || "";
          const countryCode = countryStr.length === 2 ? countryStr.toUpperCase() : null;
          const addressInput: Record<string, string> = {
            firstName: defaultAddress.first_name,
            lastName: defaultAddress.last_name,
            ...(defaultAddress.address1 && { address1: defaultAddress.address1 }),
            ...(defaultAddress.city && { city: defaultAddress.city }),
            ...(defaultAddress.province && { provinceCode: defaultAddress.province }),
            ...(defaultAddress.zip && { zip: defaultAddress.zip }),
            ...(countryCode && { countryCode }),
            ...(defaultAddress.company && { company: defaultAddress.company }),
            ...(defaultAddress.phone && { phone: defaultAddress.phone }),
          };
          const addrRes = await admin.graphql(
            `#graphql
            mutation customerAddressCreate($customerId: ID!, $address: MailingAddressInput!, $setAsDefault: Boolean) {
              customerAddressCreate(customerId: $customerId, address: $address, setAsDefault: $setAsDefault) {
                userErrors { field message }
              }
            }`,
            {
              variables: {
                customerId: shopifyCustomerId,
                address: addressInput,
                setAsDefault: true,
              },
            }
          );
          const addrData = await addrRes.json();
          const errors = addrData.data?.customerAddressCreate?.userErrors;
          if (errors?.length) {
            console.warn("customerAddressCreate userErrors:", errors);
          }
        } catch (e) {
          console.warn("Could not set default address for customer:", e);
        }
      }

      // Generate activation URL so customer can set their password
      try {
        const activationRes = await admin.graphql(
          `#graphql
          mutation generateActivation($customerId: ID!) {
            customerGenerateAccountActivationUrl(customerId: $customerId) {
              accountActivationUrl
              userErrors { field message }
            }
          }`,
          { variables: { customerId: shopifyCustomerId } }
        );
        const activationData = await activationRes.json();
        activationUrl = activationData.data?.customerGenerateAccountActivationUrl?.accountActivationUrl || null;
      } catch (e) {
        console.error("Could not generate activation URL:", e);
      }
    }

    // Update registration and clear stored password
    await prisma.$executeRawUnsafe(
      `UPDATE "Registration" SET "customerId" = $1, "status" = 'approved', "passwordHash" = NULL, "reviewedAt" = $2 WHERE "id" = $3`,
      shopifyCustomerId,
      new Date(),
      registrationId
    );
    console.log(`Customer created in Shopify on approve: ${shopifyCustomerId}`);
    return { activationUrl };
  }

  // Existing Shopify customer — update tags and DB
  shopifyCustomerId = id;

  await admin.graphql(
    `#graphql
    mutation tagsRemove($id: ID!, $tags: [String!]!) {
      tagsRemove(id: $id, tags: $tags) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        id: shopifyCustomerId,
        tags: ["status:pending", "status:denied"],
      },
    }
  );

  await admin.graphql(
    `#graphql
    mutation tagsAdd($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        id: shopifyCustomerId,
        tags: tagsToApply,
      },
    }
  );

  try {
    await prisma.registration.updateMany({
      where: { customerId: shopifyCustomerId },
      data: {
        status: "approved",
        reviewedAt: new Date(),
      },
    });
  } catch (dbError) {
    console.warn("Could not update registration record in DB:", dbError);
  }

  console.log(`Customer ${shopifyCustomerId} approved successfully`);
  return {};
}

// ─── Deny Customer ───
// If id is "db-<registrationId>", only update DB (no Shopify customer exists).

export async function denyCustomer(
  admin: AdminGraphQL,
  id: string
): Promise<void> {
  if (id.startsWith("db-")) {
    const registrationId = id.slice(3);
    try {
      await prisma.registration.update({
        where: { id: registrationId },
        data: { status: "denied", reviewedAt: new Date() },
      });
      console.log(`Registration ${registrationId} denied (DB only)`);
    } catch (dbError) {
      console.warn("Could not update registration in DB:", dbError);
      throw new Error(`Registration not found: ${registrationId}`);
    }
    return;
  }

  // Existing Shopify customer — update tags and DB
  const customerId = id;
  await admin.graphql(
    `#graphql
    mutation tagsRemove($id: ID!, $tags: [String!]!) {
      tagsRemove(id: $id, tags: $tags) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        id: customerId,
        tags: ["status:pending", "status:approved"],
      },
    }
  );

  await admin.graphql(
    `#graphql
    mutation tagsAdd($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        id: customerId,
        tags: ["status:denied"],
      },
    }
  );

  try {
    await prisma.registration.updateMany({
      where: { customerId },
      data: {
        status: "denied",
        reviewedAt: new Date(),
      },
    });
  } catch (dbError) {
    console.warn("Could not update registration record in DB:", dbError);
  }

  console.log(`Customer ${customerId} denied successfully`);
}

// ─── Save Registration to Database ───

export async function saveRegistration(
  shop: string,
  data: {
    customerId?: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    company?: string;
    passwordHash?: string;
    customData?: Record<string, string>;
    note?: string;
  }
) {
  try {
    const createData: Record<string, unknown> = {
      shop,
      customerId: data.customerId,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone || null,
      company: data.company || null,
      passwordHash: data.passwordHash || null,
      customData: data.customData ?? undefined,
      note: data.note || null,
      status: "pending",
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registration = await (prisma.registration.create as any)({
      data: createData,
    });
    console.log(`Registration saved to DB: ${registration.id}`);
    return registration;
  } catch (error) {
    console.error("Error saving registration to DB:", error);
    return null;
  }
}

// ─── Check if email already exists ───

export async function checkEmailExists(
  shop: string,
  email: string,
  admin: AdminGraphQL
): Promise<boolean> {
  // 1. Check app DB
  const dbRecord = await prisma.registration.findFirst({
    where: { shop, email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (dbRecord) return true;

  // 2. Check Shopify
  try {
    const res = await admin.graphql(
      `#graphql
      query checkEmail($query: String!) {
        customers(first: 1, query: $query) {
          edges { node { id } }
        }
      }`,
      { variables: { query: `email:${email}` } }
    );
    const data = await res.json();
    if ((data.data?.customers?.edges?.length ?? 0) > 0) return true;
  } catch {
    /* if Shopify check fails, allow registration to proceed */
  }

  return false;
}

// ─── Check if phone already exists (DB + Shopify) ───

export async function checkPhoneExists(
  shop: string,
  phone: string,
  admin: AdminGraphQL
): Promise<boolean> {
  const normalized = phone.trim();
  if (!normalized) return false;

  // 1. Check app DB (pending + approved registrations)
  const dbRecord = await prisma.registration.findFirst({
    where: {
      shop,
      phone: { not: null, equals: normalized },
    },
    select: { id: true },
  });
  if (dbRecord) return true;

  // 2. Check Shopify (customers by phone)
  try {
    const res = await admin.graphql(
      `#graphql
      query checkPhone($query: String!) {
        customers(first: 1, query: $query) {
          edges { node { id } }
        }
      }`,
      { variables: { query: `phone:${normalized}` } }
    );
    const data = await res.json();
    if ((data.data?.customers?.edges?.length ?? 0) > 0) return true;
  } catch {
    /* if Shopify check fails, allow registration to proceed */
  }

  return false;
}

// ─── Get registration details (for customer detail/edit page) ───

export async function getRegistrationDetails(
  id: string,
  shop: string
): Promise<{
  customerId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  company: string | null;
  status: string;
  note: string | null;
  customData: Record<string, unknown> | null;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
} | null> {
  const isDbOnly = id.startsWith("db-");
  const registrationId = isDbOnly ? id.slice(3) : null;

  const where = isDbOnly
    ? { id: registrationId!, shop }
    : { customerId: id, shop };

  const reg = await prisma.registration.findFirst({
    where,
    select: {
      customerId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      company: true,
      status: true,
      note: true,
      customData: true,
      createdAt: true,
      reviewedAt: true,
      reviewedBy: true,
    },
  });

  if (!reg) return null;
  return {
    customerId: reg.customerId,
    firstName: reg.firstName,
    lastName: reg.lastName,
    email: reg.email,
    phone: reg.phone,
    company: reg.company,
    status: reg.status,
    note: reg.note,
    customData: reg.customData as Record<string, unknown> | null,
    createdAt: reg.createdAt,
    reviewedAt: reg.reviewedAt,
    reviewedBy: reg.reviewedBy,
  };
}

// Lightweight version without customData (for faster initial page load)
export async function getRegistrationDetailsLite(
  id: string,
  shop: string
): Promise<{
  customerId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  company: string | null;
  status: string;
  note: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
} | null> {
  const isDbOnly = id.startsWith("db-");
  const registrationId = isDbOnly ? id.slice(3) : null;

  const where = isDbOnly
    ? { id: registrationId!, shop }
    : { customerId: id, shop };

  const reg = await prisma.registration.findFirst({
    where,
    select: {
      customerId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      company: true,
      status: true,
      note: true,
      createdAt: true,
      reviewedAt: true,
      reviewedBy: true,
    },
  });

  if (!reg) return null;
  return {
    customerId: reg.customerId,
    firstName: reg.firstName,
    lastName: reg.lastName,
    email: reg.email,
    phone: reg.phone,
    company: reg.company,
    status: reg.status,
    note: reg.note,
    createdAt: reg.createdAt,
    reviewedAt: reg.reviewedAt,
    reviewedBy: reg.reviewedBy,
  };
}

// ─── Update registration details (editable customer info) ───

export async function updateRegistrationDetails(
  id: string,
  shop: string,
  data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string | null;
    company?: string | null;
    note?: string | null;
    status?: string;
    customData?: Record<string, unknown>;
  }
): Promise<{ error?: string }> {
  const isDbOnly = id.startsWith("db-");
  const where = isDbOnly ? { id: id.slice(3), shop } : { customerId: id, shop };

  const current = await prisma.registration.findFirst({
    where,
    select: { status: true },
  });
  const isApproved = current?.status === "approved";

  const updatePayload: Record<string, unknown> = {};
  if (data.firstName !== undefined) updatePayload.firstName = data.firstName.trim();
  if (data.lastName !== undefined) updatePayload.lastName = data.lastName.trim();
  if (data.email !== undefined && !isApproved) updatePayload.email = data.email.trim();
  if (data.phone !== undefined) updatePayload.phone = data.phone?.trim() || null;
  if (data.company !== undefined) updatePayload.company = data.company?.trim() || null;
  if (data.note !== undefined) updatePayload.note = data.note?.trim() || null;
  if (data.status !== undefined && ["pending", "approved", "denied"].includes(data.status)) {
    updatePayload.status = data.status;
  }
  if (data.customData !== undefined) updatePayload.customData = data.customData;

  if (Object.keys(updatePayload).length === 0) return {};

  try {
    await prisma.registration.updateMany({
      where,
      data: updatePayload,
    });
    return {};
  } catch (e) {
    console.error("updateRegistrationDetails failed:", e);
    return { error: "Failed to save changes" };
  }
}

/** Build MailingAddressInput for GraphQL from registration-style data (used when syncing address to Shopify). */
function buildAddressInputFromData(data: {
  firstName: string;
  lastName: string;
  phone?: string | null;
  company?: string | null;
  customData?: Record<string, unknown>;
}): Record<string, string> | null {
  const defaultAddress = getDefaultAddressFromRegistration({
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone ?? null,
    company: data.company ?? null,
    customData: data.customData ?? {},
  });
  if (!defaultAddress) return null;
  const countryStr = defaultAddress.country?.trim() || "";
  const countryCode = countryStr.length === 2 ? countryStr.toUpperCase() : null;
  const addressInput: Record<string, string> = {
    firstName: defaultAddress.first_name,
    lastName: defaultAddress.last_name,
    ...(defaultAddress.address1 && { address1: defaultAddress.address1 }),
    ...(defaultAddress.city && { city: defaultAddress.city }),
    ...(defaultAddress.province && { provinceCode: defaultAddress.province }),
    ...(defaultAddress.zip && { zip: defaultAddress.zip }),
    ...(countryCode && { countryCode }),
    ...(defaultAddress.company && { company: defaultAddress.company }),
    ...(defaultAddress.phone && { phone: defaultAddress.phone }),
  };
  return Object.keys(addressInput).length > 2 ? addressInput : null;
}

/** Update the Shopify customer record to match registration data (e.g. after editing in app). Includes note and default address. */
export async function updateShopifyCustomer(
  admin: AdminGraphQL,
  shop: string,
  customerId: string,
  data: {
    firstName: string;
    lastName: string;
    phone?: string | null;
    note?: string | null;
    company?: string | null;
    customData?: Record<string, unknown>;
  }
): Promise<{ error?: string }> {
  const noteForShopify = await getNoteForShopifyCustomer(
    {
      note: data.note ?? null,
      company: data.company ?? null,
      customData: data.customData ?? {},
      shop,
    },
    shop
  );
  try {
    const res = await admin.graphql(
      `#graphql
      mutation customerUpdate($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer { id }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: {
            id: customerId,
            firstName: data.firstName,
            lastName: data.lastName,
            ...(data.phone != null && data.phone !== "" && { phone: data.phone }),
            ...(noteForShopify != null && noteForShopify !== "" && { note: noteForShopify }),
          },
        },
      }
    );
    const json = await res.json();
    const payload = json?.data?.customerUpdate;
    if (payload?.userErrors?.length) {
      const msg = payload.userErrors.map((e: { message: string }) => e.message).join(". ");
      return { error: formatShopifyCustomerError(msg) };
    }
    if (!payload?.customer) return { error: "Failed to update Shopify customer." };

    // Sync default address to Shopify (from customData: address, city, state, zipCode, country, etc.)
    const addressInput = buildAddressInputFromData(data);
    if (addressInput) {
      const custRes = await admin.graphql(
        `#graphql
        query getCustomerDefaultAddress($id: ID!) {
          customer(id: $id) {
            defaultAddress { id }
          }
        }`,
        { variables: { id: customerId } }
      );
      const custJson = await custRes.json();
      const defaultAddressId = custJson?.data?.customer?.defaultAddress?.id ?? null;

      if (defaultAddressId) {
        const addrUpdateRes = await admin.graphql(
          `#graphql
          mutation customerAddressUpdate($customerId: ID!, $addressId: ID!, $address: MailingAddressInput!, $setAsDefault: Boolean) {
            customerAddressUpdate(customerId: $customerId, addressId: $addressId, address: $address, setAsDefault: $setAsDefault) {
              userErrors { field message }
            }
          }`,
          {
            variables: {
              customerId,
              addressId: defaultAddressId,
              address: addressInput,
              setAsDefault: true,
            },
          }
        );
        const addrUpdateJson = await addrUpdateRes.json();
        const addrErrors = addrUpdateJson?.data?.customerAddressUpdate?.userErrors;
        if (addrErrors?.length) {
          const msg = addrErrors.map((e: { message: string }) => e.message).join(". ");
          return { error: formatShopifyCustomerError(msg) };
        }
      } else {
        const addrCreateRes = await admin.graphql(
          `#graphql
          mutation customerAddressCreate($customerId: ID!, $address: MailingAddressInput!, $setAsDefault: Boolean) {
            customerAddressCreate(customerId: $customerId, address: $address, setAsDefault: $setAsDefault) {
              userErrors { field message }
            }
          }`,
          {
            variables: {
              customerId,
              address: addressInput,
              setAsDefault: true,
            },
          }
        );
        const addrCreateJson = await addrCreateRes.json();
        const createErrors = addrCreateJson?.data?.customerAddressCreate?.userErrors;
        if (createErrors?.length) {
          const msg = createErrors.map((e: { message: string }) => e.message).join(". ");
          return { error: formatShopifyCustomerError(msg) };
        }
      }
    }
    return {};
  } catch (e) {
    console.error("updateShopifyCustomer failed:", e);
    return { error: "Failed to update Shopify customer." };
  }
}

// ─── Get registration email (for db-* ids) ───

export async function getRegistrationEmail(dbId: string): Promise<string | null> {
  if (!dbId.startsWith("db-")) return null;
  const registrationId = dbId.slice(3);
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: { email: true },
  });
  return reg?.email ?? null;
}

/** Get customer email for rejection notification (from Registration or Shopify). */
export async function getCustomerEmailForRejection(
  admin: AdminGraphQL,
  shop: string,
  customerId: string
): Promise<string | null> {
  if (customerId.startsWith("db-")) {
    return getRegistrationEmail(customerId);
  }
  const reg = await prisma.registration.findFirst({
    where: { shop, customerId },
    select: { email: true },
    orderBy: { createdAt: "desc" },
  });
  if (reg?.email) return reg.email;
  try {
    const res = await admin.graphql(
      `#graphql
      query getCustomer($id: ID!) {
        customer(id: $id) { email }
      }`,
      { variables: { id: customerId } }
    );
    const data = await res.json();
    const email = data?.data?.customer?.email;
    return typeof email === "string" && email.trim() ? email : null;
  } catch {
    return null;
  }
}

/** Get customer first name for approval/rejection emails. */
export async function getCustomerFirstNameForEmail(
  admin: AdminGraphQL,
  shop: string,
  customerId: string
): Promise<string | null> {
  if (customerId.startsWith("db-")) {
    const registrationId = customerId.slice(3);
    const reg = await prisma.registration.findUnique({
      where: { id: registrationId },
      select: { firstName: true },
    });
    const name = reg?.firstName;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  }

  const reg = await prisma.registration.findFirst({
    where: { shop, customerId },
    select: { firstName: true },
    orderBy: { createdAt: "desc" },
  });
  if (reg?.firstName && reg.firstName.trim()) {
    return reg.firstName.trim();
  }

  try {
    const res = await admin.graphql(
      `#graphql
      query getCustomerFirstName($id: ID!) {
        customer(id: $id) { firstName }
      }`,
      { variables: { id: customerId } }
    );
    const data = await res.json();
    const firstName = data?.data?.customer?.firstName;
    return typeof firstName === "string" && firstName.trim() ? firstName.trim() : null;
  } catch {
    return null;
  }
}

// ─── Delete Customer ───
// deleteMode: "shopify" = Shopify only, "app" = app DB only, "both" = both

export async function deleteCustomer(
  admin: AdminGraphQL,
  id: string,
  deleteMode: "shopify" | "app" | "both" = "both"
): Promise<void> {
  const isDbOnly = id.startsWith("db-");
  const registrationId = isDbOnly ? id.slice(3) : null;

  // Delete from Shopify
  if ((deleteMode === "shopify" || deleteMode === "both") && !isDbOnly) {
    await admin.graphql(
      `#graphql
      mutation customerDelete($id: ID!) {
        customerDelete(input: { id: $id }) {
          deletedCustomerId
          userErrors { field message }
        }
      }`,
      { variables: { id } }
    );
    console.log(`Customer ${id} deleted from Shopify`);
  }

  // Delete from app DB (and Supabase b2b-uploads files for those registrations)
  if (deleteMode === "app" || deleteMode === "both") {
    try {
      if (isDbOnly && registrationId) {
        const reg = await prisma.registration.findUnique({
          where: { id: registrationId },
          select: { customData: true },
        });
        if (reg?.customData && typeof reg.customData === "object" && !Array.isArray(reg.customData)) {
          await deleteSupabaseFilesFromCustomData(reg.customData as Record<string, unknown>);
        }
        await prisma.registration.delete({ where: { id: registrationId } });
      } else {
        const regs = await prisma.registration.findMany({
          where: { customerId: id },
          select: { customData: true },
        });
        for (const reg of regs) {
          if (reg.customData && typeof reg.customData === "object" && !Array.isArray(reg.customData)) {
            await deleteSupabaseFilesFromCustomData(reg.customData as Record<string, unknown>);
          }
        }
        await prisma.registration.deleteMany({ where: { customerId: id } });
      }
      console.log(`Customer ${id} deleted from app DB`);
    } catch {
      /* registration may not exist in DB */
    }
  }
}