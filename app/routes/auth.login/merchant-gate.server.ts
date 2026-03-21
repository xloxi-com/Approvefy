import prisma from "../../db.server";
import { verifyMerchantLoginPassword } from "../../lib/merchant-login.server";
import type { LoginErrorMessage } from "./error.server";

/**
 * If this shop has optional merchant email+password configured in Settings,
 * require a match before Shopify OAuth. Otherwise return {} (no extra errors).
 */
export async function verifyMerchantLoginGate(
  shop: string,
  emailRaw: string,
  passwordRaw: string
): Promise<Pick<LoginErrorMessage, "email" | "password">> {
  const settings = await prisma.appSettings.findUnique({
    where: { shop },
    select: { merchantLoginEmail: true, merchantLoginPasswordHash: true },
  });

  if (!settings?.merchantLoginPasswordHash?.trim() || !settings.merchantLoginEmail?.trim()) {
    return {};
  }

  const email = emailRaw.trim().toLowerCase();
  const expectedEmail = settings.merchantLoginEmail.trim().toLowerCase();
  const password = passwordRaw;

  if (!email) {
    return { email: "Email is required for this store" };
  }
  if (!password) {
    return { password: "Password is required for this store" };
  }
  if (email !== expectedEmail) {
    return { email: "Incorrect email or password", password: "Incorrect email or password" };
  }
  if (!verifyMerchantLoginPassword(password, settings.merchantLoginPasswordHash)) {
    return { email: "Incorrect email or password", password: "Incorrect email or password" };
  }

  return {};
}
