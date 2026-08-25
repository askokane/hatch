"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/ToastProvider";
import { listShareTargetsAction, shareToThreadAction, type ShareTarget } from "@/actions/shares";
import type { ShareKind } from "@/lib/validation/share.schema";

// The share sheet: pick a conversation, send the card.
//
// Every row here is someone whose intro request was accepted, or who accepted
// one — so the list is short by construction and there is no "search all users"
// step. That is a property of the product, not a shortcut: a share cannot be a
// way to reach someone who has not already agreed to be reachable.
//
// Rows are sent INDEPENDENTLY rather than through a select-then-confirm flow.
// Sharing to three people is three taps with three confirmations, instead of a
// multi-select whose failure mode is "two of them worked". Each row owns its own
// outcome and says so.

type RowState = "idle" | "sending" | "sent";

export function ShareDialog({
  kind,
  targetId,
  targetLabel,
  onClose,
}: {
  kind: ShareKind;
  targetId: string;
  /** What is being shared, echoed at the top so the sheet is never ambiguous. */
  targetLabel: string;
  onClose: () => void;
}) {
  const { notify } = useToast();
  const [targets, setTargets] = useState<ShareTarget[] | null>(null);
  const [query, setQuery] = useState("");
  const [states, setStates] = useState<Record<string, RowState>>({});

  useEffect(() => {
    let live = true;
    listShareTargetsAction()
      .then((res) => {
        if (!live) return;
        // A failure here leaves an empty list rather than a broken dialog; the
        // empty state below already says the useful thing.
        setTargets(res.ok ? res.data : []);
      })
      .catch(() => live && setTargets([]));
    return () => {
      live = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!targets) return [];
    if (!q) return targets;
    return targets.filter(
      (t) => t.name.toLowerCase().includes(q) || t.handle.toLowerCase().includes(q)
    );
  }, [targets, query]);

  async function send(target: ShareTarget) {
    if (states[target.threadId]) return;
    setStates((s) => ({ ...s, [target.threadId]: "sending" }));
    const res = await shareToThreadAction(target.threadId, kind, targetId);
    if (res.ok) {
      setStates((s) => ({ ...s, [target.threadId]: "sent" }));
    } else {
      // Back to idle, not to a per-row error line: the refusal wording matters
      // (a block says something different from a deleted target) and the toast
      // is where this app already puts wording that matters.
      setStates((s) => {
        const next = { ...s };
        delete next[target.threadId];
        return next;
      });
      notify(res.error, "error");
    }
  }

  return (
    <Modal title={`Share ${targetLabel}`} onClose={onClose}>
      <p className="mono mb-3 text-2xs text-ink-muted">
        Sending <span className="text-ink">{targetLabel}</span> as a card. Only people you are
        already connected with are listed.
      </p>

      {targets === null ? (
        <p className="mono py-8 text-center text-xs text-ink-muted">loading conversations…</p>
      ) : targets.length === 0 ? (
        <div className="border border-hairline bg-paper p-4 text-center">
          <p className="text-sm font-600">No conversations yet</p>
          <p className="mt-1 text-xs text-ink-muted">
            A thread opens when an intro request is accepted. Once you have one, it shows up here.
          </p>
          <Link
            href="/requests"
            onClick={onClose}
            className="mono mt-3 inline-block border border-hairline px-3 py-1.5 text-2xs hover:border-ink"
          >
            View requests
          </Link>
        </div>
      ) : (
        <>
          {/* The filter is hidden below a handful of threads: a search box over
              four rows is furniture, not help. */}
          {targets.length > 5 && (
            <>
              <label htmlFor="share-search" className="sr-only">
                Search conversations
              </label>
              <input
                id="share-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or handle…"
                className="mb-2 w-full border border-hairline bg-white px-3 py-2 text-sm focus:border-ink"
              />
            </>
          )}

          {filtered.length === 0 ? (
            <p className="mono py-6 text-center text-xs text-ink-muted">
              No conversation matches “{query.trim()}”.
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-hairline overflow-y-auto border border-hairline bg-white">
              {filtered.map((t) => {
                const state = states[t.threadId] ?? "idle";
                return (
                  <li key={t.threadId} className="flex items-center gap-3 p-2.5">
                    <Avatar seed={t.avatarSeed} assetId={t.avatarAssetId} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-600">{t.name}</p>
                      <p className="mono truncate text-2xs text-ink-muted">@{t.handle}</p>
                    </div>
                    {state === "sent" ? (
                      // Stays as a status rather than reverting to "Send". Re-sending
                      // the same card to the same person is almost always a double
                      // tap, and the thread is one click away if it was not.
                      <span className="mono px-2 text-2xs text-pine">✓ sent</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => send(t)}
                        disabled={state === "sending"}
                        className="mono border border-pine bg-pine px-3 py-1.5 text-2xs text-paper hover:bg-[#255c41] disabled:opacity-50"
                      >
                        {state === "sending" ? "…" : "Send"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}
