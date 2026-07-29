import Link from "next/link";
import type { Relationship } from "@/lib/relationship";

// Compact, read-only rendering of where the viewer stands with someone, for use
// on cards in feeds. Renders nothing when there is no relationship yet, so an
// untouched feed stays visually quiet.
//
// It never renders `theyBlockedViewer` — that direction of a block is not
// disclosable. See lib/relationship.ts.
export function ConnectionStatus({ relationship }: { relationship: Relationship }) {
  if (relationship.self) return null;

  if (relationship.viewerBlockedThem) {
    return <span className="mono text-2xs text-brick">blocked</span>;
  }

  if (relationship.connection === "CONNECTED" && relationship.threadId) {
    return (
      <Link
        href={`/messages/${relationship.threadId}`}
        className="mono text-2xs text-pine hover:underline"
      >
        connected · message →
      </Link>
    );
  }

  if (relationship.connection === "PENDING_OUTBOUND") {
    return (
      <Link href="/requests?tab=sent" className="mono text-2xs text-ink-muted hover:underline">
        request sent
      </Link>
    );
  }

  if (relationship.connection === "PENDING_INBOUND") {
    return (
      <Link href="/requests" className="mono text-2xs text-pine hover:underline">
        awaiting your reply →
      </Link>
    );
  }

  return null;
}
