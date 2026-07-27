"use client";

import { useEffect, useRef, useState } from "react";
import { searchTagsAction, suggestTagAction, type TagDTO } from "@/actions/tags";
import { TagBadge } from "./TagBadge";

// Autocomplete tag picker. Only lets the user select tags that resolve to a Tag
// row (via searchTagsAction). Typing something with no match offers to log a
// TagSuggestion — it never fabricates a tag.
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
  const [suggested, setSuggested] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await searchTagsAction(q, kind);
      if (!active) return;
      if (res.ok) {
        const selectedIds = new Set(selected.map((s) => s.id));
        setResults(res.data.filter((r) => !selectedIds.has(r.id)));
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
    onChange([...selected, tag]);
    setQuery("");
    setResults([]);
    setOpen(false);
    setSuggested(false);
  }

  function remove(id: string) {
    onChange(selected.filter((t) => t.id !== id));
  }

  async function suggest() {
    await suggestTagAction(query.trim(), kind);
    setSuggested(true);
  }

  const inputId = `tagpicker-${label.replace(/\s+/g, "-").toLowerCase()}`;

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
            setSuggested(false);
          }}
          onFocus={() => query && setOpen(true)}
          placeholder="Search tags…"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${inputId}-list`}
          className="w-full border border-hairline bg-white px-3 py-2 text-base focus:border-ink"
        />
        {open && (results.length > 0 || query.trim().length > 1) && (
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
            {results.length === 0 && query.trim().length > 1 && (
              <li className="px-3 py-2 text-2xs text-ink-muted">
                {suggested ? (
                  <span>Thanks — “{query.trim()}” was sent for review.</span>
                ) : (
                  <button type="button" onClick={suggest} className="mono text-pine hover:underline">
                    No match. Suggest “{query.trim()}” for the taxonomy →
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
