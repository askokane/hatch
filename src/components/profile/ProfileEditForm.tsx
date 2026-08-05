"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfileAction } from "@/actions/profile";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { TextArea } from "@/components/ui/TextArea";
import { TagPicker } from "@/components/ui/TagPicker";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { SchoolPicker } from "@/components/profile/SchoolPicker";
import { AvatarPicker } from "@/components/profile/AvatarPicker";
import type { TagDTO } from "@/actions/tags";
import { BASED_IN_MAX, INTENT_KINDS, INTENT_LABELS } from "@/lib/constants";
import { HANDLE_HINT, normalizeHandleInput } from "@/lib/handle";

const YEARS = Array.from({ length: 8 }, (_, i) => 2025 + i);

export type ProfileEditInitial = {
  name: string;
  handle: string;
  /** Identicon fallback — always present, used when there is no uploaded photo. */
  avatarSeed: string;
  avatarAssetId: string | null;
  school: string;
  gradYear: number;
  basedIn: string;
  bio: string;
  links: { label: string; url: string }[];
  skills: TagDTO[];
  learning: TagDTO[];
  intents: { kind: string; note: string }[];
  isDiscoverable: boolean;
  handleLocked: boolean;
};

export function ProfileEditForm({
  initial,
  onDone,
}: {
  initial: ProfileEditInitial;
  onDone: () => void;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState(initial.name);
  const [handle, setHandle] = useState(initial.handle);
  const [school, setSchool] = useState(initial.school);
  const [gradYear, setGradYear] = useState(String(initial.gradYear));
  const [basedIn, setBasedIn] = useState(initial.basedIn);
  const [bio, setBio] = useState(initial.bio);
  const [links, setLinks] = useState<{ label: string; url: string }[]>(initial.links);
  const [skills, setSkills] = useState<TagDTO[]>(initial.skills);
  const [learning, setLearning] = useState<TagDTO[]>(initial.learning);
  const [discoverable, setDiscoverable] = useState(initial.isDiscoverable);
  const [intents, setIntents] = useState(
    INTENT_KINDS.map((k) => {
      const found = initial.intents.find((i) => i.kind === k);
      return { kind: k, note: found?.note ?? "", on: !!found };
    })
  );

  const chosen = intents.filter((i) => i.on);

  async function save() {
    setError(null);
    if (skills.length < 3) return setError("Keep at least 3 skill tags.");
    if (learning.length < 1) return setError("Keep at least 1 learning tag.");
    if (chosen.length < 1) return setError("Keep at least 1 intent.");
    setSubmitting(true);
    const res = await updateProfileAction({
      name: name.trim(),
      handle: handle.trim().toLowerCase(),
      school: school.trim(),
      gradYear: Number(gradYear),
      basedIn: basedIn.trim(),
      bio: bio.trim(),
      links: links.filter((l) => l.label && l.url),
      skillTagIds: skills.map((t) => t.id),
      learningTagIds: learning.map((t) => t.id),
      intents: chosen.map((i) => ({ kind: i.kind, note: i.note.trim() })),
      isDiscoverable: discoverable,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    notify("Profile saved.", "success");
    router.refresh();
    onDone();
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="mono border border-brick bg-brick-soft px-3 py-2 text-xs text-brick">
          {error}
        </p>
      )}

      {/* First, because it is the field a visitor reads before any of the text
          ones. It manages its own persistence — see the note in AvatarPicker. */}
      <AvatarPicker seed={initial.avatarSeed} initialAssetId={initial.avatarAssetId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          label="Handle"
          value={handle}
          onChange={(e) => setHandle(normalizeHandleInput(e.target.value))}
          disabled={initial.handleLocked}
          hint={
            initial.handleLocked
              ? "Locked (7+ days old)."
              : `${HANDLE_HINT} Editable for 7 days after creation.`
          }
        />
        <SchoolPicker value={school} onChange={setSchool} />
        <Select
          label="Graduation year"
          value={gradYear}
          onChange={(e) => setGradYear(e.target.value)}
          options={YEARS.map((y) => ({ value: String(y), label: String(y) }))}
        />
        <Input
          label="Based in"
          value={basedIn}
          onChange={(e) => setBasedIn(e.target.value)}
          placeholder="City, Country"
          maxLength={BASED_IN_MAX}
          hint="Optional. City and country."
        />
      </div>

      <TextArea label="Bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />

      <div>
        <p className="label-mono mb-2">links</p>
        <div className="flex flex-col gap-2">
          {links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={l.label}
                onChange={(e) =>
                  setLinks((prev) => prev.map((p, idx) => (idx === i ? { ...p, label: e.target.value } : p)))
                }
                placeholder="Label"
                className="w-1/3 border border-hairline bg-white px-2 py-1 text-xs"
              />
              <input
                value={l.url}
                onChange={(e) =>
                  setLinks((prev) => prev.map((p, idx) => (idx === i ? { ...p, url: e.target.value } : p)))
                }
                placeholder="https://…"
                className="flex-1 border border-hairline bg-white px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => setLinks((prev) => prev.filter((_, idx) => idx !== i))}
                aria-label="Remove link"
                className="mono px-2 text-ink-muted hover:text-brick"
              >
                ×
              </button>
            </div>
          ))}
          {links.length < 6 && (
            <button
              type="button"
              onClick={() => setLinks((prev) => [...prev, { label: "", url: "" }])}
              className="mono self-start text-xs text-pine hover:underline"
            >
              + add link
            </button>
          )}
        </div>
      </div>

      <TagPicker label="Skills (3+)" kind="SKILL" selected={skills} onChange={setSkills} />
      <TagPicker label="Learning (1+)" selected={learning} onChange={setLearning} learning />

      <div>
        <p className="label-mono mb-2">looking for</p>
        <div className="flex flex-col gap-2">
          {intents.map((intent, idx) => (
            <div key={intent.kind} className="border border-hairline p-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={intent.on}
                  onChange={(e) =>
                    setIntents((prev) => prev.map((p, i) => (i === idx ? { ...p, on: e.target.checked } : p)))
                  }
                />
                <span className="mono text-xs">{INTENT_LABELS[intent.kind]}</span>
              </label>
              {intent.on && (
                <input
                  value={intent.note}
                  onChange={(e) =>
                    setIntents((prev) => prev.map((p, i) => (i === idx ? { ...p, note: e.target.value } : p)))
                  }
                  placeholder="Optional context"
                  maxLength={240}
                  className="mt-2 w-full border border-hairline bg-white px-2 py-1 text-xs"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={discoverable}
          onChange={(e) => setDiscoverable(e.target.checked)}
        />
        <span className="text-xs">Show my profile in discovery</span>
      </label>

      <div className="flex gap-2 border-t border-hairline pt-4">
        <Button onClick={save} disabled={submitting}>
          {submitting ? "Saving…" : "Save changes"}
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
