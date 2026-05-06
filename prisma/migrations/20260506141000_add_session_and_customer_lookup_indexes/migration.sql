-- Additional indexes for session token lookup and customer detail/reconcile paths.
-- Kept idempotent for safe rollout across environments.

CREATE INDEX IF NOT EXISTS "Session_shop_isOnline_expires_idx"
  ON "Session" ("shop", "isOnline", "expires");

CREATE INDEX IF NOT EXISTS "Session_shop_expires_idx"
  ON "Session" ("shop", "expires");

CREATE INDEX IF NOT EXISTS "Registration_shop_customerId_idx"
  ON "Registration" ("shop", "customerId");
