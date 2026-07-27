import Link from "next/link";
import { ForgotForm } from "./ForgotForm";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md py-8">
      <p className="label-mono">[ reset ]</p>
      <h1 className="mt-2 text-xl font-600">Forgot your password?</h1>
      <p className="mt-2 text-xs text-ink-muted">
        Enter your email and we&apos;ll send a reset link.
      </p>
      <div className="mt-6">
        <ForgotForm />
      </div>
      <p className="mt-4 text-xs text-ink-muted">
        <Link href="/login" className="text-pine underline underline-offset-2">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
