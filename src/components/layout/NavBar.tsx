"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import { CountBadge } from "@/components/ui/CountBadge";
import { AccountMenu } from "./AccountMenu";
import { useNavCounts } from "./useNavCounts";

// Top nav. Client component so it can host the badge poller and highlight the
// active route. Auth state is passed from the server layout.
//
// The row is deliberately short. It used to carry seven equal-weight items —
// feed, discover, requests, messages, profile, admin, log out — which read as a
// list of everything the app can do rather than a way to get anywhere. Only the
// first four are places you move *between*; the rest are account chores, and
// they now live under your avatar (see AccountMenu). What's left is four
// destinations and your face, which is the shape every social product settles on
// because it's the one you can scan without reading.
export function NavBar({
  isAuthed,
  hasProfile,
  isAdmin,
  name,
  handle,
  avatarSeed,
}: {
  isAuthed: boolean;
  hasProfile: boolean;
  isAdmin: boolean;
  name: string | null;
  handle: string | null;
  avatarSeed: string | null;
}) {
  const pathname = usePathname();
  const { unreadMessages, pendingRequests } = useNavCounts(isAuthed && hasProfile);

  const link = (href: string, label: string, extra?: React.ReactNode) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`mono border-b-2 px-2 py-1 text-xs transition-colors sm:px-2.5 ${
          active
            ? "border-pine text-ink"
            : "border-transparent text-ink-muted hover:border-hairline hover:text-ink"
        }`}
      >
        {label}
        {extra}
      </Link>
    );
  };

  // Signed in and onboarded: the four destinations, and nothing else.
  const primary = isAuthed && hasProfile && (
    <>
      {link("/feed", "feed")}
      {link("/discover", "discover")}
      {link(
        "/requests",
        "requests",
        <CountBadge count={pendingRequests} label="pending intro request" />
      )}
      {link("/messages", "messages", <CountBadge count={unreadMessages} label="unread message" />)}
    </>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-paper/95 backdrop-blur">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-white focus:px-3 focus:py-1 focus:text-xs"
      >
        Skip to content
      </a>

      {/* One flex row that wraps into two on narrow screens. The links are
          ordered out of source order rather than rendered twice: a second copy
          for mobile would put two elements with the same accessible name in the
          page, which is a worse deal for anyone navigating by that name than the
          ordering utilities cost us here. */}
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-2 px-4 py-2.5 sm:flex-nowrap sm:px-6 sm:py-3">
        <Link
          href={isAuthed ? "/feed" : "/"}
          className="mono order-1 mr-auto text-sm font-600 tracking-tight sm:mr-0"
        >
          <span className="text-pine">[</span>HATCH<span className="text-pine">]</span>
        </Link>

        {primary && (
          <nav
            aria-label="Primary"
            className="order-3 mt-1.5 flex w-full items-center justify-between border-t border-hairline pt-1.5 sm:order-2 sm:ml-auto sm:mt-0 sm:w-auto sm:justify-end sm:gap-1 sm:border-0 sm:pt-0"
          >
            {primary}
          </nav>
        )}

        <div className="order-2 flex shrink-0 items-center gap-2 sm:order-3 sm:ml-4">
          {isAuthed && hasProfile && handle && avatarSeed ? (
            <AccountMenu
              name={name ?? handle}
              handle={handle}
              avatarSeed={avatarSeed}
              isAdmin={isAdmin}
            />
          ) : isAuthed ? (
            // Mid-onboarding: there is no profile to hang a menu off yet, so the
            // one thing left to do is the only thing offered.
            <>
              {link("/onboarding", "finish setup")}
              <LogOutButton />
            </>
          ) : (
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
        </div>
      </div>
    </header>
  );
}

// Only reachable while onboarding is incomplete; everyone else logs out from the
// account menu.
function LogOutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="mono px-2 py-1 text-xs text-ink-muted hover:text-brick">
        log out
      </button>
    </form>
  );
}
