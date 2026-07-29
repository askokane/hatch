import { requireSession, requireProfile } from "@/lib/session";
import { getBlockedProfiles } from "@/lib/relationship";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { DeleteAccountForm } from "./DeleteAccountForm";
import { BlockedList } from "@/components/safety/BlockedList";

export default async function SettingsPage() {
  const session = await requireSession("/settings");
  const profileId = await requireProfile(session);
  const blocked = await getBlockedProfiles(profileId);

  return (
    <div className="mx-auto max-w-lg py-4">
      <p className="label-mono">[ settings ]</p>
      <h1 className="mt-2 text-xl font-600">Account</h1>
      <p className="mt-1 text-xs text-ink-muted">{session.email}</p>

      <section className="mt-10 border-t border-hairline pt-6">
        <h2 className="mono text-sm font-600">Blocked accounts</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Blocked people are hidden from your discovery and can no longer message you. They are
          never told they were blocked.
        </p>
        <div className="mt-4">
          <BlockedList blocked={blocked} />
        </div>
      </section>

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
