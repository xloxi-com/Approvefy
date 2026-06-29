-- AlterTable
ALTER TABLE "FormConfig" ALTER COLUMN "name" DROP DEFAULT,
ALTER COLUMN "formType" DROP DEFAULT;

-- CreateTable
CREATE TABLE "B2BSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "approvalTag" TEXT NOT NULL DEFAULT 'wholesale',
    "orderMinimum" TEXT,
    "orderMaximum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2BSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "B2BSettings_shop_key" ON "B2BSettings"("shop");

-- CreateIndex
CREATE INDEX "FormConfig_shop_isDefault_enabled_idx" ON "FormConfig"("shop", "isDefault", "enabled");

-- CreateIndex
CREATE INDEX "Registration_shop_status_createdAt_desc_idx" ON "Registration"("shop", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Registration_shop_email_idx" ON "Registration"("shop", "email");
