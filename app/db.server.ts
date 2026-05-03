import { PrismaClient } from "@prisma/client";

/**
 * Single PrismaClient per process (dev + production).
 *
 * Why a global singleton:
 * - In development, Vite/HMR re-evaluates server modules and would otherwise spawn
 *   a new PrismaClient (and a new pool of DB connections) on every reload.
 * - In serverless production (Vercel), each warm lambda instance reuses one client.
 *
 * Connection notes (see .env / .env.example):
 * - DATABASE_URL must point at Supabase's pooled port (6543) with
 *   `?pgbouncer=true&connection_limit=1`. PgBouncer transaction-mode is what makes
 *   serverless safe — Prisma must not open more than one socket per lambda.
 * - DIRECT_URL (port 5432, session-mode) is reserved for `prisma migrate deploy`.
 */
declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

/**
 * Build DB URL with connection pool settings to avoid
 * "Timed out fetching a new connection from the connection pool" errors.
 * When `pgbouncer=true` is already set we keep the user-supplied connection_limit
 * (typically 1 for serverless). Otherwise fall back to a generous default for
 * long-running Node servers.
 */
function getDatabaseUrlWithPool(): string {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) return url;
  try {
    const parsed = new URL(url);
    const usingPgBouncer = parsed.searchParams.get("pgbouncer") === "true";
    const defaultLimit = usingPgBouncer ? "1" : "10";
    const connLimit = (process.env.DATABASE_CONNECTION_LIMIT ?? defaultLimit).trim();
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

const globalForPrisma = globalThis as unknown as { prismaGlobal?: PrismaClient };

const prisma: PrismaClient = globalForPrisma.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaGlobal = prisma;
}

export default prisma;
