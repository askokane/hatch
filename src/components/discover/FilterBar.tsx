"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { INTENT_KINDS, INTENT_LABELS, STAGE_LABELS } from "@/lib/constants";

// URL-driven filter controls. Changing a filter rewrites the query string, which
// re-runs the server component with the new filters.
//
// Everything here follows one interaction model: you change a control, the
// results follow. There is no submit step, because a search box that only works
// once you find the button next to it is the thing that made this surface feel
// broken — people typed, saw nothing happen, and stopped.
//
// Three rules make search-as-you-type safe here:
//   1. Text fields debounce (DEBOUNCE_MS) so a word costs one query, not six.
//   2. Navigation is `replace`, not `push` — refining a search must not bury the
//      page you arrived from under twenty history entries.
//   3. It runs inside a transition, so the previous results stay on screen and
//      dim instead of the page blanking out between queries.
const DEBOUNCE_MS = 300;

// Field normalizers, at module scope so their identity is stable across renders
// and the debounce effect below can depend on them.
//
// Returning null means "not committable yet": the value is mid-edit, and putting
// it in the URL would run a query nobody asked for. A half-typed year is the case
// that matters — "20" is a perfectly valid number that matches nobody, so
// committing it empties the results between the second and fourth keystroke.
const asTyped = (v: string) => v;
const asYear = (v: string) => {
  const digits = v.replace(/\D/g, "").slice(0, 4);
  if (digits === "") return "";
  return digits.length === 4 ? digits : null;
};

// A text field whose value lives in the URL.
//
// Typing updates the field immediately and the URL after a pause. A URL change
// from anywhere else — the back button, a filter chip removed, "clear all" —
// flows back into the field, which is what the old `defaultValue` inputs could
// not do: they went on displaying a filter that had already been cleared.
function useUrlField(
  key: string,
  urlValue: string,
  apply: (patch: Record<string, string>) => void,
  normalize: (v: string) => string | null
) {
  const [value, setValue] = useState(urlValue);
  // The last value this field and the URL agreed on. Held in a ref so an incoming
  // URL change can be told apart from one this field itself just made.
  const settled = useRef(urlValue);

  useEffect(() => {
    if (urlValue !== settled.current) {
      settled.current = urlValue;
      setValue(urlValue);
    }
  }, [urlValue]);

  useEffect(() => {
    const next = normalize(value);
    if (next === null || next === settled.current) return;
    const timer = setTimeout(() => {
      settled.current = next;
      apply({ [key]: next });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, key, apply, normalize]);

  // Commit without waiting out the debounce — for Enter and for the clear
  // buttons, where the user has already said they are done.
  const flush = useCallback(
    (override?: string) => {
      if (override !== undefined) setValue(override);
      const next = normalize(override ?? value);
      if (next === null || next === settled.current) return;
      settled.current = next;
      apply({ [key]: next });
    },
    [value, key, apply, normalize]
  );

  return { value, setValue, flush };
}

export function PeopleSearch({
  schools,
  resultCount,
  truncated,
  children,
}: {
  schools: string[];
  resultCount: number;
  // True when the result page hit its cap, so "60 people" would be a lie.
  truncated: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const paramsString = params.toString();
  // The query string as this component believes it to be, including edits the
  // router has not finished applying yet. Two filters changed inside one
  // transition then both land, instead of the second overwriting the first from
  // a stale `params`.
  const draft = useRef(paramsString);
  useEffect(() => {
    draft.current = paramsString;
  }, [paramsString]);

  const apply = useCallback(
    (patch: Record<string, string>) => {
      const p = new URLSearchParams(draft.current);
      p.set("tab", "people");
      for (const [key, value] of Object.entries(patch)) {
        if (value) p.set(key, value);
        else p.delete(key);
      }
      draft.current = p.toString();
      startTransition(() => router.replace(`/discover?${p.toString()}`, { scroll: false }));
    },
    [router]
  );

  const qParam = params.get("q") ?? "";
  const schoolParam = params.get("school") ?? "";
  const yearParam = params.get("gradYear") ?? "";
  const intent = params.get("intent") ?? "";

  const q = useUrlField("q", qParam, apply, asTyped);
  const school = useUrlField("school", schoolParam, apply, asTyped);
  const gradYear = useUrlField("gradYear", yearParam, apply, asYear);

  // How many of the narrowing filters are set. The text query is not one of
  // them: it has its own field in plain sight.
  const filterCount = [schoolParam, yearParam, intent].filter(Boolean).length;

  // The filters start folded away — most searches are a name or a skill, and
  // three controls nobody asked for made the surface look like a form to fill in
  // rather than a box to type in.
  //
  // They start OPEN when the URL arrives with filters already set, which is what
  // a shared or bookmarked link looks like: a filter that is narrowing your
  // results should not also be hidden behind a click.
  const [showFilters, setShowFilters] = useState(filterCount > 0);

  // "/" focuses the search box from anywhere on the page — the shortcut people
  // already expect from every other search surface they use.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (el instanceof HTMLElement && el.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Every filter currently narrowing the results, as removable chips. Without
  // this there was no way to see what was still applied — the commonest way to
  // end up staring at an empty page was a filter set three navigations ago.
  const active: { key: string; label: string; clear: () => void }[] = [];
  if (qParam) active.push({ key: "q", label: `"${qParam}"`, clear: () => q.flush("") });
  if (schoolParam) {
    active.push({ key: "school", label: schoolParam, clear: () => school.flush("") });
  }
  if (yearParam) {
    active.push({ key: "gradYear", label: `class of ${yearParam}`, clear: () => gradYear.flush("") });
  }
  if (intent) {
    active.push({
      key: "intent",
      label: INTENT_LABELS[intent] ?? intent,
      clear: () => apply({ intent: "" }),
    });
  }

  function clearAll() {
    q.setValue("");
    school.setValue("");
    gradYear.setValue("");
    apply({ q: "", school: "", gradYear: "", intent: "" });
  }

  // A partially typed year is deliberately held back from the URL, so say so
  // rather than leaving the results looking stuck.
  const yearPending = asYear(gradYear.value) === null;

  return (
    <div className="flex flex-col gap-4">
      <form
        role="search"
        aria-label="Search people"
        className="flex flex-col gap-3 border border-hairline bg-white p-3"
        onSubmit={(e) => {
          // Enter commits immediately instead of waiting out the debounce.
          e.preventDefault();
          q.flush();
          school.flush();
          gradYear.flush();
        }}
      >
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="6" cy="6" r="4.25" />
              <path d="M9.2 9.2 12.5 12.5" strokeLinecap="round" />
            </svg>
          </span>
          <input
            ref={inputRef}
            name="q"
            type="text"
            value={q.value}
            onChange={(e) => q.setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && q.value) {
                e.preventDefault();
                q.flush("");
              }
            }}
            autoComplete="off"
            aria-label="Search people by name, handle, skill, school, or bio"
            aria-describedby="people-search-count"
            placeholder="Search people — name, @handle, skill, school…"
            className="w-full border border-hairline bg-white py-2 pl-9 pr-20 text-base focus:border-ink"
          />
          {q.value ? (
            <button
              type="button"
              onClick={() => {
                q.flush("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="mono absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-ink-muted hover:text-ink"
            >
              clear ×
            </button>
          ) : (
            <kbd
              aria-hidden
              className="mono pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 border border-hairline px-1.5 py-0.5 text-2xs text-ink-muted sm:block"
            >
              /
            </kbd>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-controls="people-filters"
            className={`mono border px-2 py-1 text-2xs ${
              showFilters || filterCount > 0
                ? "border-ink text-ink"
                : "border-hairline text-ink-muted hover:border-ink hover:text-ink"
            }`}
          >
            <span aria-hidden className="mr-1">
              {showFilters ? "▾" : "▸"}
            </span>
            filters
            {/* The count is what makes folding these away safe: a filter that is
                narrowing the results stays legible while its control is hidden. */}
            {filterCount > 0 && <span className="ml-1 text-pine">[{filterCount}]</span>}
          </button>
        </div>

        {/* Toggled with a class rather than unmounted, so the panel keeps its
            id for aria-controls and the school datalist stays in the document.
            Aligned at the top, not the bottom: the three groups have different
            control heights, and bottom-aligning them staggered their labels. */}
        <div
          id="people-filters"
          className={`flex-wrap items-start gap-3 border-t border-hairline pt-3 ${
            showFilters ? "flex" : "hidden"
          }`}
        >
          <label className="flex flex-col gap-1">
            <span className="label-mono">school</span>
            {/* Typeahead over the schools already on the platform, but still a
                free-text field: `school` is a `contains` match server-side, so a
                partial name works and a school missing from the list is not a
                dead end. A <select> of every campus was neither. */}
            <input
              value={school.value}
              onChange={(e) => school.setValue(e.target.value)}
              list="people-school-options"
              autoComplete="off"
              placeholder="Any school"
              className="w-52 border border-hairline bg-white px-2 py-1.5 text-xs focus:border-ink"
            />
            <datalist id="people-school-options">
              {schools.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>

          <label className="flex flex-col gap-1">
            <span className="label-mono">grad year</span>
            <input
              value={gradYear.value}
              onChange={(e) => gradYear.setValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              placeholder="Any"
              aria-describedby={yearPending ? "grad-year-hint" : undefined}
              className="w-24 border border-hairline bg-white px-2 py-1.5 text-xs focus:border-ink"
            />
          </label>

          <fieldset className="flex flex-col gap-1">
            <legend className="label-mono">looking for</legend>
            {/* Five options, one click each, state visible without opening
                anything — a dropdown was hiding both the choices and the answer. */}
            <div className="flex flex-wrap gap-1">
              {INTENT_KINDS.map((k) => {
                const on = intent === k;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => apply({ intent: on ? "" : k })}
                    // Same padding and type size as the two text fields beside
                    // them, so the three controls sit on one line at one height.
                    className={`mono border px-3 py-1.5 text-xs ${
                      on
                        ? "border-pine bg-pine text-paper"
                        : "border-hairline bg-white text-ink-muted hover:border-ink hover:text-ink"
                    }`}
                  >
                    {INTENT_LABELS[k]}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        {showFilters && yearPending && (
          <p id="grad-year-hint" className="text-2xs text-ink-muted">
            Enter all four digits of a graduation year to filter by it.
          </p>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <p id="people-search-count" aria-live="polite" className="mono text-2xs text-ink-muted">
          {isPending
            ? "searching…"
            : truncated
              ? `first ${resultCount} matches — narrow it down to see the rest`
              : `${resultCount} ${resultCount === 1 ? "person" : "people"}`}
        </p>
        {active.map((f) => (
          <span
            key={f.key}
            className="mono inline-flex items-center gap-1 border border-hairline bg-white px-2 py-0.5 text-2xs"
          >
            {f.label}
            <button
              type="button"
              onClick={f.clear}
              aria-label={`Remove filter ${f.label}`}
              className="ml-0.5 text-ink-muted hover:text-brick"
            >
              ×
            </button>
          </span>
        ))}
        {active.length > 1 && (
          <button
            type="button"
            onClick={clearAll}
            className="mono text-2xs text-ink-muted underline hover:text-ink"
          >
            clear all
          </button>
        )}
      </div>

      {/* Stale results stay visible and dim while the next query runs, so the
          page never flashes empty on its way to an answer. */}
      <div
        aria-busy={isPending}
        className={`transition-opacity duration-150 ${isPending ? "opacity-50" : "opacity-100"}`}
      >
        {children}
      </div>
    </div>
  );
}

// Rendered inside the empty state, which is server-built, so the reset has to be
// reachable from outside the search component above.
export function ClearPeopleFiltersButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.replace("/discover?tab=people", { scroll: false })}
      className="mono border border-pine bg-pine px-3 py-1.5 text-xs text-paper hover:bg-[#255c41]"
    >
      clear all filters
    </button>
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
