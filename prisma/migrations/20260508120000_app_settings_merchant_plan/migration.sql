-- Merchant pricing tier for feature gating (Basic / Standard / Premium).
ALTER TABLE "AppSettings" ADD COLUMN "merchantPlan" TEXT NOT NULL DEFAULT 'standard';
