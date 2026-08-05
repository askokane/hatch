"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { acceptIntroRequestAction, declineIntroRequestAction } from "@/actions/intro-requests";

export type RequestCardData = {
  id: string;
  note: string;
  status: string;
  contextLabel: string;
  createdAt: string;
  counterpart: { handle: string; name: string; avatarSeed: string; avatarAssetId: string | null };
  threadId?: string | null;
};

export function RequestCard({
  data,
  direction,
}: {
  data: RequestCardData;
  direction: "received" | "sent";
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    const res = await acceptIntroRequestAction(data.id);
    setBusy(false);
    if (res.ok) {
      notify("Request accepted — thread opened.", "success");
      router.push(`/messages/${res.data.threadId}`);
    } else {
      notify(res.error, "error");
    }
  }

  async function decline() {
    setBusy(true);
    const res = await declineIntroRequestAction(data.id);
    setBusy(false);
    if (res.ok) {
      notify("Request declined.", "info");
      router.refresh();
    } else {
      notify(res.error, "error");
    }
  }

  return (
    <article className="border border-hairline bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/u/${data.counterpart.handle}`} className="flex items-center gap-2 hover:underline">
          <Avatar seed={data.counterpart.avatarSeed} assetId={data.counterpart.avatarAssetId} size={32} />
          <span className="text-sm font-600">
            {data.counterpart.name}
            <span className="mono block text-2xs text-ink-muted">@{data.counterpart.handle}</span>
          </span>
        </Link>
        <span className="mono text-2xs text-ink-muted">{data.createdAt}</span>
      </div>

      <p className="mono mt-3 border-l-2 border-pine bg-pine-soft px-2 py-1 text-2xs text-pine">
        {data.contextLabel}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm">{data.note}</p>

      <div className="mt-3 flex items-center gap-2">
        {direction === "received" && data.status === "PENDING" && (
          <>
            <Button onClick={accept} disabled={busy}>
              Accept
            </Button>
            <Button variant="ghost" onClick={decline} disabled={busy}>
              Decline
            </Button>
          </>
        )}
        {data.status !== "PENDING" && (
          <span
            className={`mono text-2xs ${
              data.status === "ACCEPTED" ? "text-pine" : "text-ink-muted"
            }`}
          >
            {data.status.toLowerCase()}
          </span>
        )}
        {data.status === "ACCEPTED" && data.threadId && (
          <Link href={`/messages/${data.threadId}`} className="mono text-2xs text-pine underline">
            open thread →
          </Link>
        )}
        {direction === "sent" && data.status === "PENDING" && (
          <span className="mono text-2xs text-ink-muted">pending</span>
        )}
      </div>
    </article>
  );
}
