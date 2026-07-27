import Link from "next/link";
import { requireSession } from "@/lib/session";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { DeleteAccountForm } from "./DeleteAccountForm";

export default async function SettingsPage() {
  const session = await requireSession("/settings");

  return (
    <div className="mx-auto max-w-lg py-4">
      <p className="label-mono">[ settings ]</p>
      <h1 className="mt-2 text-xl font-600">Account</h1>
      <p className="mt-1 text-xs text-ink-muted">{session.email}</p>
      {!session.emailVerifiedAt && (
        <p className="mono mt-4 border border-brick bg-brick-soft px-3 py-2 text-xs text-brick">
          Your email is not verified.{" "}
          <Link href="/verify/pending" className="underline">
            Verify now
          </Link>{" "}
          to send intro requests and messages.
        </p>
      )}

      <section className="mt-10 border-t border-hairline pt-6">
        <h2 className="mono text-sm font-600">Change password</h2>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </section>

      <section className="mt-10 border-t border-hairline pt-6">
        <h2 className="mono text-sm font-600 text-brick">Danger zone</h2>
        <div className="mt-4">
          <DeleteAccountForm />
        </div>
      </section>
    </div>
  );
}
