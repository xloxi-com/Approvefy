-- Add customer approval settings to AppSettings (Manual/Auto approval, assign tag, after submit behavior)
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "customerApprovalSettings" JSONB;
