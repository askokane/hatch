"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/actions/auth";
import { Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, null);
  const err = state && !state.ok ? state.error : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {err && (
        <p role="alert" className="mono border border-brick bg-brick-soft px-3 py-2 text-xs text-brick">
          {err}
        </p>
      )}
      {state?.ok && (
        <p
          aria-live="polite"
          className="mono border border-pine bg-pine-soft px-3 py-2 text-xs text-pine"
        >
          Password updated.
        </p>
      )}
      <Input label="Current password" name="currentPassword" type="password" autoComplete="current-password" required />
      <Input label="New password" name="newPassword" type="password" autoComplete="new-password" required hint="At least 10 characters." />
      <div>
        <SubmitButton pendingText="Updating…">Update password</SubmitButton>
      </div>
    </form>
  );
}
