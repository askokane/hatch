"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { INTENT_KINDS, INTENT_LABELS, STAGE_LABELS } from "@/lib/constants";

// URL-driven filter controls. Changing a filter updates the query string, which
// re-runs the server component with the new filters. Text search is a form submit.
export function PeopleFilterBar({ schools }: { schools: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const set = (key: string, value: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("tab", "people");
    if (value) p.set(key, value);
    else p.delete(key);
    router.push(`/discover?${p.toString()}`);
  };

  return (
    <form
      className="flex flex-wrap items-end gap-2 border border-hairline bg-white p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q");
        set("q", typeof q === "string" ? q : "");
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="label-mono">search bio</span>
        <input
          name="q"
          defaultValue={params.get("q") ?? ""}
          placeholder="e.g. iOS, climate, founder"
          className="border border-hairline bg-white px-2 py-1 text-xs"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label-mono">school</span>
        <select
          defaultValue={params.get("school") ?? ""}
          onChange={(e) => set("school", e.target.value)}
          className="border border-hairline bg-white px-2 py-1 text-xs"
        >
          <option value="">Any</option>
          {schools.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="label-mono">grad year</span>
        <input
          defaultValue={params.get("gradYear") ?? ""}
          onBlur={(e) => set("gradYear", e.target.value)}
          inputMode="numeric"
          placeholder="Any"
          className="w-20 border border-hairline bg-white px-2 py-1 text-xs"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label-mono">looking for</span>
        <select
          defaultValue={params.get("intent") ?? ""}
          onChange={(e) => set("intent", e.target.value)}
          className="border border-hairline bg-white px-2 py-1 text-xs"
        >
          <option value="">Any</option>
          {INTENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {INTENT_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="mono border border-pine bg-pine px-3 py-1 text-xs text-paper">
        Search
      </button>
    </form>
  );
}

export function ProjectFilterBar() {
  const router = useRouter();
  const params = useSearchParams();
  const set = (key: string, value: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("tab", "projects");
    if (value) p.set(key, value);
    else p.delete(key);
    router.push(`/discover?${p.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-2 border border-hairline bg-white p-3">
      <label className="flex flex-col gap-1">
        <span className="label-mono">stage</span>
        <select
          defaultValue={params.get("stage") ?? ""}
          onChange={(e) => set("stage", e.target.value)}
          className="border border-hairline bg-white px-2 py-1 text-xs"
        >
          <option value="">Any stage</option>
          {Object.entries(STAGE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
