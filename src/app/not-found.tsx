import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="label-mono">[ 404 ]</p>
      <h1 className="mt-2 text-xl font-600">This page doesn&apos;t exist</h1>
      <p className="mt-2 text-xs text-ink-muted">
        The link may be broken, or the page may have been moved.
      </p>
      <Link
        href="/discover"
        className="mono mt-6 inline-block border border-hairline px-4 py-2 text-xs hover:border-ink"
      >
        Back to discover
      </Link>
    </div>
  );
}
