import { PrismaClient } from "@prisma/client";

// Direct DB access for tests that need real seeded IDs (authz bypass, persistence
// checks). Uses the same DATABASE_URL the server runs against — point it at a
// throwaway Postgres test database before running the suite.
export const testDb = new PrismaClient();
