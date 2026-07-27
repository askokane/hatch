import Link from "next/link";
import { verifyEmailAction } from "@/actions/auth";

// Verification is idempotent-ish: consuming the token marks the email verified.
export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await verifyEmailAction(token);

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      {result.ok ? (
        <>
          <p className="label-mono">[ verified ]</p>
          <h1 className="mt-2 text-xl font-600">Your email is verified</h1>
          <p className="mt-2 text-xs text-ink-muted">
            You can now send intro requests and messages.
          </p>
          <Link
            href="/discover"
            className="mono mt-6 inline-block border border-pine bg-pine px-4 py-2 text-xs text-paper"
          >
            Go to discover
          </Link>
        </>
      ) : (
        <>
          <p className="label-mono text-brick">[ error ]</p>
          <h1 className="mt-2 text-xl font-600">Verification failed</h1>
          <p className="mt-2 text-xs text-ink-muted">{result.error}</p>
          <Link
            href="/verify/pending"
            className="mono mt-6 inline-block border border-hairline px-4 py-2 text-xs"
          >
            Request a new link
          </Link>
        </>
      )}
    </div>
  );
}
