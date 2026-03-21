-- Optional email + password gate before Shopify OAuth on /auth/login
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "merchantLoginEmail" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "merchantLoginPasswordHash" TEXT;
