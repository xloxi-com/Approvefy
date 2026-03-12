-- Add enabled flag for Form status (Enable/Disable) in form builder
ALTER TABLE "FormConfig" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
