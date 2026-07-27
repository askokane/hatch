"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

// Accessible modal dialog: focus-trapped-ish (initial focus), Escape to close,
// backdrop click to close, aria-modal. Kept minimal — no portal library.
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    // Prevent background scroll while open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="w-full max-w-md border border-hairline bg-paper p-5 shadow-lg outline-none"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="mono text-sm font-600">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="mono px-2 text-ink-muted hover:text-ink"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
