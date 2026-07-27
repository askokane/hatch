"use client";

import { useState } from "react";
import { resendVerificationAction } from "@/actions/auth";
import { Button } from "@/components/ui/Button";

export function ResendButton() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        variant="secondary"
        disabled={busy || sent}
        onClick={async () => {
          setBusy(true);
          await resendVerificationAction();
          setBusy(false);
          setSent(true);
        }}
      >
        {sent ? "Link sent — check the server console" : busy ? "Sending…" : "Resend verification link"}
      </Button>
      {sent && (
        <p aria-live="polite" className="text-2xs text-ink-muted">
          The link was printed to your dev server console.
        </p>
      )}
    </div>
  );
}
