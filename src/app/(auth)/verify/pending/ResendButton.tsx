"use client";

import { useState } from "react";
import { resendVerificationAction } from "@/actions/auth";
import { Button } from "@/components/ui/Button";

export function ResendButton() {
  const [link, setLink] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col items-center gap-3">
      <Button
        variant={sent ? "secondary" : "primary"}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await resendVerificationAction();
          setBusy(false);
          if (res.ok) {
            setLink(res.data.link);
            setSent(true);
          }
        }}
      >
        {busy ? "Generating…" : sent ? "Generate a new link" : "Get my verification link"}
      </Button>

      {sent && link && (
        <div aria-live="polite" className="w-full border border-pine bg-pine-soft p-3 text-center">
          <p className="mono text-2xs uppercase tracking-wide text-pine">
            [ your verification link ]
          </p>
          <a
            href={link}
            className="mono mt-2 inline-block break-all text-xs text-pine underline underline-offset-2"
          >
            {link}
          </a>
          <p className="mt-2 text-2xs text-ink-muted">
            Click to verify. Shown here because this deployment has no mail provider
            configured.
          </p>
        </div>
      )}

      {sent && !link && (
        <p aria-live="polite" className="text-2xs text-ink-muted">
          Check your inbox for the verification link.
        </p>
      )}
    </div>
  );
}
