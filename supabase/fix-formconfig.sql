-- =============================================
-- Fix "Failed to save configuration" — run in Supabase SQL Editor
-- Run this once to update FormConfig so save works.
-- =============================================

-- 1. Allow multiple forms per shop (remove old UNIQUE on shop)
ALTER TABLE "FormConfig" DROP CONSTRAINT IF EXISTS "FormConfig_shop_key";
DROP INDEX IF EXISTS "FormConfig_shop_key";

-- 2. Add missing columns if your table was created with old schema
ALTER TABLE "FormConfig" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "FormConfig" ADD COLUMN IF NOT EXISTS "formType" TEXT;
ALTER TABLE "FormConfig" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN DEFAULT false;
ALTER TABLE "FormConfig" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN DEFAULT true;

-- 3. Set defaults for existing rows (so NOT NULL won't fail)
UPDATE "FormConfig" SET "name" = COALESCE("name", 'Registration Form');
UPDATE "FormConfig" SET "formType" = COALESCE("formType", 'wholesale');
UPDATE "FormConfig" SET "isDefault" = COALESCE("isDefault", false);
UPDATE "FormConfig" SET "enabled" = COALESCE("enabled", true);

-- 4. Set defaults and NOT NULL (safe after step 3)
ALTER TABLE "FormConfig" ALTER COLUMN "name" SET DEFAULT 'Registration Form';
ALTER TABLE "FormConfig" ALTER COLUMN "formType" SET DEFAULT 'wholesale';
ALTER TABLE "FormConfig" ALTER COLUMN "isDefault" SET DEFAULT false;
ALTER TABLE "FormConfig" ALTER COLUMN "enabled" SET DEFAULT true;

ALTER TABLE "FormConfig" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "FormConfig" ALTER COLUMN "formType" SET NOT NULL;
ALTER TABLE "FormConfig" ALTER COLUMN "isDefault" SET NOT NULL;
ALTER TABLE "FormConfig" ALTER COLUMN "enabled" SET NOT NULL;

-- 5. Index for listing forms by shop
CREATE INDEX IF NOT EXISTS "FormConfig_shop_idx" ON "FormConfig"("shop");
