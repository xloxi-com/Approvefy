-- =============================================================================
-- updatedAt triggers ONLY — run this file alone in Supabase SQL Editor
-- (Avoids "upstream timeout" when mixed with the full schema.sql.)
--
-- If this still times out:
--   1. Run BLOCK A, click Run, wait for success.
--   2. Run BLOCK B one trigger at a time (each CREATE TRIGGER block separately).
--   3. Or use: npx prisma migrate deploy (Prisma already maintains @updatedAt — triggers are optional.)
-- =============================================================================

-- Give this session more time (helps with editor limits when tables are busy)
SET statement_timeout = '120s';
SET lock_timeout = '30s';

-- ---------------------------------------------------------------------------
-- BLOCK A: function (run once)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- BLOCK B: triggers — PostgreSQL 14+ / Supabase: use FUNCTION not PROCEDURE
-- (If your project is on older PG and errors, change EXECUTE FUNCTION → EXECUTE PROCEDURE)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS "set_updatedAt_Registration" ON "Registration";
CREATE TRIGGER "set_updatedAt_Registration"
BEFORE UPDATE ON "Registration"
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS "set_updatedAt_AppSettings" ON "AppSettings";
CREATE TRIGGER "set_updatedAt_AppSettings"
BEFORE UPDATE ON "AppSettings"
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS "set_updatedAt_B2BSettings" ON "B2BSettings";
CREATE TRIGGER "set_updatedAt_B2BSettings"
BEFORE UPDATE ON "B2BSettings"
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS "set_updatedAt_FormConfig" ON "FormConfig";
CREATE TRIGGER "set_updatedAt_FormConfig"
BEFORE UPDATE ON "FormConfig"
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS "set_updatedAt_SmtpSettings" ON "SmtpSettings";
CREATE TRIGGER "set_updatedAt_SmtpSettings"
BEFORE UPDATE ON "SmtpSettings"
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS "set_updatedAt_EmailTemplate" ON "EmailTemplate";
CREATE TRIGGER "set_updatedAt_EmailTemplate"
BEFORE UPDATE ON "EmailTemplate"
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
