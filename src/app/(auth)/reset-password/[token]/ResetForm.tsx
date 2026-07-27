"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction } from "@/actions/auth";
import { Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function ResetForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(resetPasswordAction, null);
  const err = state && !state.ok ? state.error : undefined;

  if (state?.ok) {
    return (
      <div className="flex flex-col gap-4">
        <p
          aria-live="polite"
          className="mono border border-pine bg-pine-soft px-3 py-2 text-xs text-pine"
        >
          Your password has been reset. All existing sessions were signed out.
        </p>
        <Link
          href="/login"
          className="mono inline-block border border-pine bg-pine px-4 py-2 text-center text-xs text-paper"
        >
          Log in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {err && (
        <p role="alert" className="mono border border-brick bg-brick-soft px-3 py-2 text-xs text-brick">
          {err}
        </p>
      )}
      <input type="hidden" name="token" value={token} />
      <Input
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 10 characters."
      />
      <SubmitButton pendingText="Resetting…">Reset password</SubmitButton>
    </form>
  );
}
