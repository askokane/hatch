import { stopServer } from "./server-control";
import { testDb } from "./db";

export default async function globalTeardown() {
  await stopServer().catch(() => {});
  // Release the suite's own connection so a following run does not have to wait
  // for the database to time it out.
  await testDb.$disconnect().catch(() => {});
}
