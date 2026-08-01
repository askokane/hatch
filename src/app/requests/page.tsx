import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { resolveContextLabels, contextLabelKey, formatDate } from "@/lib/context-label";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { RequestCard, type RequestCardData } from "@/components/requests/RequestCard";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireSession("/requests");
  if (!session.profileId) redirect("/onboarding");
  const profileId = session.profileId;

  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "sent" ? "sent" : "received";

  const [received, sent, pendingReceivedCount] = await Promise.all([
    db.introRequest.findMany({
      where: { toProfileId: profileId },
      include: {
        fromProfile: { select: { handle: true, name: true, avatarSeed: true } },
        thread: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.introRequest.findMany({
      where: { fromProfileId: profileId },
      include: {
        toProfile: { select: { handle: true, name: true, avatarSeed: true } },
        thread: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.introRequest.count({ where: { toProfileId: profileId, status: "PENDING" } }),
  ]);

  const list = tab === "received" ? received : sent;
  // One batched lookup for every card's context label, rather than a query per card.
  const labels = await resolveContextLabels(list);

  const cards: RequestCardData[] = list.map((r) => {
    const counterpart =
      tab === "received"
        ? (r as (typeof received)[number]).fromProfile
        : (r as (typeof sent)[number]).toProfile;
    return {
      id: r.id,
      note: r.note,
      status: r.status,
      contextLabel: labels.get(contextLabelKey(r)) ?? "Context",
      createdAt: formatDate(r.createdAt),
      counterpart,
      threadId: r.thread?.id ?? null,
    };
  });

  const tabs = [
    { value: "received", label: "received", count: pendingReceivedCount },
    { value: "sent", label: "sent" },
  ];

  return (
    <div>
      <p className="label-mono">[ requests ]</p>
      <h1 className="mt-2 text-xl font-600">Intro requests</h1>
      <div className="mt-4">
        <Tabs tabs={tabs} active={tab} basePath="/requests" />
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {cards.length === 0 ? (
          <EmptyState
            title={tab === "received" ? "No requests yet" : "You haven't sent any requests"}
            body={
              tab === "received"
                ? "When someone requests an intro tied to one of your roles, projects, or intents, it'll appear here."
                : "Find an open role or profile in discovery and request an intro with a note about why you're reaching out."
            }
          />
        ) : (
          cards.map((c) => <RequestCard key={c.id} data={c} direction={tab} />)
        )}
      </div>
    </div>
  );
}
