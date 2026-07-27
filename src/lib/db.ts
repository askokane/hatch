import { PrismaClient } from "@prisma/client";

// Single Prisma client instance, reused across hot reloads in dev so we don't
// exhaust the SQLite connection on every file change.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
