"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { removeAvatarAction } from "@/actions/profile";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/ToastProvider";
import { ALLOWED_IMAGE_MIME, AVATAR_BYTES_MAX } from "@/lib/constants";
import { downscaleAvatar } from "@/lib/image-resize";

const IMAGE_MIME: readonly string[] = ALLOWED_IMAGE_MIME;
const ACCEPT = ALLOWED_IMAGE_MIME.join(",");

const PREVIEW_PX = 72;

function formatBytes(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

// The profile picture control.
//
// It commits on its own rather than on the surrounding form's "Save changes",
// and that is deliberate: the photo cannot travel through updateProfileAction at
// all (a Server Action body is capped at 1 MB), so it necessarily goes to
// /api/avatar. Given that, the honest thing is to say so rather than to leave a
// control that looks staged but isn't. Hence the immediate toast and the hint
// text — a picture that visibly changed and then reverted because the user hit
// Cancel would be the worse surprise.
export function AvatarPicker({
  seed,
  initialAssetId,
}: {
  seed: string;
  initialAssetId: string | null;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const fileInputId = useId();

  // Local mirror of the server value, so the new picture appears the instant the
  // upload resolves instead of waiting on the router refresh below.
  const [assetId, setAssetId] = useState<string | null>(initialAssetId);
  const [busy, setBusy] = useState<null | "upload" | "remove">(null);
  const [error, setError] = useState<string | null>(null);

  // Client-side triage: a courtesy that saves a pointless round trip, never the
  // guard. /api/avatar re-checks both type and size against the same constants,
  // because anything decided here can be skipped by posting to the route directly.
  function reject(file: File): string | null {
    if (!IMAGE_MIME.includes(file.type)) {
      return `${file.name || "That file"} isn't a supported image — use JPEG, PNG, GIF or WebP.`;
    }
    if (file.size > AVATAR_BYTES_MAX) {
      return `${file.name} is ${formatBytes(file.size)} — profile pictures cap at ${formatBytes(AVATAR_BYTES_MAX)}.`;
    }
    return null;
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset immediately: without this, removing a picture and re-picking the
    // same file fires no change event, because the value never changed.
    e.target.value = "";
    if (!file) return;

    setError(null);
    const problem = reject(file);
    if (problem) {
      setError(problem);
      return;
    }

    setBusy("upload");

    // Downscale before the wire, not after. The cap is checked against what the
    // user picked (above) so the error message names the file they chose, but
    // what actually travels is the 256 px re-encode — a fraction of the bytes,
    // and the size everyone else's browser will be fetching on every people
    // search. Falls back to the original file on any failure.
    const upload = await downscaleAvatar(file);

    const form = new FormData();
    form.append("file", upload);

    let payload: { id?: string; error?: string } = {};
    let ok = false;
    try {
      const res = await fetch("/api/avatar", { method: "POST", body: form });
      payload = await res.json().catch(() => ({}));
      ok = res.ok && !!payload.id;
    } catch {
      // Network failure; the generic message below covers it.
    }
    setBusy(null);

    if (!ok) {
      // The route's own message is the useful one (type, size); only invent text
      // when there wasn't any.
      setError(payload.error ?? "Upload failed — check your connection and try again.");
      return;
    }

    setAssetId(payload.id!);
    notify("Profile picture updated.", "success");
    // Everything else on the page that draws this avatar — the nav, the feed —
    // is server-rendered and still holds the old id.
    router.refresh();
  }

  async function onRemove() {
    setError(null);
    setBusy("remove");
    const res = await removeAvatarAction();
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setAssetId(null);
    notify("Profile picture removed.", "success");
    router.refresh();
  }

  const disabled = busy !== null;

  return (
    <div>
      <p className="label-mono mb-2">profile picture</p>
      <div className="flex items-start gap-4 border-t border-hairline pt-3">
        <Avatar seed={seed} assetId={assetId} size={PREVIEW_PX} />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* The input stays immediately before its label, which is what `peer`
                requires; `sr-only` positions it absolutely, so it claims no slot. */}
            <input
              id={fileInputId}
              type="file"
              accept={ACCEPT}
              onChange={onPick}
              disabled={disabled}
              className="peer sr-only"
            />
            <label
              htmlFor={fileInputId}
              className="mono cursor-pointer border border-hairline px-2.5 py-1 text-xs transition-colors hover:border-ink/30 hover:bg-black/[0.03] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pine peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
            >
              {busy === "upload"
                ? "uploading…"
                : assetId
                  ? "change photo"
                  : "upload a photo"}
            </label>

            {assetId && (
              <button
                type="button"
                onClick={onRemove}
                disabled={disabled}
                className="mono text-xs text-ink-muted hover:text-brick disabled:opacity-50"
              >
                {busy === "remove" ? "removing…" : "remove"}
              </button>
            )}
          </div>

          <p className="mono mt-2 text-2xs text-ink-muted">
            JPEG, PNG, GIF or WebP · up to {formatBytes(AVATAR_BYTES_MAX)}. Saves immediately —
            it does not wait for &ldquo;Save changes&rdquo;.
          </p>
          <p className="mono mt-1 text-2xs text-ink-muted">
            With no photo, your generated pattern is used.
          </p>

          {error && (
            <p role="alert" className="mono mt-2 text-2xs text-brick">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
