import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getProfileCompleteness } from "@/lib/profile-complete";
import { getFeedPage } from "@/lib/feed-queries";
import { isFeedFilter, type FeedFilter } from "@/lib/feed-types";
import { Tabs } from "@/components/ui/Tabs";
import { PostComposer } from "@/components/feed/PostComposer";
import { FeedList } from "@/components/feed/FeedList";

const HEADINGS: Record<FeedFilter, string> = {
  all: "What's happening",
  posts: "Posts",
  updates: "Project updates",
  roles: "Open roles, newest first",
};

// Empty states are written per filter rather than shared: "nothing here yet" on a
// filtered view reads as a broken feed, when the honest answer is usually "that
// one source is quiet, the others aren't".
const EMPTY: Record<FeedFilter, { title: string; body: string }> = {
  all: {
    title: "The feed is quiet",
    body: "Post something above, or follow a project — updates from project rooms and newly opened roles land here as they happen.",
  },
  posts: {
    title: "No posts yet",
    body: "Posts are the informal register: what you're building, what broke, what you're looking for. Yours would be the first.",
  },
  updates: {
    title: "No project updates yet",
    body: "Updates are a project's public changelog. Post one from any project room you're a member of and it shows up here.",
  },
  roles: {
    title: "No open roles right now",
    body: "Roles opened by public projects appear here newest-first. For roles ranked against your own skills, try discover.",
  },
};

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession("/feed");
  if (!session.profileId) redirect("/onboarding");

  // Same gate as /discover: an empty profile cannot read or write the network.
  const completeness = await getProfileCompleteness(session.profileId);
  if (!completeness.isComplete) redirect("/onboarding");

  const sp = await searchParams;
  const filter: FeedFilter = isFeedFilter(sp.filter) ? sp.filter : "all";

  const page = await getFeedPage({ viewerProfileId: session.profileId, filter });

  const tabs = [
    { value: "all", label: "all" },
    { value: "posts", label: "posts" },
    // One word each: "project updates" and "open roles" both wrapped to two
    // lines on a phone, which turned a filter strip into a paragraph. The
    // heading above already establishes that these are the feed's sources.
    { value: "updates", label: "updates" },
    { value: "roles", label: "roles" },
  ];

  return (
    <div>
      <p className="label-mono">[ feed ]</p>
      <h1 className="mt-2 text-xl font-600">{HEADINGS[filter]}</h1>

      {/* Composer first, then the filters, then the results. The filters belong
          directly above the thing they filter — with the composer between them
          they were describing a control three elements away. Discover no longer
          needs a button here either: it is a permanent nav destination. */}
      <div className="mt-4">
        {/* avatarSeed is non-null for any session that got past the profileId
            guard above; the fallback only keeps the type honest. */}
        <PostComposer avatarSeed={session.avatarSeed ?? session.profileId} />
      </div>

      <div className="mt-5">
        <Tabs tabs={tabs} active={filter} basePath="/feed" param="filter" />
      </div>

      <div className="mt-5">
        <FeedList
          initialPage={page}
          filter={filter}
          emptyTitle={EMPTY[filter].title}
          emptyBody={EMPTY[filter].body}
        />
      </div>
    </div>
  );
}
