"use client";

import { useActionState } from "react";
import { requestPasswordResetAction } from "@/actions/auth";
import { Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function ForgotForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, null);
  const done = state?.ok;

  if (done) {
    return (
      <p
        aria-live="polite"
        className="mono border border-pine bg-pine-soft px-3 py-2 text-xs text-pine"
      >
        If an account exists for that email, a reset link has been sent. In dev, check the server
        console.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Input label="Email" name="email" type="email" autoComplete="email" required />
      <SubmitButton pendingText="Sending…">Send reset link</SubmitButton>
    </form>
  );
}
