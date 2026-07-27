"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import { UnreadBadge } from "./UnreadBadge";

// Top nav. Client component so it can host the unread-count poller and highlight
// the active route. Auth state is passed from the server layout.
export function NavBar({
  isAuthed,
  hasProfile,
  isAdmin,
}: {
  isAuthed: boolean;
  hasProfile: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname();

  const link = (href: string, label: string, extra?: React.ReactNode) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`mono px-2 py-1 text-xs ${active ? "text-ink underline underline-offset-4" : "text-ink-muted hover:text-ink"}`}
      >
        {label}
        {extra}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-paper/95 backdrop-blur">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:px-3 focus:py-1 focus:text-xs"
      >
        Skip to content
      </a>
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href={isAuthed ? "/discover" : "/"} className="mono text-sm font-600 tracking-tight">
          <span className="text-pine">[</span>HATCH<span className="text-pine">]</span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-1">
          {isAuthed && hasProfile && (
            <>
              {link("/discover", "discover")}
              {link("/requests", "requests")}
              {link(
                "/messages",
                "messages",
                <UnreadBadge />
              )}
              {link("/profile", "profile")}
              {isAdmin && link("/admin/reports", "admin")}
            </>
          )}
          {isAuthed && !hasProfile && link("/onboarding", "finish setup")}
          {!isAuthed && (
            <>
              {link("/login", "log in")}
              <Link
                href="/signup"
                className="mono border border-pine bg-pine px-3 py-1 text-xs text-paper hover:bg-[#255c41]"
              >
                sign up
              </Link>
            </>
          )}
          {isAuthed && (
            <form action={logoutAction}>
              <button type="submit" className="mono px-2 py-1 text-xs text-ink-muted hover:text-brick">
                log out
              </button>
            </form>
          )}
        </nav>
      </div>
    </header>
  );
}
