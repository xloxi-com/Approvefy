import prisma from "../db.server";
import { parseCustomerApprovalSettings } from "./customer-approval-settings.server";

export const ONBOARDING_FORM_REVIEWED_KEY = "onboardingFormReviewed";
export const ONBOARDING_SETTINGS_SAVED_KEY = "onboardingSettingsSaved";

export function isOnboardingFormReviewed(settings: Record<string, unknown> | null | undefined): boolean {
  return settings?.[ONBOARDING_FORM_REVIEWED_KEY] === true;
}

export function isOnboardingSettingsSaved(settings: Record<string, unknown> | null | undefined): boolean {
  return settings?.[ONBOARDING_SETTINGS_SAVED_KEY] === true;
}

/** Merge onboarding flags into settings payload when merchant saves Settings. */
export function withOnboardingSettingsSaved<T extends Record<string, unknown>>(settings: T): T {
  return { ...settings, [ONBOARDING_SETTINGS_SAVED_KEY]: true };
}

/** Mark form builder step complete after merchant saves a form. */
export async function markOnboardingFormReviewed(shop: string): Promise<void> {
  if (!shop) return;

  const row = await prisma.appSettings.findUnique({
    where: { shop },
    select: { customerApprovalSettings: true },
  });
  const parsed = parseCustomerApprovalSettings(row?.customerApprovalSettings);
  if (parsed[ONBOARDING_FORM_REVIEWED_KEY] === true) return;

  const next = { ...parsed, [ONBOARDING_FORM_REVIEWED_KEY]: true };
  if (row) {
    await prisma.appSettings.update({
      where: { shop },
      data: { customerApprovalSettings: next },
    });
    return;
  }

  await prisma.appSettings.create({
    data: {
      shop,
      customerApprovalSettings: next,
    },
  });
}
