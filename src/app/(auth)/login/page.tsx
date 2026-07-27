import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  if (session) redirect(session.profileId ? "/discover" : "/onboarding");

  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/discover";

  return (
    <div className="mx-auto max-w-md py-8">
      <p className="label-mono">[ log in ]</p>
      <h1 className="mt-2 text-xl font-600">Welcome back</h1>
      <div className="mt-6">
        <LoginForm next={safeNext} />
      </div>
      <div className="mt-4 flex flex-col gap-1 text-xs text-ink-muted">
        <Link href="/forgot-password" className="text-pine underline underline-offset-2">
          Forgot your password?
        </Link>
        <span>
          Need an account?{" "}
          <Link href="/signup" className="text-pine underline underline-offset-2">
            Sign up
          </Link>
        </span>
      </div>
    </div>
  );
}
