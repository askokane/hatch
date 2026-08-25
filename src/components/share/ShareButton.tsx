"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ShareDialog } from "./ShareDialog";
import type { ShareKind } from "@/lib/validation/share.schema";

// The entry point, dropped anywhere a profile or a project is on screen.
//
// It carries no data of its own beyond an id and a label for the sheet's title —
// the card the recipient sees is composed server-side from the target's own row
// (lib/share-core.ts), so what this component knows and what gets sent are
// deliberately not the same thing.
export function ShareButton({
  kind,
  targetId,
  targetLabel,
  className = "",
}: {
  kind: ShareKind;
  targetId: string;
  targetLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} className={className}>
        Share
      </Button>
      {open && (
        <ShareDialog
          kind={kind}
          targetId={targetId}
          targetLabel={targetLabel}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
