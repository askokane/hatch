import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { getFeedPage } from "@/lib/feed-queries";
import { isFeedFilter } from "@/lib/feed-types";

// GET /api/feed?filter=all|posts|updates|roles&before=<ISO>&author=<handle>
//
// The feed's "load more". The first page is server-rendered with the page itself;
// this route exists so paging does not re-render and re-serialize everything the
// client already holds. Same shape both ways (lib/feed-types.ts), so the client
// list appends what it gets here to what the server handed it without a second
// mapping step.

// A garbage cursor must not reach Prisma. `new Date("nonsense")` is an Invalid
// Date, which Prisma sends as a null — silently dropping the `createdAt <` filter
// and widening the query to the newest page, forever. This is the same guard, and
// for the same reason, as parseCursor() in the thread messages route.
function validCursor(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.profileId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const viewerProfileId = session.profileId;

  const url = new URL(req.url);
  const rawFilter = url.searchParams.get("filter") ?? undefined;
  const filter = isFeedFilter(rawFilter) ? rawFilter : "all";
  const before = validCursor(url.searchParams.get("before"));

  // An author scope is given as a handle because that is what the profile page
  // has in its URL; it is resolved to an id here rather than trusting a
  // client-supplied profile id.
  const authorHandle = url.searchParams.get("author");
  let authorProfileId: string | null = null;
  if (authorHandle) {
    const author = await db.profile.findUnique({
      where: { handle: authorHandle.toLowerCase() },
      select: { id: true },
    });
    if (!author) return Response.json({ error: "No such profile" }, { status: 404 });
    authorProfileId = author.id;
  }

  const page = await getFeedPage({ viewerProfileId, filter, before, authorProfileId });
  return Response.json(page);
}
