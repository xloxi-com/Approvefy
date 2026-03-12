-- Add missing AppSettings columns for appearance + translation status
-- Keeping IF NOT EXISTS so it is safe on existing Supabase schemas.

ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "translationInProgress" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "customCss" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "themeSettings" JSONB;

