"use server";

import { revalidatePath } from "next/cache";
import { requireSession, requireProfile } from "@/lib/session";
import { listShareTargets, shareToThreadCore, type ShareTarget } from "@/lib/share-core";
import { ok, type ActionResult } from "@/lib/action-result";
import type { MessageDTO } from "@/lib/messages-core";
import type { ShareKind } from "@/lib/validation/share.schema";

// Thin session-bound wrappers, matching actions/messages.ts. Every export here is
// a callable endpoint, so none of them takes a profile ID — it is always derived
// from the session. The logic lives in lib/share-core.ts.

export type { ShareTarget } from "@/lib/share-core";

// The threads the share sheet may offer. A read, but a server action rather than
// a route: it is only ever fetched by a dialog opening, so it does not need a URL
// of its own, and going through requireSession keeps the "who is asking" question
// answered the same way as everything else here.
export async function listShareTargetsAction(): Promise<ActionResult<ShareTarget[]>> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  return ok(await listShareTargets(profileId));
}

export async function shareToThreadAction(
  threadId: string,
  kind: ShareKind,
  targetId: string
): Promise<ActionResult<MessageDTO>> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  const res = await shareToThreadCore(threadId, profileId, { kind, targetId });
  // The sender is usually not looking at the thread they just shared into — they
  // are on a profile or a project page. Revalidating anyway means the transcript
  // is already correct when they do open it, rather than one poll behind.
  if (res.ok) revalidatePath(`/messages/${threadId}`);
  return res;
}
