import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { ProjectForm } from "@/components/project/ProjectForm";

export default async function NewProjectPage() {
  const session = await requireSession("/projects/new");
  if (!session.profileId) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-xl py-2">
      <p className="label-mono">[ new project ]</p>
      <h1 className="mt-2 text-xl font-600">Start a project room</h1>
      <p className="mt-1 text-xs text-ink-muted">
        A project room is a changelog and a place to post open roles. You&apos;ll be the owner.
      </p>
      {!session.emailVerifiedAt && (
        <p className="mono mt-4 border border-brick bg-brick-soft px-3 py-2 text-xs text-brick">
          Verify your email before creating a project.{" "}
          <Link href="/verify/pending" className="underline">
            Verify now
          </Link>
        </p>
      )}
      <div className="mt-6">
        <ProjectForm mode="create" />
      </div>
    </div>
  );
}
