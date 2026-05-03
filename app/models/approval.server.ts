/**
 * Approvefy Model
 * Handles all GraphQL operations + database persistence for B2B customer approval workflow.
 */

import { createDecipheriv, scryptSync } from "node:crypto";
import { ApiVersion } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { deleteSupabaseFilesFromCustomData } from "../lib/supabase.server";
import { formatNoteForShopify, isFileUploadValue } from "../lib/format-note";
import { buildCustomDataLabels, type FormFieldForLabels } from "../lib/form-config-labels.server";
import { normalizeRegistrationPhone } from "../lib/registration-phone";

/** Must match Admin REST path version; keep aligned with `shopify.server` ApiVersion. */
const ADMIN_REST_API_VERSION = ApiVersion.October25;

/**
 * Customers list used to call Shopify reconcile on every load for auto-approval shops,
 * which overloads the backend + Admin API. Only one reconcile burst per shop per window.
 * Pass `?sync=1` on the customers URL to bypass (see loader).
 */
const AUTO_APPROVAL_LIST_RECONCILE_COOLDOWN_MS = 90_000;
const autoApprovalListReconcileLastAt = new Map<string, number>();

export function shouldRunAutoApprovalListReconcile(
  shop: string,
  opts?: { force?: boolean }
): boolean {
  if (opts?.force) return true;
  const key = (shop || "").trim().toLowerCase();
  if (!key) return false;
  const now = Date.now();
  const last = autoApprovalListReconcileLastAt.get(key);
  if (last != null && now - last < AUTO_APPROVAL_LIST_RECONCILE_COOLDOWN_MS) {
    return false;
  }
  autoApprovalListReconcileLastAt.set(key, now);
  return true;
}
  
/**
 * App proxy registration uses GraphQL `admin` but often omits `session.accessToken`.
 * Admin REST customer endpoints require the shop's stored session token (offline preferred).
 *
 * Cached in-memory for a short window — every storefront registration submit, every customers-list
 * reconcile pass and every auto-approval call hits this. The token only changes on (re)install.
 *
 * Cache size is capped (insertion-order eviction) so multi-shop instances do not leak.
 */
const ACCESS_TOKEN_CACHE_TTL_MS = 60_000;
const ACCESS_TOKEN_CACHE_MAX = 200;
const accessTokenCache = new Map<string, { token: string; at: number }>();

function setBoundedCacheEntry<V>(map: Map<string, V>, key: string, value: V, max: number): void {
  map.set(key, value);
  if (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest != null) map.delete(oldest);
  }
}

export async function getOfflineAccessTokenForShop(shop: string): Promise<string | null> {
    const normalized = (shop || "").trim();
    if (!normalized) return null;
    const cacheKey = normalized.toLowerCase();
    const cached = accessTokenCache.get(cacheKey);
    if (cached && Date.now() - cached.at < ACCESS_TOKEN_CACHE_TTL_MS) {
        return cached.token;
    }
    try {
        let row = await prisma.session.findFirst({
            where: { shop: normalized, isOnline: false },
            select: { accessToken: true },
            orderBy: { expires: "desc" },
        });
        if (!row?.accessToken) {
            row = await prisma.session.findFirst({
                where: { shop: normalized },
                select: { accessToken: true },
                orderBy: { expires: "desc" },
            });
        }
        const token = row?.accessToken?.trim() || "";
        if (token) {
            setBoundedCacheEntry(accessTokenCache, cacheKey, { token, at: Date.now() }, ACCESS_TOKEN_CACHE_MAX);
            return token;
        }
        return null;
    } catch (e) {
        console.warn("getOfflineAccessTokenForShop failed:", e);
        return null;
    }
}

async function getCustomDataLabelsForShop(shop: string | null | undefined): Promise<Record<string, string>> {
  if (!shop) return {};
  try {
    // Single query w/ composite ordering covers "default form, else oldest" without two round-trips.
    const config = (await prisma.formConfig.findFirst({
      where: { shop },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { fields: true },
    } as never)) as { fields?: unknown } | null;
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

/**
 * Whether the Shopify customer currently has at least one configured “approved” tag.
 * Used when DB still says approved but tags may have been removed in Shopify Admin.
 * @returns false if customer exists but has none of the tags; true if at least one matches; null on query error.
 */
export async function shopifyCustomerHasAnyConfiguredApprovalTag(
  admin: AdminGraphQL,
  customerGid: string,
  shop: string
): Promise<boolean | null> {
  const cid = (customerGid || "").trim();
  if (!cid.startsWith("gid://shopify/Customer/")) return false;
  try {
    const approvedTagList = await getApprovedTags(shop);
    const tagsToApply = approvedTagList.length > 0 ? approvedTagList : ["status:approved"];
    const toMatch = tagsToApply.map((t) => t.trim().toLowerCase()).filter(Boolean);

    const res = await admin.graphql(
      `#graphql
      query ($id: ID!) {
        customer(id: $id) {
          id
          tags
        }
      }`,
      { variables: { id: cid } }
    );
    const data = await res.json();
    const cust = data.data?.customer as { id?: string; tags?: string[] | string } | undefined;
    if (!cust?.id) return false;

    const rawTags = cust.tags;
    const shopifyTags: string[] = Array.isArray(rawTags)
      ? rawTags.map((t) => String(t).trim().toLowerCase())
      : typeof rawTags === "string"
        ? rawTags
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
        : [];

    return toMatch.some((t) => shopifyTags.includes(t));
  } catch (e) {
    console.warn("shopifyCustomerHasAnyConfiguredApprovalTag:", e);
    return null;
  }
}

/**
 * Resolve Shopify customer GID for storefront registration (link + tags).
 * Prefers exact email matches; if several share the same email, uses the first.
 * If search returns a single row, uses it when the API did not return separate emails.
 */
export async function findShopifyCustomerGidByEmailIfUnique(
  admin: AdminGraphQL,
  email: string
): Promise<string | null> {
  const q = email.trim();
  if (!q) return null;
  try {
    // Single Admin search query is sufficient for the vast majority of emails.
    // Fall back to the quoted variant only when the plain query yielded nothing
    // and the email contains characters that need escaping (rare).
    const runQuery = async (
      query: string
    ): Promise<Array<{ id: string; email?: string | null }>> => {
      const res = await admin.graphql(
        `#graphql
        query ($query: String!) {
          customers(first: 25, query: $query) {
            edges { node { id email } }
          }
        }`,
        { variables: { query } }
      );
      const data = await res.json();
      const edges: Array<{ node: { id: string; email?: string | null } }> =
        data.data?.customers?.edges ?? [];
      return edges.map((e) => e.node).filter((n) => !!n?.id);
    };

    const lower = q.toLowerCase();
    const pickMatch = (nodes: Array<{ id: string; email?: string | null }>): string | null => {
      if (nodes.length === 0) return null;
      const exact = nodes.filter((n) => (n.email || "").trim().toLowerCase() === lower);
      if (exact.length > 0) return exact[0].id;
      return nodes.length === 1 ? nodes[0].id : null;
    };

    const primary = await runQuery(`email:${q}`);
    const primaryHit = pickMatch(primary);
    if (primaryHit) return primaryHit;

    const needsEscape = primary.length === 0 && /["\\]/.test(q);
    if (needsEscape) {
      const escaped = q.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const secondary = await runQuery(`email:"${escaped}"`);
      return pickMatch(secondary);
    }
    return null;
  } catch {
    return null;
  }
}

/** After registration submit: mark Shopify customer as pending review (same as customers_create webhook). */
export async function addPendingStatusTagToShopifyCustomer(
  admin: AdminGraphQL,
  customerGid: string
): Promise<void> {
  const id = (customerGid || "").trim();
  if (!id.startsWith("gid://shopify/Customer/")) return;
  try {
    const res = await admin.graphql(
      `#graphql
      mutation tagsAdd($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          userErrors { field message }
        }
      }`,
      { variables: { id, tags: ["status:pending"] } }
    );
    const data = await res.json();
    const errs = data.data?.tagsAdd?.userErrors as Array<{ message?: string }> | undefined;
    if (errs?.length) {
      console.warn("tagsAdd status:pending userErrors:", errs);
    }
  } catch (e) {
    console.warn("addPendingStatusTagToShopifyCustomer:", e);
  }
}

/** Remove pending/denied tags, add approval tags, persist registration (existing Shopify customer — no duplicate create). */
async function tagOnlyApproveLinkedRegistration(
  admin: AdminGraphQL,
  customerGid: string,
  registrationId: string,
  tagsToApply: string[]
): Promise<void> {
  await admin.graphql(
    `#graphql
    mutation tagsRemove($id: ID!, $tags: [String!]!) {
      tagsRemove(id: $id, tags: $tags) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        id: customerGid,
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
        id: customerGid,
        tags: tagsToApply,
      },
    }
  );
  await prisma.registration.update({
    where: { id: registrationId },
    data: {
      status: "approved",
      reviewedAt: new Date(),
      passwordHash: null,
      customerId: customerGid,
    },
  });
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

function containsEmailTakenMessage(errors: unknown): boolean {
  try {
    const text = JSON.stringify(errors ?? "").toLowerCase();
    return text.includes("email") && (text.includes("already been taken") || text.includes("already in use"));
  } catch {
    return false;
  }
}

async function syncExistingCustomerAndApproveRegistration(
  admin: AdminGraphQL,
  registrationId: string,
  customerGid: string,
  reg: {
    firstName: string;
    lastName: string;
    phone: string | null;
    note: string | null;
    company: string | null;
    customData: unknown;
    shop: string;
  },
  tagsToApply: string[]
): Promise<void> {
  const customDataObject =
    reg.customData && typeof reg.customData === "object" && !Array.isArray(reg.customData)
      ? (reg.customData as Record<string, unknown>)
      : {};

  const updateResult = await updateShopifyCustomer(admin, reg.shop, customerGid, {
    firstName: reg.firstName,
    lastName: reg.lastName,
    phone: reg.phone,
    note: reg.note,
    company: reg.company,
    customData: customDataObject,
  });
  if (updateResult.error) {
    console.warn(
      "[Approvefy] updateShopifyCustomer during approve (tags/DB will still apply):",
      updateResult.error
    );
  }

  await tagOnlyApproveLinkedRegistration(admin, customerGid, registrationId, tagsToApply);
}

async function findShopifyCustomerGidByEmailViaRest(
  email: string,
  shopDomain?: string,
  accessToken?: string
): Promise<string | null> {
  const q = email.trim();
  if (!q || !shopDomain || !accessToken) return null;
  try {
    const res = await fetch(
      `https://${shopDomain}/admin/api/${ADMIN_REST_API_VERSION}/customers/search.json?query=${encodeURIComponent(`email:${q}`)}&limit=20`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const list: Array<{ id?: number | string; email?: string | null }> = Array.isArray(data?.customers) ? data.customers : [];
    const lower = q.toLowerCase();
    const exact = list.find((c) => c?.email && String(c.email).trim().toLowerCase() === lower);
    const picked = exact ?? (list.length === 1 ? list[0] : null);
    if (!picked?.id) return null;
    return `gid://shopify/Customer/${picked.id}`;
  } catch {
    return null;
  }
}

async function resolveExistingCustomerGidByEmail(
  admin: AdminGraphQL,
  email: string,
  shopDomain?: string,
  accessToken?: string
): Promise<string | null> {
  const byGraphql = await findShopifyCustomerGidByEmailIfUnique(admin, email);
  if (byGraphql) return byGraphql;
  return findShopifyCustomerGidByEmailViaRest(email, shopDomain, accessToken);
}

let cachedApprovalEncryptionKey: Buffer | null = null;
let cachedApprovalEncryptionSecret: string | null = null;

function getEncryptionKey(): Buffer {
  const secret = process.env.SHOPIFY_API_SECRET || "fallback-secret-key";
  if (cachedApprovalEncryptionKey && cachedApprovalEncryptionSecret === secret) {
    return cachedApprovalEncryptionKey;
  }
  cachedApprovalEncryptionSecret = secret;
  cachedApprovalEncryptionKey = scryptSync(secret, "b2b-pwd-salt", 32);
  return cachedApprovalEncryptionKey;
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

export interface CustomerNode {
  /** Prisma registration id (for reconcile / admin actions). */
  registrationId: string;
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

const ANALYTICS_CACHE_TTL_MS = 15_000;
const analyticsCache = new Map<string, { value: AnalyticsResponse; at: number }>();

function invalidateAnalyticsCache(shop: string): void {
  const key = (shop || "").trim().toLowerCase();
  if (key) analyticsCache.delete(key);
}

/** Approval-mode rarely changes; this loader is on every customers-list paint. */
const APPROVAL_MODE_CACHE_TTL_MS = 30_000;
const approvalModeCache = new Map<string, { value: "auto" | "manual"; at: number }>();

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

    // Bounded pagination: take is capped at 10 000 (only "All" view) and `skip = (page-1) * take`
    // — guarantees we never run an unbounded scan against Registration.
    const take = Math.min(Math.max(1, limit), 10000);
    const skip = Math.max(0, (page - 1) * take);

    // Page > 1 (or full page on page 1) needs an exact total for the Pagination control;
    // run findMany + count in the SAME Promise.all so they fan out as one round-trip latency.
    // First page that under-fills `take` skips the count entirely (we already know the exact total).
    const findManyPromise = prisma.registration.findMany({
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
    });

    let dbCustomers: Awaited<typeof findManyPromise>;
    let totalCount: number;
    if (page === 1) {
      dbCustomers = await findManyPromise;
      totalCount =
        dbCustomers.length < take
          ? dbCustomers.length
          : await prisma.registration.count({ where });
    } else {
      const [rows, count] = await Promise.all([
        findManyPromise,
        prisma.registration.count({ where }),
      ]);
      dbCustomers = rows;
      totalCount = count;
    }

    const customers: CustomerNode[] = dbCustomers.map((c) => {
      const raw = (c.status || "pending").toLowerCase();
      const tagStatus =
        raw === "approved" ? "approved" : raw === "denied" ? "denied" : "pending";
      return {
        registrationId: c.id,
        id: c.customerId || `db-${c.id}`,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        company: c.company ?? null,
        phone: c.phone ?? null,
        tags: [`status:${tagStatus}`],
        createdAt: c.createdAt.toISOString(),
      };
    });

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
    const key = (shop || "").trim().toLowerCase();
    if (key) {
      const cached = analyticsCache.get(key);
      if (cached && Date.now() - cached.at < ANALYTICS_CACHE_TTL_MS) {
        return cached.value;
      }
    }

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
      const st = (g.status || "").toLowerCase();
      if (st === "pending") pending += g._count.status;
      else if (st === "denied") denied += g._count.status;
    }

    const result = { total, pending, denied };
    if (key) {
      setBoundedCacheEntry(analyticsCache, key, { value: result, at: Date.now() }, 200);
    }
    return result;
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return { total: 0, pending: 0, denied: 0 };
  }
}

/**
 * If approveCustomer threw after Shopify already has a customer for this email,
 * align DB + tags so the admin list is not stuck "pending" while Shopify shows the customer.
 */
export async function reconcileRegistrationApprovalFromShopify(
  admin: AdminGraphQL,
  shop: string,
  registrationId: string,
  email: string,
  accessToken: string
): Promise<boolean> {
  const em = (email || "").trim();
  if (!em || !registrationId) return false;
  try {
    const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
    if (!reg || reg.shop.trim().toLowerCase() !== shop.trim().toLowerCase()) return false;
    if (reg.status === "approved") return true;
    if (reg.status !== "pending") return false;

    const gid = await resolveExistingCustomerGidByEmail(admin, em, shop, accessToken);
    if (!gid) return false;

    const tags = await getApprovedTags(shop);
    const tagsToApply = tags.length > 0 ? tags : ["status:approved"];
    await syncExistingCustomerAndApproveRegistration(admin, registrationId, gid, reg, tagsToApply);
    return true;
  } catch (e) {
    console.warn("reconcileRegistrationApprovalFromShopify:", e);
    return false;
  }
}

/**
 * When the registration row is still pending but `customerId` is already linked to a Shopify
 * customer that already has the configured approved tag(s) (e.g. B2B), align DB + tags.
 * Covers auto-approval paths where email lookup failed but the storefront customer was tagged.
 */
export async function reconcileLinkedPendingRegistrationFromShopifyTags(
  admin: AdminGraphQL,
  shop: string,
  registrationId: string
): Promise<boolean> {
  try {
    const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
    if (!reg || reg.shop.trim().toLowerCase() !== shop.trim().toLowerCase()) return false;
    if (reg.status === "approved") return true;
    if (reg.status !== "pending") return false;

    const cid = (reg.customerId || "").trim();
    if (!cid.startsWith("gid://shopify/Customer/")) return false;

    const approvedTagList = await getApprovedTags(shop);
    const tagsToApply = approvedTagList.length > 0 ? approvedTagList : ["status:approved"];
    const toMatch = tagsToApply.map((t) => t.trim().toLowerCase()).filter(Boolean);

    const res = await admin.graphql(
      `#graphql
      query ($id: ID!) {
        customer(id: $id) {
          id
          tags
        }
      }`,
      { variables: { id: cid } }
    );
    const data = await res.json();
    const cust = data.data?.customer as { id?: string; tags?: string[] | string } | undefined;
    if (!cust?.id) return false;

    const rawTags = cust.tags;
    const shopifyTags: string[] = Array.isArray(rawTags)
      ? rawTags.map((t) => String(t).trim().toLowerCase())
      : typeof rawTags === "string"
        ? rawTags
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
        : [];

    const hasApproved = toMatch.some((t) => shopifyTags.includes(t));
    if (!hasApproved) return false;

    await syncExistingCustomerAndApproveRegistration(admin, registrationId, cid, reg, tagsToApply);
    return true;
  } catch (e) {
    console.warn("reconcileLinkedPendingRegistrationFromShopifyTags:", e);
    return false;
  }
}

/** Try email-based reconcile, then linked-customer approved-tag reconcile. */
export async function reconcilePendingRegistrationRow(
  admin: AdminGraphQL,
  shop: string,
  registrationId: string,
  email: string,
  accessToken: string
): Promise<boolean> {
  if (await reconcileRegistrationApprovalFromShopify(admin, shop, registrationId, email, accessToken)) {
    return true;
  }
  return reconcileLinkedPendingRegistrationFromShopifyTags(admin, shop, registrationId);
}

/** Reconcile recent pending rows for shops using auto-approval (admin list / any tab). */
export async function reconcilePendingRegistrationsForAutoApprovalShop(
  admin: AdminGraphQL,
  shop: string,
  accessToken: string,
  limit = 40
): Promise<boolean> {
  if (!(accessToken || "").trim()) return false;
  const take = Math.min(Math.max(1, limit), 100);
  const pendingRegs = await prisma.registration.findMany({
    where: { shop, status: "pending" },
    select: { id: true, email: true },
    take,
    orderBy: { createdAt: "desc" },
  });
  if (pendingRegs.length === 0) return false;
  /**
   * Rows are independent — fan all of them out at once (capped by `take`, default 8 from caller).
   * Running them in chunks of 4 doubled the wall-clock for the customers-list reconcile and was
   * the dominant blocker on first paint.
   */
  const results = await Promise.all(
    pendingRegs.map((row) =>
      reconcilePendingRegistrationRow(admin, shop, row.id, row.email, accessToken)
    )
  );
  const repaired = results.some(Boolean);
  // When DB rows changed status, the analytics counters returned to the caller right after
  // would otherwise be served from the 15s cache (stale "pending" count).
  if (repaired) invalidateAnalyticsCache(shop);
  return repaired;
}

/** How customer approval is configured for the shop (used by admin list + storefront config). */
export async function getCustomerApprovalModeForShop(shop: string): Promise<"auto" | "manual"> {
  const cacheKey = (shop || "").trim().toLowerCase();
  if (cacheKey) {
    const cached = approvalModeCache.get(cacheKey);
    if (cached && Date.now() - cached.at < APPROVAL_MODE_CACHE_TTL_MS) {
      return cached.value;
    }
  }
  let mode: "auto" | "manual" = "manual";
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { shop },
      select: { customerApprovalSettings: true },
    });
    const cas = (settings as { customerApprovalSettings?: unknown } | null)?.customerApprovalSettings;
    if (cas && typeof cas === "object" && !Array.isArray(cas)) {
      const raw = String((cas as Record<string, unknown>).approvalMode ?? "")
        .trim()
        .toLowerCase();
      if (raw === "auto") mode = "auto";
    }
  } catch {
    /* ignore */
  }
  if (cacheKey) setBoundedCacheEntry(approvalModeCache, cacheKey, { value: mode, at: Date.now() }, 200);
  return mode;
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

    // Existing Shopify account: apply Customer approval tags only (no duplicate customer). Uses settings `approvedTag` via tagsToApply.
    let linkedCid = (reg.customerId || "").trim();
    if (linkedCid && !linkedCid.startsWith("gid://")) {
      if (/^\d+$/.test(linkedCid)) {
        linkedCid = `gid://shopify/Customer/${linkedCid}`;
      }
    }
    if (linkedCid.startsWith("gid://shopify/Customer/")) {
      const verifyRes = await admin.graphql(
        `#graphql
        query ($id: ID!) {
          customer(id: $id) {
            id
          }
        }`,
        { variables: { id: linkedCid } }
      );
      const verifyData = await verifyRes.json();
      const vc = verifyData.data?.customer as { id?: string } | undefined;
      if (vc?.id) {
        shopifyCustomerId = linkedCid;
        await syncExistingCustomerAndApproveRegistration(admin, registrationId, shopifyCustomerId, reg, tagsToApply);
        console.log(`Approved existing linked customer (tags only): ${shopifyCustomerId}`);
        return {};
      }
    }

    const emailResolvedGid = await resolveExistingCustomerGidByEmail(admin, reg.email, shopDomain, accessToken);
    if (emailResolvedGid) {
      shopifyCustomerId = emailResolvedGid;
      await syncExistingCustomerAndApproveRegistration(admin, registrationId, shopifyCustomerId, reg, tagsToApply);
      console.log(`Approved existing customer by registration email (tags only): ${shopifyCustomerId}`);
      return {};
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
      const postCustomerRest = async (payload: Record<string, unknown>) => {
        const res = await fetch(`https://${shopDomain}/admin/api/${ADMIN_REST_API_VERSION}/customers.json`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({ customer: payload }),
        });
        const data = await res.json();
        return { res, data };
      };

      let { res: restRes, data: restData } = await postCustomerRest(customerPayload);

      if ((!restRes.ok || !restData.customer) && customerPayload.addresses) {
        const retryPayload = { ...customerPayload };
        delete retryPayload.addresses;
        const second = await postCustomerRest(retryPayload);
        restRes = second.res;
        restData = second.data;
        if (restRes.ok && restData.customer) {
          console.warn(
            "[Approvefy] Customer created via REST without initial address payload (retry after address validation failure)."
          );
        }
      }

      if (!restRes.ok || !restData.customer) {
        if (containsEmailTakenMessage(restData?.errors)) {
          const existingByEmail = await resolveExistingCustomerGidByEmail(admin, reg.email, shopDomain, accessToken);
          if (existingByEmail) {
            shopifyCustomerId = existingByEmail;
            await syncExistingCustomerAndApproveRegistration(admin, registrationId, shopifyCustomerId, reg, tagsToApply);
            console.log(`Approved existing customer after REST email conflict: ${shopifyCustomerId}`);
            return {};
          }
        }
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
            customer { id firstName lastName tags }
            userErrors { field message }
          }
        }`,
        { variables: { input } }
      );
      const createData = await createRes.json();
      const createResult = createData.data?.customerCreate;
      if (!createResult?.customer || (createResult.userErrors?.length ?? 0) > 0) {
        if (containsEmailTakenMessage(createResult?.userErrors)) {
          const existingByEmail = await resolveExistingCustomerGidByEmail(admin, reg.email, shopDomain, accessToken);
          if (existingByEmail) {
            shopifyCustomerId = existingByEmail;
            await syncExistingCustomerAndApproveRegistration(admin, registrationId, shopifyCustomerId, reg, tagsToApply);
            console.log(`Approved existing customer after GraphQL email conflict: ${shopifyCustomerId}`);
            return {};
          }
        }
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

    // Update registration and clear stored password (Prisma update — reliable vs raw SQL edge cases)
    await prisma.registration.update({
      where: { id: registrationId },
      data: {
        customerId: shopifyCustomerId,
        status: "approved",
        passwordHash: null,
        reviewedAt: new Date(),
      },
    });
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

// ─── Verify storefront logged-in customer id matches submitted email (Admin API) ───

/** Returns Shopify Customer GID when `customerIdInput` is numeric id or GID and email matches. */
export async function verifyShopifyCustomerOwnsEmail(
  admin: AdminGraphQL,
  customerIdInput: string,
  email: string
): Promise<string | null> {
  const raw = customerIdInput.trim();
  const em = email.trim();
  if (!raw || !em) return null;
  const gid = raw.startsWith("gid://") ? raw : `gid://shopify/Customer/${raw}`;
  try {
    const res = await admin.graphql(
      `#graphql
      query ($id: ID!) {
        customer(id: $id) {
          id
          email
        }
      }`,
      { variables: { id: gid } }
    );
    const data = await res.json();
    const c = data.data?.customer as { id?: string; email?: string } | undefined;
    if (!c?.id || !c.email) return null;
    if (c.email.trim().toLowerCase() !== em.toLowerCase()) return null;
    return c.id;
  } catch {
    return null;
  }
}

// ─── Check if email already exists ───

export async function checkEmailExists(
  shop: string,
  email: string,
  admin: AdminGraphQL,
  options?: { owningCustomerGid?: string | null }
): Promise<boolean> {
  const owning = options?.owningCustomerGid?.trim() || null;

  // App DB only — "already registered" for this flow means a registration row in our DB.
  // Shopify may already have a customer with that email (store account); we still allow a new app registration.
  const dbRecords = await prisma.registration.findMany({
    where: { shop, email: { equals: email, mode: "insensitive" } },
    select: { id: true, status: true, customerId: true },
    orderBy: { updatedAt: "desc" },
  });
  if (dbRecords.length > 0) {
    // Guest/no verified owner: any existing registration is a duplicate.
    if (!owning) {
      return true;
    }
    // Logged-in/verified owner: allow only if all claimed rows belong to same owner.
    for (const r of dbRecords) {
      const cid = r.customerId?.trim() || null;
      if (cid && cid !== owning) return true;
    }
    // Unclaimed rows (customerId null) for this email: guests still conflict with each other above.
    // A verified Shopify owner for this email may claim/update those rows — not a duplicate.
    const hasClaimedRow = dbRecords.some((r) => (r.customerId?.trim() || "").length > 0);
    if (!hasClaimedRow) {
      return false;
    }
  }

  // When we know the Shopify customer submitting, block only if another different customer shares this email (rare).
  if (!owning) {
    return false;
  }
  try {
    const res = await admin.graphql(
      `#graphql
      query checkEmail($query: String!) {
        customers(first: 15, query: $query) {
          edges { node { id } }
        }
      }`,
      { variables: { query: `email:${email}` } }
    );
    const data = await res.json();
    const edges: Array<{ node: { id: string } }> = data.data?.customers?.edges ?? [];
    if (edges.length === 0) return false;
    return edges.some((e) => e.node.id !== owning);
  } catch {
    return false;
  }
}

// ─── Check if phone already exists (DB + Shopify) ───

export async function checkPhoneExists(
  shop: string,
  phone: string,
  admin: AdminGraphQL,
  options?: { owningCustomerGid?: string | null }
): Promise<boolean> {
  const normalized = normalizeRegistrationPhone(phone);
  if (!normalized) return false;
  const owning = options?.owningCustomerGid?.trim() || null;

  // 1. App DB — same applicant may re-submit with their own phone on file
  const dbRecords = await prisma.registration.findMany({
    where: {
      shop,
      phone: { not: null, equals: normalized },
    },
    select: { id: true, status: true, customerId: true },
    orderBy: { updatedAt: "desc" },
  });
  if (dbRecords.length > 0) {
    if (!owning) {
      const claimed = dbRecords.filter((r) => r.customerId?.trim());
      if (claimed.length === 0) return false;
      return true;
    }
    for (const r of dbRecords) {
      const cid = r.customerId?.trim() || null;
      if (cid && cid !== owning) return true;
    }
    return false;
  }

  // 2. Shopify — block if another customer uses this phone
  try {
    const res = await admin.graphql(
      `#graphql
      query checkPhone($query: String!) {
        customers(first: 15, query: $query) {
          edges { node { id } }
        }
      }`,
      { variables: { query: `phone:${normalized}` } }
    );
    const data = await res.json();
    const edges: Array<{ node: { id: string } }> = data.data?.customers?.edges ?? [];
    if (edges.length === 0) return false;
    if (owning) {
      return edges.some((e) => e.node.id !== owning);
    }
    if (edges.length === 1) return false;
    return true;
  } catch {
    return false;
  }
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