// One-time operational remediation for the documented seed credentials.
// It only acts on accounts whose stored hash still matches the published seed
// password, then invalidates every active session and reset token for them.

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const DEFAULT_PASSWORD = "HatchDemo!2026";

async function main() {
  const users = await db.user.findMany({
    where: { OR: [{ email: { endsWith: "@hatchdemo.edu" } }, { email: { endsWith: "@stateu.edu" } }] },
    select: { id: true, passwordHash: true },
  });
  const affected = [] as string[];

  for (const user of users) {
    if (!(await bcrypt.compare(DEFAULT_PASSWORD, user.passwordHash))) continue;
    const replacementHash = await bcrypt.hash(crypto.randomBytes(48).toString("base64url"), 12);
    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { passwordHash: replacementHash, credentialVersion: { increment: 1 } },
      }),
      db.session.deleteMany({ where: { userId: user.id } }),
      db.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    ]);
    affected.push(user.id);
  }

  console.log(`Revoked default credentials for ${affected.length} account(s).`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => db.$disconnect());
