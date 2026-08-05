"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import { Avatar } from "@/components/ui/Avatar";

// Everything about *you* — as opposed to everywhere you can go — collapsed behind
// your own avatar. This is the change that un-crowds the nav: profile, admin and
// log out were three permanent items competing for attention with the four
// destinations, despite being things you reach a handful of times a session.
//
// The pattern is the one every social product converged on for the same reason,
// and it also gives the header a fixed width: adding an account-scoped item from
// here on costs a menu row, not another item in the primary row.
export function AccountMenu({
  name,
  handle,
  avatarSeed,
  avatarAssetId,
  isAdmin,
}: {
  name: string;
  handle: string;
  avatarSeed: string;
  avatarAssetId: string | null;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Navigating is an implicit dismissal — without this the menu stays open over
  // the page you just asked for.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function items(): HTMLElement[] {
      return Array.from(panelRef.current?.querySelectorAll<HTMLElement>("[data-menu-item]") ?? []);
    }

    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }

    // Declaring role="menu" is a promise about arrow keys, not just a label —
    // a menu you can only Tab through is one that lied about what it is.
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        // Escape must hand focus back to what opened the menu, or a keyboard
        // user is dropped at the top of the document.
        triggerRef.current?.focus();
        return;
      }

      const list = items();
      if (list.length === 0) return;
      const current = list.indexOf(document.activeElement as HTMLElement);

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const delta = e.key === "ArrowDown" ? 1 : -1;
        // Wraps at both ends, so holding one arrow never dead-ends.
        const next = (current + delta + list.length) % list.length;
        list[next]?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        list[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        list[list.length - 1]?.focus();
      } else if (e.key === "Tab") {
        // Tabbing out is a dismissal everywhere else; matching that here keeps
        // the menu from trapping focus behind an invisible boundary.
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Opening with the keyboard should land you *in* the menu. Opening with a
  // mouse should not steal focus into it, but focusing the first item is
  // harmless there and keeps one code path.
  useEffect(() => {
    if (!open) return;
    const first = panelRef.current?.querySelector<HTMLElement>("[data-menu-item]");
    first?.focus();
  }, [open]);

  // No `focus:outline-none` here. The arrow keys move focus programmatically, so
  // the global pine focus ring is the only thing telling a keyboard user where
  // they are — a background tint alone is too weak to carry that on its own.
  const itemClass =
    "mono block w-full px-3 py-2 text-left text-xs text-ink-muted hover:bg-black/[0.04] hover:text-ink focus:bg-black/[0.04] focus:text-ink";

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for @${handle}`}
        className={`flex items-center gap-1.5 border p-0.5 transition-colors ${
          open ? "border-ink" : "border-transparent hover:border-hairline"
        }`}
      >
        <Avatar seed={avatarSeed} assetId={avatarAssetId} size={28} />
        <span aria-hidden="true" className="mono text-2xs text-ink-muted">
          ▾
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full z-40 mt-2 w-52 border border-hairline bg-paper py-1 shadow-lg"
        >
          {/* Identity restated inside the menu: the trigger is an identicon, and
              an identicon alone is not an answer to "which account am I in?" */}
          <div className="border-b border-hairline px-3 pb-2 pt-1">
            <p className="truncate text-xs font-600">{name}</p>
            <p className="mono truncate text-2xs text-ink-muted">@{handle}</p>
          </div>

          {/* Closed on click as well as on pathname change: selecting the page
              you are already on is a no-op navigation, and the menu would
              otherwise sit there open having apparently ignored you. */}
          <Link
            href="/profile"
            role="menuitem"
            data-menu-item
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            profile
          </Link>
          <Link
            href={`/u/${handle}`}
            role="menuitem"
            data-menu-item
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            view public profile
          </Link>
          {isAdmin && (
            <Link
              href="/admin/reports"
              role="menuitem"
              data-menu-item
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              admin
            </Link>
          )}

          <div className="my-1 border-t border-hairline" />

          <form action={logoutAction}>
            <button
              type="submit"
              role="menuitem"
              data-menu-item
              className={`${itemClass} hover:text-brick focus:text-brick`}
            >
              log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
