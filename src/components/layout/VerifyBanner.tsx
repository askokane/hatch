import Link from "next/link";

// Shown site-wide while the signed-in user's email is unverified. Verification
// gates sending intro requests and messages, so this needs to be visible rather
// than buried in settings.
export function VerifyBanner() {
  return (
    <div className="border-b border-hairline bg-pine-soft">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
        <p className="text-xs text-ink">
          Your email isn&apos;t verified yet — verify to send intro requests and messages.
        </p>
        <Link
          href="/verify/pending"
          className="mono shrink-0 border border-pine px-3 py-1 text-2xs text-pine hover:bg-white"
        >
          verify now →
        </Link>
      </div>
    </div>
  );
}
