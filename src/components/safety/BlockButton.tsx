"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { blockUserAction } from "@/actions/safety";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";

export function BlockButton({
  blockedProfileId,
  blockedName,
}: {
  blockedProfileId: string;
  blockedName: string;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!confirming) {
    return (
      <Button variant="ghost" onClick={() => setConfirming(true)}>
        Block
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-2xs text-ink-muted">Block {blockedName}?</span>
      <Button
        variant="danger"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await blockUserAction(blockedProfileId);
          setBusy(false);
          setConfirming(false);
          if (res.ok) {
            notify(`Blocked ${blockedName}.`, "success");
            router.refresh();
          } else {
            notify(res.error, "error");
          }
        }}
      >
        Confirm
      </Button>
      <Button variant="ghost" onClick={() => setConfirming(false)}>
        No
      </Button>
    </div>
  );
}
