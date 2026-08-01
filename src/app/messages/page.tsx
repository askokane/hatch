import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { resolveContextLabels, contextLabelKey } from "@/lib/context-label";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function MessagesPage() {
  const session = await requireSession("/messages");
  if (!session.profileId) redirect("/onboarding");
  const profileId = session.profileId;

  const memberships = await db.threadMember.findMany({
    where: { profileId },
    include: {
      thread: {
        include: {
          members: {
            where: { profileId: { not: profileId } },
            include: { profile: { select: { handle: true, name: true, avatarSeed: true } } },
          },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  // Sort by latest message time desc.
  const threads = memberships
    .map((m) => m.thread)
    .sort((a, b) => {
      const at = a.messages[0]?.createdAt.getTime() ?? a.createdAt.getTime();
      const bt = b.messages[0]?.createdAt.getTime() ?? b.createdAt.getTime();
      return bt - at;
    });

  // One batched lookup for every row's context label, rather than a query per row.
  const labels = await resolveContextLabels(threads);

  const items = threads.map((t) => ({
    id: t.id,
    counterpart: t.members[0]?.profile ?? { handle: "unknown", name: "Unknown", avatarSeed: "x" },
    contextLabel: labels.get(contextLabelKey(t)) ?? "Context",
    lastMessage: t.messages[0]?.body ?? null,
  }));

  return (
    <div>
      <p className="label-mono">[ messages ]</p>
      <h1 className="mt-2 text-xl font-600">Threads</h1>

      <div className="mt-6">
        {items.length === 0 ? (
          <EmptyState
            title="No conversations yet"
            body="When you accept an intro request — or someone accepts yours — a thread opens here."
            action={
              <Link href="/requests" className="mono border border-hairline px-4 py-2 text-xs hover:border-ink">
                View requests
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-hairline border border-hairline bg-white">
            {items.map((t) => (
              <li key={t.id}>
                <Link href={`/messages/${t.id}`} className="flex items-center gap-3 p-3 hover:bg-pine-soft/40">
                  <Avatar seed={t.counterpart.avatarSeed} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-600">{t.counterpart.name}</span>
                      <span className="mono text-2xs text-ink-muted">@{t.counterpart.handle}</span>
                    </div>
                    <p className="mono text-2xs text-pine">{t.contextLabel}</p>
                    {t.lastMessage && (
                      <p className="truncate text-xs text-ink-muted">{t.lastMessage}</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
