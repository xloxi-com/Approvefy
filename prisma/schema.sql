-- Schema SQL (PostgreSQL) for b2b-customer-valid
-- Generated from Prisma schema. Use for reference or manual setup.

-- ─── Session (Shopify) ───
CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- ─── Registration (B2B) ───
CREATE TABLE IF NOT EXISTS "Registration" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "company" TEXT,
    "passwordHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "customData" JSONB,
    "note" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Registration_shop_idx" ON "Registration"("shop");
CREATE INDEX IF NOT EXISTS "Registration_status_idx" ON "Registration"("status");
CREATE INDEX IF NOT EXISTS "Registration_email_idx" ON "Registration"("email");
CREATE INDEX IF NOT EXISTS "Registration_shop_status_idx" ON "Registration"("shop", "status");
CREATE INDEX IF NOT EXISTS "Registration_shop_createdAt_idx" ON "Registration"("shop", "createdAt");
CREATE INDEX IF NOT EXISTS "Registration_status_createdAt_idx" ON "Registration"("status", "createdAt");

-- ─── App Settings ───
CREATE TABLE IF NOT EXISTS "AppSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'en',
    "languageOptions" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "formTranslations" JSONB,
    "translationInProgress" TEXT,
    "customCss" TEXT,
    "themeSettings" JSONB,
    "customerApprovalSettings" JSONB,
    "shopCountryCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AppSettings_shop_key" ON "AppSettings"("shop");

-- ─── B2B Settings ───
CREATE TABLE IF NOT EXISTS "B2BSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "approvalTag" TEXT NOT NULL DEFAULT 'wholesale',
    "orderMinimum" TEXT,
    "orderMaximum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "B2BSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "B2BSettings_shop_key" ON "B2BSettings"("shop");

-- ─── Form Config ───
CREATE TABLE IF NOT EXISTS "FormConfig" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formType" TEXT NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FormConfig_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FormConfig_shop_idx" ON "FormConfig"("shop");

-- ─── Migration: add shopCountryCode (if column missing) ───
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "shopCountryCode" TEXT;

-- ─── SmtpSettings (one per shop) ───
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

-- ─── EmailTemplate (per shop, create/edit) ───
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
