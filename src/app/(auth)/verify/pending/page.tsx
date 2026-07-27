import Link from "next/link";
import { getSession } from "@/lib/session";
import { ResendButton } from "./ResendButton";

export default async function VerifyPendingPage() {
  const session = await getSession();

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <p className="label-mono">[ check your email ]</p>
      <h1 className="mt-2 text-xl font-600">Verify your email</h1>
      <p className="mt-2 text-xs text-ink-muted">
        Verifying unlocks sending intro requests and messages. This deployment has no mail
        provider wired up, so generate your link below and click it — no inbox needed.
      </p>
      {session && !session.emailVerifiedAt && (
        <div className="mt-6">
          <ResendButton />
        </div>
      )}
      <p className="mt-6 text-xs text-ink-muted">
        You can keep using HATCH unverified, but sending intro requests and messages requires a
        verified email.{" "}
        <Link href="/discover" className="text-pine underline underline-offset-2">
          Continue
        </Link>
      </p>
    </div>
  );
}
