import { PrismaClient } from "@prisma/client";

/**
 * Shared Prisma client. A single instance is reused across the API process
 * (and survives dev hot-reloads) to avoid exhausting the Postgres connection
 * pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Re-export the generated client types so apps import everything from @flowcms/db.
export * from "@prisma/client";
