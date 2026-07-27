"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { closeProjectAction } from "@/actions/projects";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";

export function CloseProjectButton({ projectId, slug }: { projectId: string; slug: string }) {
  const router = useRouter();
  const { notify } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Close this project
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs">Are you sure?</span>
      <Button
        variant="danger"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await closeProjectAction(projectId);
          setBusy(false);
          if (res.ok) {
            notify("Project closed.", "success");
            router.push(`/p/${slug}`);
          } else {
            notify(res.error, "error");
          }
        }}
      >
        Yes, close it
      </Button>
      <Button variant="ghost" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  );
}
