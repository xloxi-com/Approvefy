/**
 * SMTP sender (nodemailer). Sender email option + send via configured SMTP.
 * Password stored encrypted in SmtpSettings; use same cipher as app (different salt).
 */

import { createDecipheriv, createCipheriv, randomBytes, scryptSync } from "node:crypto";
import type { Transporter } from "nodemailer";
import nodemailer from "nodemailer";
import prisma from "../db.server";

const SMTP_SALT = "b2b-smtp-salt";

function getEncryptionKey(): Buffer {
  const secret = process.env.SHOPIFY_API_SECRET || "fallback-secret-key";
  return scryptSync(secret, SMTP_SALT, 32);
}

export function encryptSmtpPassword(plain: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", getEncryptionKey(), iv);
  let encrypted = cipher.update(plain, "utf-8", "hex");
  encrypted += cipher.final("hex");
  return `enc:${iv.toString("hex")}:${encrypted}`;
}

export function decryptSmtpPassword(stored: string | null): string | null {
  if (!stored || !stored.startsWith("enc:")) return null;
  try {
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

export async function getSmtpSettings(shop: string) {
  const row = await prisma.smtpSettings.findUnique({ where: { shop } });
  if (!row) return null;
  return {
    id: row.id,
    shop: row.shop,
    host: row.host,
    port: row.port,
    secure: row.secure,
    user: row.user,
    fromEmail: row.fromEmail,
    fromName: row.fromName,
    hasPassword: Boolean(row.passwordEncrypted),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function upsertSmtpSettings(
  shop: string,
  data: {
    host: string;
    port: number;
    secure: boolean;
    user?: string | null;
    password?: string | null;
    fromEmail: string;
    fromName?: string | null;
  }
) {
  const passwordEncrypted =
    data.password != null && data.password !== ""
      ? encryptSmtpPassword(data.password)
      : undefined;

  await prisma.smtpSettings.upsert({
    where: { shop },
    create: {
      shop,
      host: data.host.trim(),
      port: data.port,
      secure: data.secure,
      user: data.user?.trim() || null,
      passwordEncrypted: passwordEncrypted ?? null,
      fromEmail: data.fromEmail.trim(),
      fromName: data.fromName?.trim() || null,
    },
    update: {
      host: data.host.trim(),
      port: data.port,
      secure: data.secure,
      user: data.user?.trim() || null,
      fromEmail: data.fromEmail.trim(),
      fromName: data.fromName?.trim() || null,
      ...(passwordEncrypted !== undefined && { passwordEncrypted }),
    },
  });
  return getSmtpSettings(shop);
}

async function getTransporter(shop: string): Promise<Transporter | null> {
  const row = await prisma.smtpSettings.findUnique({ where: { shop } });
  if (!row) return null;
  const password = decryptSmtpPassword(row.passwordEncrypted);
  const auth =
    row.user && password
      ? { user: row.user, pass: password }
      : undefined;
  // Port 587 uses STARTTLS (secure: false); 465 uses implicit TLS (secure: true)
  const useSecure = row.port === 587 ? false : row.secure;
  const transporter = nodemailer.createTransport({
    host: row.host,
    port: row.port,
    secure: useSecure,
    auth,
  });
  return transporter;
}

export type SendMailOptions = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
};

/**
 * Send email via shop's SMTP settings. Returns { success, error? }.
 */
export async function sendMailViaSmtp(
  shop: string,
  options: SendMailOptions
): Promise<{ success: boolean; error?: string }> {
  const row = await prisma.smtpSettings.findUnique({ where: { shop } });
  if (!row) {
    return { success: false, error: "SMTP not configured for this shop. Configure in Settings." };
  }
  const transporter = await getTransporter(shop);
  if (!transporter) {
    return { success: false, error: "SMTP credentials invalid or missing." };
  }
  const to = Array.isArray(options.to) ? options.to : [options.to];
  const from =
    row.fromName && row.fromName.trim()
      ? `"${row.fromName.replace(/"/g, '\\"')}" <${row.fromEmail}>`
      : row.fromEmail;
  try {
    await transporter.sendMail({
      from,
      to,
      subject: options.subject,
      html: options.html ?? options.text ?? "",
      text: options.text,
      replyTo: options.replyTo,
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[SMTP] Send failed:", err);
    return { success: false, error: message };
  }
}
