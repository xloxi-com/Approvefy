-- Performance indexes for Registration hot paths.
-- Idempotent (`IF NOT EXISTS`) so this is safe if any of these already exist
-- on a given environment (e.g. created by an earlier `prisma db push`).

-- Composite index reflecting the schema.prisma declarations that previously
-- had no migration file (drift catch-up).
CREATE INDEX IF NOT EXISTS "Registration_shop_createdAt_idx"
  ON "Registration" ("shop", "createdAt");

CREATE INDEX IF NOT EXISTS "Registration_status_createdAt_idx"
  ON "Registration" ("status", "createdAt");

CREATE INDEX IF NOT EXISTS "Registration_shop_status_createdAt_idx"
  ON "Registration" ("shop", "status", "createdAt");

-- New: customers list orders by createdAt DESC; descending index avoids a sort.
CREATE INDEX IF NOT EXISTS "Registration_shop_createdAt_desc_idx"
  ON "Registration" ("shop", "createdAt" DESC);

-- New: lookups by Shopify customer GID (reconcile / dedupe / customer detail).
CREATE INDEX IF NOT EXISTS "Registration_customerId_idx"
  ON "Registration" ("customerId");
