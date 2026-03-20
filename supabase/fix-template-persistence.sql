-- =============================================
-- Fix: Email template not persisting after refresh (Supabase)
-- Run in: Supabase Dashboard → SQL Editor (paste all and Run)
--
-- Requirements for template persistence:
-- 1. customerApprovalSettings (JSONB) stores subject, body, preset id for both
--    rejection and approval emails. On save, the app writes both here and to
--    EmailTemplate (subject + bodyHtml) so the loader can detect the last-saved
--    template after reload.
-- 2. Template matching: stored body is compared as plain text (HTML tags stripped).
--    If body does not match, subject is used to identify the preset. If preset id
--    is empty, inference runs when body or subject exists so the correct template
--    name is shown.
-- 3. In the app: after choosing a template, click Save in the modal — that
--    triggers full form save (body + subject + preset id all stored). Then
--    refresh; the last-saved template will show in Email preview (no reset to
--    "Custom (edit below)").
-- =============================================

-- 1. AppSettings: ensure customerApprovalSettings column exists (JSONB)
--    Stores: rejectEmailSubject, rejectEmailBody, approvalEmailSubject, approveEmailBody,
--            rejectionEmailPresetId, approvalEmailPresetId, and other email fields.
ALTER TABLE "AppSettings"
  ADD COLUMN IF NOT EXISTS "customerApprovalSettings" JSONB;

-- 2. AppSettings: ensure shopCountryCode exists (used elsewhere)
ALTER TABLE "AppSettings"
  ADD COLUMN IF NOT EXISTS "shopCountryCode" TEXT;

-- 3. EmailTemplate table (if missing) for storing rejection/approval subject + body per shop
--    Loader reads this and customerApprovalSettings to show last-saved template after reload.
CREATE TABLE IF NOT EXISTS "EmailTemplate" (
    "id"        TEXT NOT NULL,
    "shop"      TEXT NOT NULL,
    "slug"      TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "subject"   TEXT NOT NULL,
    "bodyHtml"  TEXT NOT NULL DEFAULT '',
    "bodyText"  TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmailTemplate_shop_slug_key" ON "EmailTemplate"("shop", "slug");
CREATE INDEX IF NOT EXISTS "EmailTemplate_shop_idx" ON "EmailTemplate"("shop");

-- Done. After running this:
-- In the app: choose a template → click Save in the modal (full form save) → refresh.
-- Email preview will show the last-saved template; it will not reset to "Custom (edit below)".
