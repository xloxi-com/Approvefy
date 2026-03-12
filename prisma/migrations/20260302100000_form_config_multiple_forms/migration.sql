-- Allow multiple forms per shop: add name, formType, isDefault; remove unique on shop

ALTER TABLE "FormConfig" ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Registration Form';
ALTER TABLE "FormConfig" ADD COLUMN "formType" TEXT NOT NULL DEFAULT 'b2b';
ALTER TABLE "FormConfig" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- Existing single form per shop becomes the default
UPDATE "FormConfig" SET "isDefault" = true;

-- Drop unique constraint on shop so multiple forms per shop are allowed
DROP INDEX IF EXISTS "FormConfig_shop_key";

CREATE INDEX IF NOT EXISTS "FormConfig_shop_idx" ON "FormConfig"("shop");
