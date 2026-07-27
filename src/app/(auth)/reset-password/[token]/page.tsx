import { ResetForm } from "./ResetForm";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <div className="mx-auto max-w-md py-8">
      <p className="label-mono">[ new password ]</p>
      <h1 className="mt-2 text-xl font-600">Choose a new password</h1>
      <div className="mt-6">
        <ResetForm token={token} />
      </div>
    </div>
  );
}
