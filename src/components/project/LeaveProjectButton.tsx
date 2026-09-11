"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { leaveProjectAction } from "@/actions/projects";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";

export function LeaveProjectButton({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState(false); const router = useRouter(); const { notify } = useToast();
  return <Button variant="ghost" disabled={busy} onClick={async () => {
    setBusy(true);
    try {
      const result = await leaveProjectAction(projectId);
      if (result.ok) router.push("/discover"); else notify(result.error, "error");
    } finally { setBusy(false); }
  }}>{busy ? "Leaving…" : "Leave project"}</Button>;
}
