"use client";

import { useActionState, useState } from "react";
import { deleteAccountAction } from "@/actions/auth";
import { Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Button } from "@/components/ui/Button";

export function DeleteAccountForm() {
  const [state, formAction] = useActionState(deleteAccountAction, null);
  const [confirming, setConfirming] = useState(false);
  const err = state && !state.ok ? state.error : undefined;

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Delete my account
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-xs text-ink-muted">
        This permanently deletes your account, profile, projects you own, messages, and requests.
        This cannot be undone.
      </p>
      {err && (
        <p role="alert" className="mono border border-brick bg-brick-soft px-3 py-2 text-xs text-brick">
          {err}
        </p>
      )}
      <Input label="Confirm your password" name="currentPassword" type="password" autoComplete="current-password" required />
      <div className="flex gap-2">
        <SubmitButton variant="danger" pendingText="Deleting…">
          Permanently delete
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
