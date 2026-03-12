/**
 * Email template CRUD (create, edit, list). Per-shop templates by slug.
 */

import prisma from "../db.server";

export type EmailTemplateRecord = {
  id: string;
  shop: string;
  slug: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listEmailTemplates(shop: string): Promise<EmailTemplateRecord[]> {
  const list = await prisma.emailTemplate.findMany({
    where: { shop },
    orderBy: { name: "asc" },
  });
  return list;
}

export async function getEmailTemplateBySlug(
  shop: string,
  slug: string
): Promise<EmailTemplateRecord | null> {
  const row = await prisma.emailTemplate.findUnique({
    where: { shop_slug: { shop, slug } },
  });
  return row;
}

export async function getEmailTemplateById(
  shop: string,
  id: string
): Promise<EmailTemplateRecord | null> {
  const row = await prisma.emailTemplate.findFirst({
    where: { id, shop },
  });
  return row;
}

export async function createEmailTemplate(
  shop: string,
  data: { slug: string; name: string; subject: string; bodyHtml?: string; bodyText?: string }
): Promise<{ template?: EmailTemplateRecord; error?: string }> {
  const slug = data.slug.trim().toLowerCase().replace(/\s+/g, "-");
  if (!slug) return { error: "Slug is required." };
  const name = data.name.trim() || slug;
  const subject = data.subject.trim() || "(No subject)";
  const bodyHtml = data.bodyHtml?.trim() ?? "";
  const bodyText = data.bodyText?.trim() ?? null;
  try {
    const template = await prisma.emailTemplate.create({
      data: {
        shop,
        slug,
        name,
        subject,
        bodyHtml,
        bodyText,
      },
    });
    return { template };
  } catch (e: unknown) {
    const msg = e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002"
      ? "A template with this slug already exists."
      : e instanceof Error ? e.message : "Failed to create template.";
    return { error: msg };
  }
}

export async function updateEmailTemplate(
  shop: string,
  id: string,
  data: { name?: string; subject?: string; bodyHtml?: string; bodyText?: string }
): Promise<{ template?: EmailTemplateRecord; error?: string }> {
  const existing = await prisma.emailTemplate.findFirst({ where: { id, shop } });
  if (!existing) return { error: "Template not found." };
  const name = data.name !== undefined ? data.name.trim() || existing.name : existing.name;
  const subject = data.subject !== undefined ? data.subject.trim() || existing.subject : existing.subject;
  const bodyHtml = data.bodyHtml !== undefined ? data.bodyHtml.trim() : existing.bodyHtml;
  const bodyText = data.bodyText !== undefined ? (data.bodyText.trim() || null) : existing.bodyText;
  try {
    const template = await prisma.emailTemplate.update({
      where: { id },
      data: { name, subject, bodyHtml, bodyText },
    });
    return { template };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update template.";
    return { error: message };
  }
}

export async function deleteEmailTemplate(shop: string, id: string): Promise<{ error?: string }> {
  const existing = await prisma.emailTemplate.findFirst({ where: { id, shop } });
  if (!existing) return { error: "Template not found." };
  try {
    await prisma.emailTemplate.delete({ where: { id } });
    return {};
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete template.";
    return { error: message };
  }
}

/** Create or update the built-in "rejection" template (used by Settings). */
export async function upsertRejectionTemplate(
  shop: string,
  data: { subject: string; bodyHtml: string }
): Promise<{ template: EmailTemplateRecord }> {
  const subject = data.subject.trim() || "Your account registration update";
  const bodyHtml = data.bodyHtml.trim() || "Unfortunately, your registration was not approved at this time.";
  const existing = await prisma.emailTemplate.findUnique({
    where: { shop_slug: { shop, slug: "rejection" } },
  });
  if (existing) {
    const template = await prisma.emailTemplate.update({
      where: { id: existing.id },
      data: { subject, bodyHtml },
    });
    return { template };
  }
  const template = await prisma.emailTemplate.create({
    data: { shop, slug: "rejection", name: "Rejection", subject, bodyHtml },
  });
  return { template };
}

/** Create or update the built-in "approval" template (used by Settings for approval success email). */
export async function upsertApprovalTemplate(
  shop: string,
  data: { subject: string; bodyHtml: string }
): Promise<{ template: EmailTemplateRecord }> {
  const subject = data.subject.trim() || "Your account has been approved";
  const bodyHtml = data.bodyHtml.trim() || "Congratulations! Your registration has been approved. You can now log in to your account.";
  const existing = await prisma.emailTemplate.findUnique({
    where: { shop_slug: { shop, slug: "approval" } },
  });
  if (existing) {
    const template = await prisma.emailTemplate.update({
      where: { id: existing.id },
      data: { subject, bodyHtml },
    });
    return { template };
  }
  const template = await prisma.emailTemplate.create({
    data: { shop, slug: "approval", name: "Approval", subject, bodyHtml },
  });
  return { template };
}
