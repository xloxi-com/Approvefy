-- Add shop default country code to AppSettings (used for registration form Country + phone code defaults)
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "shopCountryCode" TEXT;
