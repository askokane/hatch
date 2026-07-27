import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { OnboardingWizard } from "@/components/profile/OnboardingWizard";

export default async function OnboardingPage() {
  const session = await requireSession("/onboarding");
  // Already onboarded — no second onboarding.
  if (session.profileId) redirect("/discover");

  return (
    <div className="mx-auto max-w-xl py-4">
      <p className="label-mono">[ set up your profile ]</p>
      <h1 className="mt-2 text-xl font-600">Let&apos;s get you discoverable</h1>
      <p className="mt-1 text-xs text-ink-muted">
        This is what other builders see. You can edit any of it later.
      </p>
      <div className="mt-8">
        <OnboardingWizard email={session.email} />
      </div>
    </div>
  );
}
