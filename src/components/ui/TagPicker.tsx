"use client";

import { useEffect, useRef, useState } from "react";
import { searchTagsAction, createTagAction, type TagDTO } from "@/actions/tags";
import { TagBadge } from "./TagBadge";

// Autocomplete tag picker over the shared taxonomy.
//
// Typing something with no match offers to ADD it. The added tag is a real Tag
// row, so the next person to start typing it gets it as a suggestion instead of
// creating a parallel copy — which is the entire reason a skill picker is worth
// having over a free-text field. Selection still only ever holds real rows; the
// creation round-trips through the server before anything enters `selected`.
export function TagPicker({
  label,
  kind,
  selected,
  onChange,
  learning = false,
}: {
  label: string;
  kind?: "SKILL" | "INTEREST" | "DOMAIN";
  selected: TagDTO[];
  onChange: (tags: TagDTO[]) => void;
  learning?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TagDTO[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // The query the current `results` actually answer. "No match, add it" is gated
  // on this matching what is typed now, so the offer to CREATE a tag can never
  // appear during the debounce window on results belonging to an older query —
  // which is how someone ends up creating a duplicate of a tag the search was
  // about to find.
  const [searchedFor, setSearchedFor] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearchedFor("");
      return;
    }
    const t = setTimeout(async () => {
      const res = await searchTagsAction(q, kind);
      if (!active) return;
      if (res.ok) {
        const selectedIds = new Set(selected.map((s) => s.id));
        setResults(res.data.filter((r) => !selectedIds.has(r.id)));
        setSearchedFor(q);
        setOpen(true);
      }
    }, 150);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, kind, selected]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function add(tag: TagDTO) {
    // Guard against the create path returning a tag that is already selected —
    // createTagAction is idempotent by slug, so typing an existing tag with
    // different punctuation resolves to a row that may already be in the list.
    if (!selected.some((t) => t.id === tag.id)) onChange([...selected, tag]);
    setQuery("");
    setResults([]);
    setOpen(false);
    setCreateError(null);
  }

  function remove(id: string) {
    onChange(selected.filter((t) => t.id !== id));
  }

  async function create() {
    setCreating(true);
    setCreateError(null);
    const res = await createTagAction(query.trim(), kind);
    setCreating(false);
    if (!res.ok) {
      setCreateError(res.error);
      return;
    }
    add(res.data);
  }

  const inputId = `tagpicker-${label.replace(/\s+/g, "-").toLowerCase()}`;

  // Offer creation only for a query the search has already come back empty on.
  const canCreate = results.length === 0 && query.trim().length > 1 && searchedFor === query.trim();

  return (
    <div className="flex flex-col gap-1" ref={boxRef}>
      <label htmlFor={inputId} className="label-mono">
        {label}
      </label>
      <div className="flex flex-wrap gap-1">
        {selected.map((t) => (
          <TagBadge key={t.id} label={t.label} learning={learning} onRemove={() => remove(t.id)} />
        ))}
      </div>
      <div className="relative">
        <input
          id={inputId}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCreateError(null);
          }}
          onFocus={() => query && setOpen(true)}
          placeholder="Search or add a tag…"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${inputId}-list`}
          className="w-full border border-hairline bg-white px-3 py-2 text-base focus:border-ink"
        />
        {open && (results.length > 0 || canCreate) && (
          <ul
            id={`${inputId}-list`}
            role="listbox"
            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto border border-hairline bg-white shadow-sm"
          >
            {results.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => add(t)}
                  className="mono flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-pine-soft"
                >
                  <span>{t.label}</span>
                  <span className="text-2xs text-ink-muted">{t.kind.toLowerCase()}</span>
                </button>
              </li>
            ))}
            {canCreate && (
              <li className="px-3 py-2 text-2xs text-ink-muted">
                {createError ? (
                  <span className="text-brick">{createError}</span>
                ) : (
                  <button
                    type="button"
                    onClick={create}
                    disabled={creating}
                    className="mono text-pine hover:underline disabled:opacity-60"
                  >
                    {creating ? "Adding…" : `No match. Add “${query.trim()}” →`}
                  </button>
                )}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
