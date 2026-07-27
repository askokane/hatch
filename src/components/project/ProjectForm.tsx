"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProjectAction, updateProjectAction } from "@/actions/projects";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TextArea } from "@/components/ui/TextArea";
import { Select } from "@/components/ui/Select";
import { TagPicker } from "@/components/ui/TagPicker";
import { useToast } from "@/components/ui/ToastProvider";
import type { TagDTO } from "@/actions/tags";
import { STAGE_LABELS } from "@/lib/constants";

export type ProjectFormInitial = {
  name: string;
  description: string;
  stage: "IDEA" | "BUILDING" | "LAUNCHED";
  visibility: "PUBLIC" | "UNLISTED";
  links: { label: string; url: string }[];
  tags: TagDTO[];
};

export function ProjectForm({
  mode,
  projectId,
  slug,
  initial,
}: {
  mode: "create" | "edit";
  projectId?: string;
  slug?: string;
  initial?: ProjectFormInitial;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [stage, setStage] = useState<"IDEA" | "BUILDING" | "LAUNCHED">(initial?.stage ?? "IDEA");
  const [visibility, setVisibility] = useState<"PUBLIC" | "UNLISTED">(initial?.visibility ?? "PUBLIC");
  const [links, setLinks] = useState<{ label: string; url: string }[]>(initial?.links ?? []);
  const [tags, setTags] = useState<TagDTO[]>(initial?.tags ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (tags.length < 1) return setError("Add at least one tag.");
    setBusy(true);
    const payload = {
      name: name.trim(),
      description: description.trim(),
      stage,
      visibility,
      links: links.filter((l) => l.label && l.url),
      tagIds: tags.map((t) => t.id),
    };
    if (mode === "create") {
      const res = await createProjectAction(payload);
      // create redirects on success; only reach here on failure
      if (res && !res.ok) {
        setError(res.error);
        setBusy(false);
      }
    } else {
      const res = await updateProjectAction(projectId!, payload);
      setBusy(false);
      if (res.ok) {
        notify("Project updated.", "success");
        router.push(`/p/${slug}`);
      } else {
        setError(res.error);
      }
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {error && (
        <p role="alert" className="mono border border-brick bg-brick-soft px-3 py-2 text-xs text-brick">
          {error}
        </p>
      )}
      <Input label="Project name" value={name} onChange={(e) => setName(e.target.value)} required />
      <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Stage"
          value={stage}
          onChange={(e) => setStage(e.target.value as "IDEA" | "BUILDING" | "LAUNCHED")}
          options={Object.entries(STAGE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
        />
        <Select
          label="Visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as "PUBLIC" | "UNLISTED")}
          options={[
            { value: "PUBLIC", label: "Public — shows in discovery" },
            { value: "UNLISTED", label: "Unlisted — link only" },
          ]}
        />
      </div>

      <div>
        <p className="label-mono mb-2">links</p>
        <div className="flex flex-col gap-2">
          {links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={l.label}
                onChange={(e) => setLinks((p) => p.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))}
                placeholder="Label"
                className="w-1/3 border border-hairline bg-white px-2 py-1 text-xs"
              />
              <input
                value={l.url}
                onChange={(e) => setLinks((p) => p.map((x, idx) => (idx === i ? { ...x, url: e.target.value } : x)))}
                placeholder="https://…"
                className="flex-1 border border-hairline bg-white px-2 py-1 text-xs"
              />
              <button type="button" onClick={() => setLinks((p) => p.filter((_, idx) => idx !== i))} aria-label="Remove link" className="mono px-2 text-ink-muted hover:text-brick">
                ×
              </button>
            </div>
          ))}
          {links.length < 6 && (
            <button type="button" onClick={() => setLinks((p) => [...p, { label: "", url: "" }])} className="mono self-start text-xs text-pine hover:underline">
              + add link
            </button>
          )}
        </div>
      </div>

      <TagPicker label="Tags (1+)" selected={tags} onChange={setTags} />

      <div className="flex gap-2 border-t border-hairline pt-4">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : mode === "create" ? "Create project" : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
