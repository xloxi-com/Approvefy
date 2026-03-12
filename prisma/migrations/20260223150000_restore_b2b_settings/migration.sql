-- Restore B2BSettings table for B2B Settings UI
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
