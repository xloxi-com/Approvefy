-- Per-form Shopify customer tags applied on registration submit.
ALTER TABLE "FormConfig" ADD COLUMN IF NOT EXISTS "customerTags" JSONB NOT NULL DEFAULT '[]';
