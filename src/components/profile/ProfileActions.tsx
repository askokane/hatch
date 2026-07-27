"use client";

// Actions available on someone else's profile: request an intro (Phase 7) and
// block/report (Phase 9). This is a client island so the intro dialog and
// block/report dialogs can manage their own state. Fully wired in later phases;
// here it renders the entry points.
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { IntroRequestDialog } from "@/components/requests/IntroRequestDialog";
import { BlockButton } from "@/components/safety/BlockButton";
import { ReportDialog } from "@/components/safety/ReportDialog";

export type IntroContextOption = { id: string; label: string };

export function ProfileActions({
  targetProfileId,
  targetName,
  targetHandle,
  contexts,
}: {
  targetProfileId: string;
  targetName: string;
  targetHandle: string;
  contexts: { roles: IntroContextOption[]; projects: IntroContextOption[]; intents: IntroContextOption[] };
}) {
  const [introOpen, setIntroOpen] = useState(false);
  const hasContext =
    contexts.roles.length + contexts.projects.length + contexts.intents.length > 0;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <Button onClick={() => setIntroOpen(true)} disabled={!hasContext}>
          Request intro
        </Button>
      </div>
      {!hasContext && (
        <p className="text-2xs text-ink-muted">No open context to reference yet.</p>
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
