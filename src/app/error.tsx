"use client";

import Link from "next/link";

export default function Error({ reset }: { error: Error; reset: () => void }) {
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
