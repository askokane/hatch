import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const knownPassword = "HatchDemo!2026";
  const candidates = await db.user.findMany({
    where: { OR: [{ email: { endsWith: "@hatchdemo.edu" } }, { email: { endsWith: "@stateu.edu" } }] },
    select: { email: true, passwordHash: true },
    take: 100,
  });
  const active: string[] = [];
  for (const user of candidates) if (await bcrypt.compare(knownPassword, user.passwordHash)) active.push(user.email);
  if (active.length) throw new Error(`[security] production contains ${active.length} account(s) using the documented demo password: ${active.join(", ")}`);
  console.log("[security] no documented demo credentials are active");
}

main()
  .catch((error) => { console.error(error.message ?? error); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); });
