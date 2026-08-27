-- Mentions on posts: "@handle" naming someone the author is connected to.
--
-- WHY A TABLE AND NOT JUST TEXT
--
-- The body already contains the string "@alice", so a renderer could in
-- principle find the handle, look it up and draw a link with no schema change at
-- all. That version has no idea whether the author was allowed to name that
-- person. The product rule is that you may mention someone you are CONNECTED to
-- (an accepted intro request, i.e. a shared thread) and nobody else, and a rule
-- that is only ever evaluated at render time is a rule that changes retroactively:
-- an "@alice" typed at a stranger would quietly become a live mention the moment
-- the two of them connected months later, and it would do so on the reader's
-- machine, from text the author wrote with no such intent.
--
-- So the decision is made once, at write time, and this table IS that decision.
-- What is stored is linked; what is not stored stays literal text. There is no
-- second code path in which the client can promote a token.
--
-- WHY THE HANDLE IS STORED ALONGSIDE THE PROFILE ID
--
-- They answer different questions and drift apart. `profileId` is who was meant,
-- and it survives a rename. `handle` is what the body actually says, and it is
-- how a renderer finds the token to replace — the post still reads "@alice"
-- after Alice becomes @alicia, because the post is a record of what was written.
-- The link is then built from her CURRENT handle, read through the FK. Storing
-- only the id would leave the renderer nothing to match on and silently unlink
-- every existing mention on the first rename; storing only the handle would
-- unlink them just as silently in the other direction.
--
-- The pair is unique per post rather than per occurrence: naming someone three
-- times in one post is one relationship, and all three tokens render from the
-- same row.
--
-- ON DELETE CASCADE on both sides, and both are right for different reasons.
-- postId: the mention is part of the post and has no meaning without it.
-- profileId: unlike a share card, a mention is not a snapshot of anything — it
-- is a live pointer at a person. When that person deletes their account the
-- pointer must go, and the body degrades to the plain text it always was
-- underneath.
--
-- BACKFILL: none. Every existing post was written before mentions existed, and
-- an empty table is exactly what "no post mentions anyone" looks like. The old
-- bodies are not rescanned on purpose — retro-linking text whose authors never
-- had a mention affordance is the retroactive-rule failure described above.
--
-- GRANTS/RLS: unlike the previous migration (which added columns to a table that
-- already had both settled), this creates a NEW table, so it inherits nothing.
-- Migrations 20260805130000 and 20260805150000 revoked the default privileges
-- that would otherwise hand a fresh table to `anon`/`authenticated`, so there is
-- nothing to revoke here — but RLS is per-table state and a new table starts
-- without it. Enabling it with no policies keeps the invariant those migrations
-- established: every table in this schema yields zero rows to any role that does
-- not bypass RLS. Prisma connects as `postgres` (rolbypassrls), so the app is
-- unaffected. Written against current_schema() for the same reason they were —
-- the isolated e2e schema has to end up identical.

CREATE TABLE "PostMention" (
    "postId"    TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "handle"    TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostMention_pkey" PRIMARY KEY ("postId", "profileId")
);

-- Serves "posts that mention me", newest first — the read a mentions inbox
-- pages. The primary key already covers the other direction (a post's own
-- mentions, which is how the feed loads them).
CREATE INDEX "PostMention_profileId_createdAt_idx" ON "PostMention"("profileId", "createdAt");

ALTER TABLE "PostMention"
  ADD CONSTRAINT "PostMention_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PostMention"
  ADD CONSTRAINT "PostMention_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE format('ALTER TABLE %I."PostMention" ENABLE ROW LEVEL SECURITY', current_schema());
END
$$;
