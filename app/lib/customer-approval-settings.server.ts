import prisma from "../db.server";
import { normalizeMerchantPlan } from "./merchant-plan.server";
import { CACHE_TTL, getCache, setCache, shopKey } from "./cache.server";

export {
  STOREFRONT_REDIRECT_DEFAULTS,
  readStorefrontRedirectBooleanSetting,
} from "./storefront-redirect-settings";
export type { StorefrontRedirectBooleanKey } from "./storefront-redirect-settings";

/** Parse `customerApprovalSettings` from Prisma JSON (object or legacy string). */
export function parseCustomerApprovalSettings(input: unknown): Record<string, unknown> {
  if (!input) return {};
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

export function readApprovalModeFromParsedSettings(
  parsed: Record<string, unknown>,
  merchantPlan?: string | null,
): "auto" | "manual" {
  const plan = normalizeMerchantPlan(merchantPlan ?? undefined);
  if (plan === "basic") return "auto";
  const raw = String(parsed.approvalMode ?? "")
    .trim()
    .toLowerCase();
  return raw === "auto" ? "auto" : "manual";
}

export type RegistrationAfterSubmitSettings = {
  approvalMode: "auto" | "manual";
  afterSubmit: "redirect" | "message";
  redirectUrl: string;
  successMessage: string;
};

const DEFAULT_SUCCESS_MESSAGE =
  "Registration successful! Your account is pending approval. You will receive an email once approved.";

export async function getRegistrationAfterSubmitSettings(
  shop: string,
): Promise<RegistrationAfterSubmitSettings> {
  let approvalMode: "auto" | "manual" = "manual";
  let afterSubmit: "redirect" | "message" = "message";
  let redirectUrl = "";
  let successMessage = DEFAULT_SUCCESS_MESSAGE;

  if (!shop) {
    return { approvalMode, afterSubmit, redirectUrl, successMessage };
  }

  const cacheKey = shopKey(shop, "registrationAfterSubmit");
  const cached = getCache<RegistrationAfterSubmitSettings>(cacheKey);
  if (cached) return cached;

  try {
    const settings = await prisma.appSettings.findUnique({
      where: { shop },
      select: { customerApprovalSettings: true, merchantPlan: true },
    });
    const parsed = parseCustomerApprovalSettings(settings?.customerApprovalSettings);
    approvalMode = readApprovalModeFromParsedSettings(parsed, settings?.merchantPlan);
    afterSubmit = parsed.afterSubmit === "redirect" ? "redirect" : "message";
    redirectUrl = typeof parsed.redirectUrl === "string" ? parsed.redirectUrl : "";
    if (typeof parsed.successMessage === "string" && parsed.successMessage.trim()) {
      successMessage = parsed.successMessage.trim();
    }
  } catch {
    /* keep defaults */
  }

  const result = { approvalMode, afterSubmit, redirectUrl, successMessage };
  setCache(cacheKey, result, CACHE_TTL.appSettings);
  return result;
}
