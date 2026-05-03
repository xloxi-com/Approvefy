import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

/**
 * Build DB URL with connection pool settings to avoid
 * "Timed out fetching a new connection from the connection pool" errors.
 * Default is intentionally generous: Prisma's default is 2× CPU cores + 1, which
 * for typical Node servers (1–2 cores) caps at 3–5 — too low for Shopify app
 * loaders that fire several DB calls in parallel (registration submit, customers list).
 * Supabase Transaction-Pooler URLs (port 6543) easily handle 10–20 per process.
 * Override via DATABASE_CONNECTION_LIMIT / DATABASE_POOL_TIMEOUT env vars.
 */
function getDatabaseUrlWithPool(): string {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) return url;
  try {
    const parsed = new URL(url);
    const connLimit = (process.env.DATABASE_CONNECTION_LIMIT ?? "10").trim();
    const poolTimeout = (process.env.DATABASE_POOL_TIMEOUT ?? "20").trim();
    if (!parsed.searchParams.has("connection_limit")) parsed.searchParams.set("connection_limit", connLimit);
    if (!parsed.searchParams.has("pool_timeout")) parsed.searchParams.set("pool_timeout", poolTimeout);
    return parsed.toString();
  } catch {
    return url;
  }
}

const prismaClientSingleton = (): PrismaClient => {
  const url = getDatabaseUrlWithPool();
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    ...(url ? { datasources: { db: { url } } } : {}),
  });
};

// Single PrismaClient per process (dev and production) to avoid exhausting the connection pool
if (typeof global !== "undefined" && !global.prismaGlobal) {
  global.prismaGlobal = prismaClientSingleton();
}

const prisma: PrismaClient = global.prismaGlobal ?? prismaClientSingleton();

export default prisma;
