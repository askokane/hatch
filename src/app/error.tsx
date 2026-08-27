"use client";

import Link from "next/link";
import { unstable_isUnrecognizedActionError } from "next/navigation";

// Whether this error is the client and the server disagreeing about what code
// is running — a deploy landed while this page was open, so the Server Action
// the page tried to call no longer exists on the server.
//
// Next flags it specifically: the server answers the action POST with an
// `x-nextjs-action-not-found` header, and the router turns that into an
// UnrecognizedActionError rather than a generic failure. That distinction is
// worth honouring, because this is the one error on this screen the reader can
// actually fix, and the generic copy ("try again") points them at the one thing
// that cannot work — see below.
//
// The `name` check backs up the official predicate. The predicate is still
// `unstable_`, and this error crosses a bundle boundary to reach us, so an
// `instanceof` that silently stops matching would downgrade this to the generic
// message with nothing to notice it by. The fallback costs one comparison.
function isStaleDeployment(error: Error): boolean {
  return error.name === "UnrecognizedActionError" || unstable_isUnrecognizedActionError(error);
}

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  if (isStaleDeployment(error)) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="label-mono text-brick">[ out of date ]</p>
        <h1 className="mt-2 text-xl font-600">This page needs a refresh</h1>
        <p className="mt-2 text-xs text-ink-muted">
          HATCH was updated while this page was open, so your last action didn&apos;t go through.
          Nothing was saved. Reload to pick up the new version, then try again.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          {/* A full reload, not `reset()`. The stale code is the JavaScript this
              tab already downloaded; re-rendering the segment re-runs that same
              bundle and the next submit fails identically. Only fetching the
              document again replaces it. */}
          <button
            onClick={() => window.location.reload()}
            className="mono border border-hairline px-4 py-2 text-xs hover:border-ink"
          >
            Reload page
          </button>
          <Link
            href="/discover"
            className="mono border border-hairline px-4 py-2 text-xs hover:border-ink"
          >
            Discover
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="label-mono text-brick">[ error ]</p>
      <h1 className="mt-2 text-xl font-600">Something went wrong</h1>
      <p className="mt-2 text-xs text-ink-muted">
        An unexpected error occurred. You can try again or head back.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <button
          onClick={reset}
          className="mono border border-hairline px-4 py-2 text-xs hover:border-ink"
        >
          Try again
        </button>
        <Link href="/discover" className="mono border border-hairline px-4 py-2 text-xs hover:border-ink">
          Discover
        </Link>
      </div>
    </div>
  );
}
