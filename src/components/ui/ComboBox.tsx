"use client";

import { useEffect, useId, useRef, useState } from "react";

// Free-text input with async suggestions — an editable combobox, not a select.
//
// The distinction is the whole point of the component: the typed value is always
// accepted as-is, and the dropdown only saves you from re-typing something
// someone else already entered. That is what lets a catalog bootstrap itself
// from nothing. A <select> would need the list to be complete before the first
// user arrives, which is exactly the state these catalogs start in.
export function ComboBox({
  label,
  value,
  onChange,
  fetchSuggestions,
  hint,
  placeholder,
  required,
  emptyHint,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  fetchSuggestions: (query: string) => Promise<string[]>;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  // Shown in place of results when the query matches nothing — the moment the
  // user is about to create a catalog entry, which is worth saying out loud.
  emptyHint?: string;
  maxLength?: number;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // The query the current `suggestions` answer, so "not listed yet" is only shown
  // once a search has actually come back empty for what is typed *now* — not
  // during the debounce window on a previous query's results.
  const [searchedFor, setSearchedFor] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  // Set while a suggestion is being applied, so the effect below does not treat
  // the resulting value change as the user typing and immediately re-open.
  const justPickedRef = useRef(false);
  // Held in a ref, and deliberately NOT an effect dependency. Callers pass an
  // inline arrow, so its identity changes on every render; depending on it would
  // make the search effect re-run each time its own setState re-rendered us —
  // a self-feeding request loop, one every 150ms.
  const fetchRef = useRef(fetchSuggestions);
  fetchRef.current = fetchSuggestions;
  const inputRef = useRef<HTMLInputElement>(null);

  const inputId = useId();
  const listId = `${inputId}-list`;

  useEffect(() => {
    if (justPickedRef.current) {
      justPickedRef.current = false;
      return;
    }
    let live = true;
    const q = value.trim();
    if (!q) {
      setSuggestions([]);
      setSearchedFor("");
      return;
    }
    const timer = setTimeout(async () => {
      const results = await fetchRef.current(q);
      if (!live) return;
      // Drop an exact match: offering the user what they already typed is noise.
      const filtered = results.filter((r) => r.toLowerCase() !== q.toLowerCase());
      setSuggestions(filtered);
      setSearchedFor(q);
      setActive(-1);
      // Only surface the list if the user is still in the field. The search is
      // debounced, so it can land after they have already tabbed or clicked
      // away — without this check the dropdown pops open over whatever they
      // moved on to, a fifth of a second after they stopped caring.
      setOpen(document.activeElement === inputRef.current);
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(name: string) {
    justPickedRef.current = true;
    onChange(name);
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      // Only swallow Enter when a suggestion is highlighted — otherwise Enter
      // belongs to the form, not to us.
      e.preventDefault();
      pick(suggestions[active]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showEmpty =
    !!emptyHint &&
    suggestions.length === 0 &&
    value.trim().length > 1 &&
    searchedFor === value.trim();

  return (
    <div className="flex flex-col gap-1" ref={boxRef}>
      <label htmlFor={inputId} className="label-mono">
        {label}
      </label>
      {hint && <p className="text-2xs text-ink-muted">{hint}</p>}
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => {
            // Deferred a tick: clicking a suggestion blurs the input before the
            // option's click handler runs, and closing synchronously here would
            // unmount the option out from under that click. By the next tick
            // focus has landed on the option button — which is inside boxRef —
            // so the list correctly stays open for it.
            window.setTimeout(() => {
              if (!boxRef.current?.contains(document.activeElement)) setOpen(false);
            }, 0);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          required={required}
          maxLength={maxLength}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          className="w-full border border-hairline bg-white px-3 py-2 text-base focus:border-ink"
        />
        {open && (suggestions.length > 0 || showEmpty) && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto border border-hairline bg-white shadow-sm"
          >
            {suggestions.map((s, i) => (
              <li key={s} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onClick={() => pick(s)}
                  onMouseEnter={() => setActive(i)}
                  className={`mono w-full px-3 py-2 text-left text-xs hover:bg-pine-soft ${
                    i === active ? "bg-pine-soft" : ""
                  }`}
                >
                  {s}
                </button>
              </li>
            ))}
            {showEmpty && <li className="px-3 py-2 text-2xs text-ink-muted">{emptyHint}</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
