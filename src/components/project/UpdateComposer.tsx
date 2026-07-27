"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postUpdateAction } from "@/actions/projects";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { useToast } from "@/components/ui/ToastProvider";

export function UpdateComposer({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { notify } = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="border border-hairline bg-white p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        const res = await postUpdateAction(projectId, body.trim());
        setBusy(false);
        if (res.ok) {
          setBody("");
          notify("Update posted.", "success");
          router.refresh();
        } else {
          setError(res.error);
        }
      }}
    >
      <TextArea
        label="Post an update"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="What shipped, what broke, what's next…"
        error={error ?? undefined}
      />
      <div className="mt-2">
        <Button type="submit" disabled={busy || !body.trim()}>
          {busy ? "Posting…" : "Post update"}
        </Button>
      </div>
    </form>
  );
}
