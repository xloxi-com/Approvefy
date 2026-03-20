-- =============================================
-- B2B Customer Validation App — Full Supabase Schema (updated)
-- Matches: prisma/schema.prisma
-- Run in: Supabase Dashboard → SQL Editor (paste all and Run)
--
-- AppSettings.themeSettings (JSONB) stores appearance:
--   fontFamily, cardBg, cardText, headingColor, baseFontSize,
--   formTitleFontSize, formDescriptionFontSize, labelFontSize,
--   inputFontSize, buttonFontSize, primaryButtonBg, primaryButtonText,
--   inputBg, inputBorder, inputRadius, buttonRadius
-- =============================================

-- ---------------------------------------------
-- 1. Session (Shopify session storage)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS "Session" (
    "id"                  TEXT PRIMARY KEY,
    "shop"                TEXT NOT NULL,
    "state"               TEXT NOT NULL,
    "isOnline"            BOOLEAN NOT NULL DEFAULT false,
    "scope"               TEXT,
    "expires"             TIMESTAMPTZ,
    "accessToken"         TEXT NOT NULL,
    "userId"              BIGINT,
    "firstName"           TEXT,
    "lastName"            TEXT,
    "email"               TEXT,
    "accountOwner"        BOOLEAN NOT NULL DEFAULT false,
    "locale"              TEXT,
    "collaborator"        BOOLEAN DEFAULT false,
    "emailVerified"       BOOLEAN DEFAULT false,
    "refreshToken"        TEXT,
    "refreshTokenExpires"  TIMESTAMPTZ
);

-- ---------------------------------------------
-- 2. Registration (B2B customer registrations)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS "Registration" (
    "id"           TEXT PRIMARY KEY,
    "shop"         TEXT NOT NULL,
    "customerId"   TEXT,
    "email"        TEXT NOT NULL,
    "firstName"    TEXT NOT NULL,
    "lastName"     TEXT NOT NULL,
    "phone"        TEXT,
    "company"      TEXT,
    "passwordHash" TEXT,
    "status"       TEXT NOT NULL DEFAULT 'pending',
    "customData"   JSONB,
    "note"         TEXT,
    "reviewedAt"   TIMESTAMPTZ,
    "reviewedBy"   TEXT,
    "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "Registration_shop_idx" ON "Registration"("shop");
CREATE INDEX IF NOT EXISTS "Registration_status_idx" ON "Registration"("status");
CREATE INDEX IF NOT EXISTS "Registration_email_idx" ON "Registration"("email");
CREATE INDEX IF NOT EXISTS "Registration_shop_status_idx" ON "Registration"("shop", "status");
CREATE INDEX IF NOT EXISTS "Registration_status_createdAt_idx" ON "Registration"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Registration_shop_createdAt_idx" ON "Registration"("shop", "createdAt");
CREATE INDEX IF NOT EXISTS "Registration_shop_phone_idx" ON "Registration"("shop", "phone");

-- ---------------------------------------------
-- 3. AppSettings (one per shop: languages, theme, approval)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS "AppSettings" (
    "id"                        TEXT PRIMARY KEY,
    "shop"                      TEXT NOT NULL UNIQUE,
    "defaultLanguage"           TEXT NOT NULL DEFAULT 'en',
    "languageOptions"           JSONB NOT NULL DEFAULT '[]'::jsonb,
    "formTranslations"          JSONB,
    "translationInProgress"     TEXT,
    "customCss"                 TEXT,
    "themeSettings"             JSONB,
    "customerApprovalSettings"  JSONB,
    "createdAt"                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt"                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------
-- 4. B2BSettings
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS "B2BSettings" (
    "id"           TEXT PRIMARY KEY,
    "shop"         TEXT NOT NULL UNIQUE,
    "approvalTag"  TEXT NOT NULL DEFAULT 'wholesale',
    "orderMinimum" TEXT,
    "orderMaximum" TEXT,
    "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------
-- 5. FormConfig (multiple forms per shop)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS "FormConfig" (
    "id"        TEXT PRIMARY KEY,
    "shop"      TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "formType"  TEXT NOT NULL,
    "fields"    JSONB NOT NULL DEFAULT '[]'::jsonb,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "enabled"   BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "FormConfig_shop_idx" ON "FormConfig"("shop");

-- ---------------------------------------------
-- 6. SmtpSettings (one per shop: sender SMTP)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS "SmtpSettings" (
    "id"                  TEXT PRIMARY KEY,
    "shop"                TEXT NOT NULL UNIQUE,
    "host"                TEXT NOT NULL,
    "port"                INTEGER NOT NULL DEFAULT 587,
    "secure"              BOOLEAN NOT NULL DEFAULT false,
    "user"                TEXT,
    "passwordEncrypted"   TEXT,
    "fromEmail"           TEXT NOT NULL,
    "fromName"            TEXT,
    "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "SmtpSettings_shop_key" ON "SmtpSettings"("shop");
CREATE INDEX IF NOT EXISTS "SmtpSettings_shop_idx" ON "SmtpSettings"("shop");

-- ---------------------------------------------
-- 7. EmailTemplate (per shop: create/edit templates)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS "EmailTemplate" (
    "id"        TEXT PRIMARY KEY,
    "shop"      TEXT NOT NULL,
    "slug"      TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "subject"   TEXT NOT NULL,
    "bodyHtml"  TEXT NOT NULL DEFAULT '',
    "bodyText"  TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmailTemplate_shop_slug_key" ON "EmailTemplate"("shop", "slug");
CREATE INDEX IF NOT EXISTS "EmailTemplate_shop_idx" ON "EmailTemplate"("shop");

-- =============================================
-- MIGRATIONS (for existing DBs — safe to run)
-- =============================================

-- Registration: passwordHash if missing
ALTER TABLE "Registration" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

-- FormConfig: allow multiple forms per shop
ALTER TABLE "FormConfig" DROP CONSTRAINT IF EXISTS "FormConfig_shop_key";
DROP INDEX IF EXISTS "FormConfig_shop_key";

ALTER TABLE "FormConfig" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "FormConfig" ADD COLUMN IF NOT EXISTS "formType" TEXT;
ALTER TABLE "FormConfig" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN DEFAULT false;
ALTER TABLE "FormConfig" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN DEFAULT true;

UPDATE "FormConfig" SET "name" = COALESCE("name", 'Registration Form') WHERE "name" IS NULL;
UPDATE "FormConfig" SET "formType" = COALESCE("formType", 'wholesale') WHERE "formType" IS NULL;
UPDATE "FormConfig" SET "isDefault" = COALESCE("isDefault", false) WHERE "isDefault" IS NULL;
UPDATE "FormConfig" SET "enabled" = COALESCE("enabled", true) WHERE "enabled" IS NULL;

ALTER TABLE "FormConfig" ALTER COLUMN "name" SET DEFAULT 'Registration Form';
ALTER TABLE "FormConfig" ALTER COLUMN "formType" SET DEFAULT 'wholesale';
ALTER TABLE "FormConfig" ALTER COLUMN "isDefault" SET DEFAULT false;
ALTER TABLE "FormConfig" ALTER COLUMN "enabled" SET DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "FormConfig" WHERE "name" IS NULL) THEN
    ALTER TABLE "FormConfig" ALTER COLUMN "name" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "FormConfig" WHERE "formType" IS NULL) THEN
    ALTER TABLE "FormConfig" ALTER COLUMN "formType" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "FormConfig" WHERE "isDefault" IS NULL) THEN
    ALTER TABLE "FormConfig" ALTER COLUMN "isDefault" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "FormConfig" WHERE "enabled" IS NULL) THEN
    ALTER TABLE "FormConfig" ALTER COLUMN "enabled" SET NOT NULL;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "FormConfig_shop_idx" ON "FormConfig"("shop");

-- AppSettings: optional columns if missing
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "formTranslations" JSONB;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "translationInProgress" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "customCss" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "themeSettings" JSONB;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "customerApprovalSettings" JSONB;

-- SmtpSettings and EmailTemplate (if running migrations on existing DB)
CREATE TABLE IF NOT EXISTS "SmtpSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 587,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "user" TEXT,
    "passwordEncrypted" TEXT,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SmtpSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SmtpSettings_shop_key" ON "SmtpSettings"("shop");
CREATE INDEX IF NOT EXISTS "SmtpSettings_shop_idx" ON "SmtpSettings"("shop");

CREATE TABLE IF NOT EXISTS "EmailTemplate" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL DEFAULT '',
    "bodyText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmailTemplate_shop_slug_key" ON "EmailTemplate"("shop", "slug");
CREATE INDEX IF NOT EXISTS "EmailTemplate_shop_idx" ON "EmailTemplate"("shop");

-- =============================================
-- updatedAt triggers
-- =============================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "set_updatedAt_Registration" ON "Registration";
CREATE TRIGGER "set_updatedAt_Registration"
BEFORE UPDATE ON "Registration"
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS "set_updatedAt_AppSettings" ON "AppSettings";
CREATE TRIGGER "set_updatedAt_AppSettings"
BEFORE UPDATE ON "AppSettings"
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS "set_updatedAt_B2BSettings" ON "B2BSettings";
CREATE TRIGGER "set_updatedAt_B2BSettings"
BEFORE UPDATE ON "B2BSettings"
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS "set_updatedAt_FormConfig" ON "FormConfig";
CREATE TRIGGER "set_updatedAt_FormConfig"
BEFORE UPDATE ON "FormConfig"
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS "set_updatedAt_SmtpSettings" ON "SmtpSettings";
CREATE TRIGGER "set_updatedAt_SmtpSettings"
BEFORE UPDATE ON "SmtpSettings"
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();

DROP TRIGGER IF EXISTS "set_updatedAt_EmailTemplate" ON "EmailTemplate";
CREATE TRIGGER "set_updatedAt_EmailTemplate"
BEFORE UPDATE ON "EmailTemplate"
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();
