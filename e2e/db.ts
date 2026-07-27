import { PrismaClient } from "@prisma/client";

// Direct DB access for tests that need real seeded IDs (authz bypass, persistence
// checks). Points at the same e2e-test.db the server uses.
export const testDb = new PrismaClient({
  datasources: { db: { url: "file:./e2e-test.db" } },
});
