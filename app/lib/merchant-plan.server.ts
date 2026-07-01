import prisma from "../db.server";
import type { PricingTierId } from "./pricing-tiers";
import { CACHE_TTL, getCache, invalidateCache, setCache, shopKey } from "./cache.server";

export type MerchantPlanId = PricingTierId;

export const PLAN_RANK: Record<MerchantPlanId, number> = {
  basic: 0,
  standard: 1,
  premium: 2,
};

export function normalizeMerchantPlan(raw: string | null | undefined): MerchantPlanId {
  const v = (raw ?? "").toLowerCase().trim();
  if (v === "basic" || v === "standard" || v === "premium") return v;
  return "standard";
}

/** Env override + DB value — no extra query when the row is already loaded. */
export function resolveMerchantPlan(raw: string | null | undefined): MerchantPlanId {
  const o = process.env.MERCHANT_PLAN_OVERRIDE?.trim().toLowerCase();
  if (o === "basic" || o === "standard" || o === "premium") return o;
  return normalizeMerchantPlan(raw);
}

/** Override entire DB plan for local QA — optional env MERCHANT_PLAN_OVERRIDE=basic|standard|premium */
export async function getMerchantPlanForShop(shop: string): Promise<MerchantPlanId> {
  const override = process.env.MERCHANT_PLAN_OVERRIDE?.trim().toLowerCase();
  if (override === "basic" || override === "standard" || override === "premium") return override;

  const key = (shop || "").trim().toLowerCase();
  if (!key) return "standard";

  const cacheKey = shopKey(key, "merchantPlan");
  const cached = getCache<MerchantPlanId>(cacheKey);
  if (cached) return cached;

  try {
    const row = await prisma.appSettings.findUnique({
      where: { shop: key },
      select: { merchantPlan: true },
    });
    const plan = resolveMerchantPlan(row?.merchantPlan ?? undefined);
    setCache(cacheKey, plan, CACHE_TTL.merchantPlan);
    return plan;
  } catch {
    return "standard";
  }
}

export function invalidateMerchantPlanCache(shop: string): void {
  const key = (shop || "").trim().toLowerCase();
  if (key) invalidateCache(shopKey(key, "merchantPlan"));
}

export function allowMerchantPlanDevSelector(): boolean {
  const v = process.env.ALLOW_MERCHANT_PLAN_DEV_SELECTOR?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function planIsAtLeast(plan: MerchantPlanId, required: MerchantPlanId): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[required];
}

/** Field types allowed on Basic (everything else is gated behind Standard+). */
const BASIC_ALLOWED_FIELD_TYPES = new Set([
  "first_name",
  "last_name",
  "email",
  "password",
  "phone",
  "company",
  "address",
  "city",
  "state",
  "zip_code",
  "country",
  "text",
  "textarea",
  "heading",
]);

/** Used by the form builder UI to hide disallowed field types in the picker and row type dropdown. */
export function isCustomFieldTypeAllowedForPlan(fieldType: string, plan: MerchantPlanId): boolean {
  const t = normalizeFieldTypeLoose(fieldType);
  if (t === "file_upload") return plan === "premium";
  if (plan === "basic") return BASIC_ALLOWED_FIELD_TYPES.has(t);
  return true;
}

function normalizeFieldTypeLoose(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/** Normalize persisted JSON fields for the merchant's tier (server-side enforcement). */
export function sanitizeFormFieldsJsonForPlan(fields: unknown[], plan: MerchantPlanId): unknown[] {
  if (!Array.isArray(fields)) return [];
  return fields.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const f = raw as Record<string, unknown>;
    const t = normalizeFieldTypeLoose(f.type);

    if (t === "file_upload") {
      if (plan !== "premium") {
        const next: Record<string, unknown> = { ...f, type: "text", required: false };
        delete next.maxFileCount;
        delete next.maxFileSizeMb;
        return next;
      }
      return raw;
    }

    if (plan === "basic" && !BASIC_ALLOWED_FIELD_TYPES.has(t)) {
      const next: Record<string, unknown> = { ...f, type: "text", required: false };
      delete next.options;
      delete next.dateFormat;
      delete next.minRequired;
      delete next.maxFileCount;
      delete next.maxFileSizeMb;
      return next;
    }
    return raw;
  });
}

export function sanitizeFormTypeForPlan(formType: string, plan: MerchantPlanId): "wholesale" | "multi_step" {
  const ft = formType === "multi_step" ? "multi_step" : "wholesale";
  if (ft === "multi_step" && !planIsAtLeast(plan, "standard")) return "wholesale";
  return ft;
}

type ApprovalLike = Record<string, unknown>;

/** On Basic, storefront-facing messaging stays editable; email branding/templates/SMTP stay at last saved values. */
export function mergeIncomingApprovalSettingsForBasicSave<T extends ApprovalLike>(incoming: T, previousFull: T | null): T {
  const p = previousFull ?? incoming;
  return {
    ...incoming,
    approvalMode: "auto",
    approvedTag: "status:approved",
    showAuthTabsOnRegistration: true,
    emailOnReject: p.emailOnReject,
    rejectionEmailPresetId: p.rejectionEmailPresetId,
    rejectEmailSubject: p.rejectEmailSubject,
    rejectEmailBody: p.rejectEmailBody,
    rejectEmailLogoUrl: p.rejectEmailLogoUrl,
    rejectEmailLogoSize: p.rejectEmailLogoSize,
    rejectEmailHeaderTitle: p.rejectEmailHeaderTitle,
    rejectEmailHeaderTitleSize: p.rejectEmailHeaderTitleSize,
    rejectEmailHeaderTitleColor: p.rejectEmailHeaderTitleColor,
    rejectEmailHeaderBgColor: p.rejectEmailHeaderBgColor,
    rejectEmailLogoAlign: p.rejectEmailLogoAlign,
    rejectEmailButtonText: p.rejectEmailButtonText,
    rejectEmailButtonUrl: p.rejectEmailButtonUrl,
    rejectEmailButtonColor: p.rejectEmailButtonColor,
    rejectEmailButtonTextColor: p.rejectEmailButtonTextColor,
    rejectEmailButtonAlign: p.rejectEmailButtonAlign,
    rejectEmailFooterText: p.rejectEmailFooterText,
    rejectEmailShowPoweredBy: p.rejectEmailShowPoweredBy,
    emailOnApprove: p.emailOnApprove,
    approveEmailSubject: p.approveEmailSubject,
    approveEmailBody: p.approveEmailBody,
    approveEmailLogoUrl: p.approveEmailLogoUrl,
    approveEmailLogoSize: p.approveEmailLogoSize,
    approveEmailHeaderTitle: p.approveEmailHeaderTitle,
    approveEmailHeaderTitleSize: p.approveEmailHeaderTitleSize,
    approveEmailHeaderTitleColor: p.approveEmailHeaderTitleColor,
    approveEmailHeaderBgColor: p.approveEmailHeaderBgColor,
    approveEmailLogoAlign: p.approveEmailLogoAlign,
    approveEmailButtonText: p.approveEmailButtonText,
    approveEmailButtonUrl: p.approveEmailButtonUrl,
    approveEmailButtonColor: p.approveEmailButtonColor,
    approveEmailButtonTextColor: p.approveEmailButtonTextColor,
    approveEmailButtonAlign: p.approveEmailButtonAlign,
    approveEmailFooterText: p.approveEmailFooterText,
    approveEmailShowPoweredBy: p.approveEmailShowPoweredBy,
    approvalEmailPresetId: p.approvalEmailPresetId,
  } as T;
}

/** Strip unsupported storefront fields from proxy JSON (defense in depth). */
export function filterStorefrontFieldsForPlan(fields: unknown[], plan: MerchantPlanId): unknown[] {
  return sanitizeFormFieldsJsonForPlan(fields, plan);
}
