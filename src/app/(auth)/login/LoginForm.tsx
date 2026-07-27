"use client";

import { useActionState } from "react";
import { loginAction } from "@/actions/auth";
import { Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(loginAction, null);
  const err = state && !state.ok ? state.error : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {err && (
        <p role="alert" className="mono border border-brick bg-brick-soft px-3 py-2 text-xs text-brick">
          {err}
        </p>
      )}
      <input type="hidden" name="next" value={next} />
      <Input label="Email" name="email" type="email" autoComplete="email" required />
      <Input label="Password" name="password" type="password" autoComplete="current-password" required />
      <SubmitButton pendingText="Signing in…">Log in</SubmitButton>
    </form>
  );
}
