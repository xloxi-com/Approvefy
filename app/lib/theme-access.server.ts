import prisma from "../db.server";
import { parseCustomerApprovalSettings } from "./customer-approval-settings.server";
import { resolveThemeCliPassword } from "./theme-cli-push.server";

/** Theme Access app password for automated theme push (per shop or global env). */
export async function resolveShopThemeCliPassword(shop: string): Promise<string | undefined> {
  const fromEnv = resolveThemeCliPassword();
  if (fromEnv) return fromEnv;

  if (!shop) return undefined;

  try {
    const row = await prisma.appSettings.findUnique({
      where: { shop },
      select: { customerApprovalSettings: true },
    });
    const parsed = parseCustomerApprovalSettings(row?.customerApprovalSettings);
    const fromSettings =
      typeof parsed.themeAccessPassword === "string" ? parsed.themeAccessPassword.trim() : "";
    return fromSettings || undefined;
  } catch {
    return undefined;
  }
}
