import { db } from "@/lib/db";
import { createVerificationToken } from "@/lib/email-verify";

// TEST-SUPPORT ONLY. Verification tokens are stored only as hashes, so the raw
// link can't be recovered from the DB. For e2e, this mints a FRESH real
// verification token for the user and returns the raw link, so the test drives
// the genuine /verify/[token] page and real verification logic.
//
// Gated behind the E2E_TEST_SUPPORT flag (set only by the e2e server harness),
// NOT NODE_ENV — because the e2e server runs `next start` (NODE_ENV=production).
// In any real deployment this flag is unset, so the route 404s.
export async function GET(req: Request) {
  if (process.env.E2E_TEST_SUPPORT !== "1") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const email = new URL(req.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email) return Response.json({ error: "email required" }, { status: 400 });

  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return Response.json({ error: "no user" }, { status: 404 });

  const rawToken = await createVerificationToken(user.id);
  return Response.json({ token: rawToken, path: `/verify/${rawToken}` });
}
