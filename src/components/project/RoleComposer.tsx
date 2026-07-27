"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOpenRoleAction } from "@/actions/projects";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TextArea } from "@/components/ui/TextArea";
import { Select } from "@/components/ui/Select";
import { TagPicker } from "@/components/ui/TagPicker";
import { useToast } from "@/components/ui/ToastProvider";
import type { TagDTO } from "@/actions/tags";
import { COMMITMENT_LABELS } from "@/lib/constants";

export function RoleComposer({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [commitment, setCommitment] = useState<"LIGHT" | "STEADY" | "HEAVY">("STEADY");
  const [tags, setTags] = useState<TagDTO[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Post a role
      </Button>
    );
  }

  return (
    <form
      className="border border-hairline bg-white p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (tags.length < 1) return setError("Add at least one required tag.");
        setBusy(true);
        const res = await createOpenRoleAction(projectId, {
          title: title.trim(),
          description: description.trim(),
          commitment,
          tagIds: tags.map((t) => t.id),
        });
        setBusy(false);
        if (res.ok) {
          notify("Role posted.", "success");
          setOpen(false);
          setTitle("");
          setDescription("");
          setTags([]);
          router.refresh();
        } else {
          setError(res.error);
        }
      }}
    >
      <div className="flex flex-col gap-3">
        {error && (
          <p role="alert" className="mono border border-brick bg-brick-soft px-3 py-2 text-xs text-brick">
            {error}
          </p>
        )}
        <Input label="Role title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <TextArea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          required
        />
        <Select
          label="Commitment"
          value={commitment}
          onChange={(e) => setCommitment(e.target.value as "LIGHT" | "STEADY" | "HEAVY")}
          options={Object.entries(COMMITMENT_LABELS).map(([v, l]) => ({ value: v, label: l }))}
        />
        <TagPicker label="Required tags (1+)" kind="SKILL" selected={tags} onChange={setTags} />
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Posting…" : "Post role"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
