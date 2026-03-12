import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

/**
 * Build DB URL with connection pool settings to avoid
 * "Timed out fetching a new connection from the connection pool" errors.
 * Use a small connection_limit so we don't exhaust Supabase/host limits.
 */
function getDatabaseUrlWithPool(): string {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("connection_limit")) parsed.searchParams.set("connection_limit", "5");
    if (!parsed.searchParams.has("pool_timeout")) parsed.searchParams.set("pool_timeout", "60");
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
