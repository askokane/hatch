"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { unblockUserAction } from "@/actions/safety";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";

// Unblocking is non-destructive and trivially redoable, so unlike Block it does
// not ask for confirmation.
export function UnblockButton({
  blockedProfileId,
  blockedName,
}: {
  blockedProfileId: string;
  blockedName: string;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await unblockUserAction(blockedProfileId);
        setBusy(false);
        if (res.ok) {
          notify(`Unblocked ${blockedName}.`, "success");
          router.refresh();
        } else {
          notify(res.error, "error");
        }
      }}
    >
      {busy ? "…" : `Unblock ${blockedName}`}
    </Button>
  );
}
