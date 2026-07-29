import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { assertThreadMember, getBlockState, ForbiddenError } from "@/lib/authz";
import { getThreadPresence } from "@/lib/messages-core";
import { resolveContextLabel } from "@/lib/context-label";
import { Avatar } from "@/components/ui/Avatar";
import { ThreadView, type ComposerState } from "@/components/messages/ThreadView";
import { ReportDialog } from "@/components/safety/ReportDialog";
import { UnblockButton } from "@/components/safety/UnblockButton";
import type { MessageDTO } from "@/actions/messages";

export default async function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const session = await requireSession();
  if (!session.profileId) redirect("/onboarding");
  const profileId = session.profileId;

  const { threadId } = await params;

  // Authorization: must be a member of this thread. A non-member (even with a
  // valid thread ID) is redirected — never shown content.
  try {
    await assertThreadMember(threadId, profileId);
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/messages");
    throw e;
  }

  const thread = await db.thread.findUnique({
    where: { id: threadId },
    include: {
      members: {
        where: { profileId: { not: profileId } },
        include: { profile: { select: { id: true, handle: true, name: true, avatarSeed: true } } },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { handle: true, name: true } } },
      },
    },
  });
  if (!thread) notFound();

  const counterpart = thread.members[0]?.profile;
  const contextLabel = await resolveContextLabel(thread.contextType, thread.contextId);
  const presence = await getThreadPresence(threadId, profileId);

  const block = counterpart
    ? await getBlockState(profileId, counterpart.id)
    : { viewerBlockedThem: false, theyBlockedViewer: false, either: true };

  // The two block directions produce different UI on purpose. The blocker sees
  // exactly what they did and how to undo it. The blocked party sees a closed
  // composer with no explanation — the thread simply stops accepting messages,
  // which is indistinguishable from any other reason it might be closed.
  const composer: ComposerState = block.viewerBlockedThem
    ? { kind: "BLOCKED_BY_ME", name: counterpart?.name ?? "this person" }
    : block.theyBlockedViewer || !counterpart
      ? { kind: "CLOSED" }
      : { kind: "OPEN" };

  const initialMessages: MessageDTO[] = thread.messages.map((m) => ({
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    authorProfileId: m.authorProfileId,
    authorHandle: m.author.handle,
    authorName: m.author.name,
  }));

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/messages" className="mono text-2xs text-ink-muted hover:text-ink">
        ← all threads
      </Link>

      {/* Pinned originating context */}
      <div className="mt-3 flex items-center justify-between gap-3 border border-hairline bg-white p-3">
        <div className="flex items-center gap-3">
          {counterpart && <Avatar seed={counterpart.avatarSeed} size={36} />}
          <div>
            <p className="text-sm font-600">{counterpart?.name ?? "Unknown"}</p>
            <p className="mono text-2xs text-pine">{contextLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {counterpart && (
            <Link href={`/u/${counterpart.handle}`} className="mono text-2xs text-ink-muted hover:text-ink">
              view profile
            </Link>
          )}
          <ReportDialog subjectType="THREAD" subjectId={threadId} subjectLabel="this conversation" />
        </div>
      </div>

      {/* Only the blocker is told a block exists. */}
      {block.viewerBlockedThem && counterpart && (
        <div className="mono mt-2 flex flex-wrap items-center justify-between gap-2 border border-brick bg-brick-soft px-3 py-2 text-2xs text-brick">
          <span>You blocked {counterpart.name}. They can no longer message you.</span>
          <UnblockButton blockedProfileId={counterpart.id} blockedName={counterpart.name} />
        </div>
      )}

      <div className="mt-3">
        <ThreadView
          threadId={threadId}
          myProfileId={profileId}
          counterpartName={counterpart?.name ?? "They"}
          initialMessages={initialMessages}
          initialPresence={presence}
          composer={composer}
        />
      </div>
    </div>
  );
}
