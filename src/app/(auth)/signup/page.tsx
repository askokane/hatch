import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { SignupForm } from "./SignupForm";

export default async function SignupPage() {
  const session = await getSession();
  if (session) redirect(session.profileId ? "/discover" : "/onboarding");

  return (
    <div className="mx-auto max-w-md py-8">
      <p className="label-mono">[ join ]</p>
      <h1 className="mt-2 text-xl font-600">Create your HATCH account</h1>
      <p className="mt-2 text-xs text-ink-muted">
        Build a profile, join project rooms, and get context-bearing intros.
      </p>
      <div className="mt-6">
        <SignupForm />
      </div>
      <p className="mt-4 text-xs text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-pine underline underline-offset-2">
          Log in
        </Link>
      </p>
    </div>
  );
}
