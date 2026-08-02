"use client";

import { useState } from "react";
import { completeOnboardingAction } from "@/actions/onboarding";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { TextArea } from "@/components/ui/TextArea";
import { TagPicker } from "@/components/ui/TagPicker";
import { Button } from "@/components/ui/Button";
import { TagBadge } from "@/components/ui/TagBadge";
import { SchoolPicker } from "@/components/profile/SchoolPicker";
import type { TagDTO } from "@/actions/tags";
import { BASED_IN_MAX, INTENT_KINDS, INTENT_LABELS } from "@/lib/constants";
import { HANDLE_CHARSET_MESSAGE, HANDLE_HINT, HANDLE_PATTERN, normalizeHandleInput } from "@/lib/handle";

const YEARS = Array.from({ length: 8 }, (_, i) => 2025 + i);

type IntentChoice = { kind: string; note: string; on: boolean };

export function OnboardingWizard({ email }: { email: string }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [school, setSchool] = useState("");
  const [gradYear, setGradYear] = useState(String(new Date().getFullYear() + 2));
  const [basedIn, setBasedIn] = useState("");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState<TagDTO[]>([]);
  const [learning, setLearning] = useState<TagDTO[]>([]);
  const [intents, setIntents] = useState<IntentChoice[]>(
    INTENT_KINDS.map((k) => ({ kind: k, note: "", on: false }))
  );

  const chosenIntents = intents.filter((i) => i.on);

  function validateStep(): string | null {
    if (step === 0) {
      if (!name.trim()) return "Enter your name.";
      if (handle.trim().length < 3) return "Choose a handle (3+ characters).";
      if (!HANDLE_PATTERN.test(handle.trim().toLowerCase())) return HANDLE_CHARSET_MESSAGE;
      if (handle.startsWith("_") || handle.endsWith("_"))
        return "Handle cannot start or end with an underscore.";
      if (school.trim().length < 2) return "Enter your school.";
    }
    if (step === 1) {
      if (skills.length < 3) return "Add at least 3 skill tags.";
      if (learning.length < 1) return "Add at least 1 learning tag.";
    }
    if (step === 2) {
      if (chosenIntents.length < 1) return "Choose at least one thing you're looking for.";
    }
    return null;
  }

  function next() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((s) => s + 1);
  }

  async function submit() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await completeOnboardingAction({
      name: name.trim(),
      handle: handle.trim().toLowerCase(),
      school: school.trim(),
      gradYear: Number(gradYear),
      basedIn: basedIn.trim(),
      bio: bio.trim(),
      skillTagIds: skills.map((t) => t.id),
      learningTagIds: learning.map((t) => t.id),
      intents: chosenIntents.map((i) => ({ kind: i.kind, note: i.note.trim() })),
    });
    // On success the action redirects (throws); we only get here on failure.
    if (res && !res.ok) {
      setError(res.error);
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        {["Identity", "Skills", "Intent"].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`mono flex h-6 w-6 items-center justify-center border text-2xs ${
                i === step
                  ? "border-pine bg-pine text-paper"
                  : i < step
                    ? "border-pine text-pine"
                    : "border-hairline text-ink-muted"
              }`}
            >
              {i + 1}
            </span>
            <span className={`mono text-xs ${i === step ? "text-ink" : "text-ink-muted"}`}>{label}</span>
            {i < 2 && <span className="text-hairline">—</span>}
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="mono mb-4 border border-brick bg-brick-soft px-3 py-2 text-xs text-brick">
          {error}
        </p>
      )}

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-ink-muted">Signed in as {email}</p>
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input
            label="Handle"
            value={handle}
            onChange={(e) => setHandle(normalizeHandleInput(e.target.value))}
            hint={`Your public @handle. ${HANDLE_HINT} Locked after 7 days.`}
            required
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
            hint="Optional. Where you're based — city and country is plenty."
          />
          <TextArea
            label="Bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            hint="A sentence or two on what you build. You can edit this later."
          />
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-6">
          <div>
            <TagPicker label="Skills you have (3+)" kind="SKILL" selected={skills} onChange={setSkills} />
            <p className="mt-1 text-2xs text-ink-muted">{skills.length} selected</p>
          </div>
          <div>
            <TagPicker
              label="Learning / want to grow (1+)"
              selected={learning}
              onChange={setLearning}
              learning
            />
            <p className="mt-1 text-2xs text-ink-muted">{learning.length} selected</p>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <p className="label-mono">[ what are you looking for? ]</p>
          {intents.map((intent, idx) => (
            <div key={intent.kind} className="border border-hairline p-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={intent.on}
                  onChange={(e) =>
                    setIntents((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, on: e.target.checked } : p))
                    )
                  }
                />
                <span className="mono text-xs">{INTENT_LABELS[intent.kind]}</span>
              </label>
              {intent.on && (
                <input
                  value={intent.note}
                  onChange={(e) =>
                    setIntents((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, note: e.target.value } : p))
                    )
                  }
                  placeholder="Optional: one line of context"
                  className="mt-2 w-full border border-hairline bg-white px-2 py-1 text-xs"
                  maxLength={240}
                />
              )}
            </div>
          ))}
          <div className="mt-2 flex flex-wrap gap-1">
            {chosenIntents.map((i) => (
              <TagBadge key={i.kind} label={INTENT_LABELS[i.kind]!} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-between border-t border-hairline pt-4">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Back
        </Button>
        {step < 2 ? (
          <Button onClick={next}>Continue</Button>
        ) : (
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Creating profile…" : "Finish setup"}
          </Button>
        )}
      </div>
    </div>
  );
}
