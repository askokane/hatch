"use client";

// Actions available on someone else's profile. What renders here is driven
// entirely by the shared Relationship (lib/relationship.ts) rather than by
// anything this component works out locally — that is what keeps the profile,
// project pages and discovery feed from disagreeing about whether you have
// already reached out to someone.
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { IntroRequestDialog } from "@/components/requests/IntroRequestDialog";
import { BlockButton } from "@/components/safety/BlockButton";
import { UnblockButton } from "@/components/safety/UnblockButton";
import { ReportDialog } from "@/components/safety/ReportDialog";
import type { Relationship } from "@/lib/relationship";

export type IntroContextOption = { id: string; label: string };

export function ProfileActions({
  targetProfileId,
  targetName,
  targetHandle,
  contexts,
  relationship,
}: {
  targetProfileId: string;
  targetName: string;
  targetHandle: string;
  contexts: { roles: IntroContextOption[]; projects: IntroContextOption[]; intents: IntroContextOption[] };
  relationship: Relationship;
}) {
  const [introOpen, setIntroOpen] = useState(false);
  const hasContext =
    contexts.roles.length + contexts.projects.length + contexts.intents.length > 0;

  // The viewer's own block: stated plainly, with the way out.
  if (relationship.viewerBlockedThem) {
    return (
      <div className="flex flex-col items-end gap-2">
        <p className="mono border border-brick bg-brick-soft px-3 py-1.5 text-2xs text-brick">
          You blocked {targetName}
        </p>
        <UnblockButton blockedProfileId={targetProfileId} blockedName={targetName} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {relationship.connection === "CONNECTED" && relationship.threadId ? (
          <Link
            href={`/messages/${relationship.threadId}`}
            className="mono border border-pine bg-pine px-3 py-1.5 text-xs text-paper hover:bg-[#255c41]"
          >
            Message
          </Link>
        ) : relationship.connection === "PENDING_INBOUND" ? (
          <Link
            href="/requests"
            className="mono border border-pine bg-pine px-3 py-1.5 text-xs text-paper hover:bg-[#255c41]"
          >
            Respond to request
          </Link>
        ) : relationship.connection === "PENDING_OUTBOUND" ? (
          <Link
            href="/requests?tab=sent"
            className="mono border border-hairline px-3 py-1.5 text-xs text-ink-muted hover:border-ink hover:text-ink"
          >
            Request sent · pending
          </Link>
        ) : (
          <Button
            onClick={() => setIntroOpen(true)}
            disabled={!hasContext || !relationship.canRequestIntro}
          >
            Request intro
          </Button>
        )}
      </div>

      {relationship.connection === "CONNECTED" && (
        <p className="mono text-2xs text-pine">connected</p>
      )}
      {relationship.connection === "NONE" && !hasContext && relationship.canRequestIntro && (
        <p className="text-2xs text-ink-muted">No open context to reference yet.</p>
      )}
      {/* Deliberately says nothing about why. This is the branch a blocked
          viewer lands on, and it must not read differently from any other
          reason a request might be unavailable. */}
      {relationship.connection === "NONE" && !relationship.canRequestIntro && (
        <p className="text-2xs text-ink-muted">You can&apos;t request an intro right now.</p>
      )}

      <div className="flex gap-2">
        <BlockButton blockedProfileId={targetProfileId} blockedName={targetName} />
        <ReportDialog subjectType="PROFILE" subjectId={targetProfileId} subjectLabel={`@${targetHandle}`} />
      </div>

      {introOpen && (
        <IntroRequestDialog
          targetProfileId={targetProfileId}
          targetName={targetName}
          contexts={contexts}
          onClose={() => setIntroOpen(false)}
        />
      )}
    </div>
  );
}
