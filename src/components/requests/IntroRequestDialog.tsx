"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createIntroRequestAction } from "@/actions/intro-requests";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { NOTE_MIN, NOTE_MAX } from "@/lib/constants";
import type { IntroContextOption } from "@/components/profile/ProfileActions";

type Ctx = { roles: IntroContextOption[]; projects: IntroContextOption[]; intents: IntroContextOption[] };

export function IntroRequestDialog({
  targetProfileId,
  targetName,
  contexts,
  onClose,
  presetContext,
}: {
  targetProfileId: string;
  targetName: string;
  contexts: Ctx;
  onClose: () => void;
  presetContext?: { type: "ROLE" | "PROJECT" | "INTENT"; id: string };
}) {
  const router = useRouter();
  const { notify } = useToast();

  // Build a flat list of selectable contexts, tagged with their type.
  const options = useMemo(() => {
    const opts: { value: string; label: string; type: "ROLE" | "PROJECT" | "INTENT"; id: string }[] = [];
    contexts.roles.forEach((r) => opts.push({ value: `ROLE:${r.id}`, label: r.label, type: "ROLE", id: r.id }));
    contexts.projects.forEach((p) =>
      opts.push({ value: `PROJECT:${p.id}`, label: p.label, type: "PROJECT", id: p.id })
    );
    contexts.intents.forEach((i) =>
      opts.push({ value: `INTENT:${i.id}`, label: i.label, type: "INTENT", id: i.id })
    );
    return opts;
  }, [contexts]);

  const initialValue = presetContext
    ? `${presetContext.type}:${presetContext.id}`
    : options[0]?.value ?? "";
  const [selected, setSelected] = useState(initialValue);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const noteLen = note.trim().length;
  const noteValid = noteLen >= NOTE_MIN && noteLen <= NOTE_MAX;

  async function submit() {
    setError(null);
    const opt = options.find((o) => o.value === selected);
    if (!opt) {
      setError("Choose what this intro is about.");
      return;
    }
    if (!noteValid) {
      setError(`Your note must be ${NOTE_MIN}–${NOTE_MAX} characters (currently ${noteLen}).`);
      return;
    }
    setBusy(true);
    const res = await createIntroRequestAction({
      toProfileId: targetProfileId,
      contextType: opt.type,
      contextId: opt.id,
      note: note.trim(),
    });
    setBusy(false);
    if (res.ok) {
      notify(`Intro request sent to ${targetName}.`, "success");
      router.refresh();
      onClose();
    } else {
      setError(res.error);
    }
  }

  return (
    <Modal title={`Request intro — ${targetName}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="mono border border-brick bg-brick-soft px-3 py-2 text-xs text-brick">
            {error}
          </p>
        )}
        <Select
          label="What's this about?"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          options={options.map((o) => ({ value: o.value, label: o.label }))}
        />
        <div>
          <TextArea
            label="Your note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={5}
            hint={`Say why you're reaching out. ${NOTE_MIN}–${NOTE_MAX} characters.`}
            error={note.length > 0 && !noteValid ? `${noteLen}/${NOTE_MIN} min` : undefined}
          />
          <p className={`mt-1 text-2xs ${noteValid ? "text-ink-muted" : "text-brick"}`}>
            {noteLen} / {NOTE_MAX}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy}>
            {busy ? "Sending…" : "Send request"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
