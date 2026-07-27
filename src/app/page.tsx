import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function LandingPage() {
  const session = await getSession();
  if (session) redirect(session.profileId ? "/discover" : "/onboarding");

  return (
    <div className="py-12">
      <p className="label-mono">[ for students who build ]</p>
      <h1 className="mt-3 max-w-3xl text-3xl font-600 leading-tight">
        Find the people you need to build the thing you&apos;re building.
      </h1>
      <p className="mt-4 max-w-xl text-base text-ink-muted">
        HATCH is a network for college builders. Post your projects and open roles, get discovered
        by your skills, and reach people through context — not cold DMs. Every intro references a
        real role, project, or intent.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="mono border border-pine bg-pine px-5 py-2.5 text-xs text-paper hover:bg-[#255c41]"
        >
          Sign up with your .edu email
        </Link>
        <Link href="/login" className="mono border border-hairline px-5 py-2.5 text-xs hover:border-ink">
          Log in
        </Link>
      </div>

      <div className="mt-16 grid gap-8 border-t border-hairline pt-8 sm:grid-cols-3">
        <div>
          <p className="label-mono">[ discovery ]</p>
          <p className="mt-2 text-sm">
            An open-roles feed ranked against your skills. See exactly which tags matched.
          </p>
        </div>
        <div>
          <p className="label-mono">[ project rooms ]</p>
          <p className="mt-2 text-sm">
            A changelog of real progress — not a group chat. Proof of work, not hype.
          </p>
        </div>
        <div>
          <p className="label-mono">[ context intros ]</p>
          <p className="mt-2 text-sm">
            Request an intro tied to a role or project. Accept to open a thread. No strangers, no
            spam.
          </p>
        </div>
      </div>
    </div>
  );
}
