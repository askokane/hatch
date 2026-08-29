-- Project group chats: one conversation per project, whose members are the
-- project's team.
--
-- WHY NEW TABLES AND NOT A WIDER `Thread`
--
-- `Thread` already stores a conversation with members and messages, so the cheap
-- move was to make `introRequestId` nullable, add a discriminator, and let a
-- project chat be a Thread with more than two members. That version is cheap in
-- the schema and expensive everywhere else, because the two-person assumption is
-- not written down in one place — it is spread across every read. `otherMemberId()`
-- asks the database for "the member who is not me" and takes the first row.
-- Presence is a single `otherTyping` / `otherLastReadAt` pair. A block closes the
-- whole conversation, which is the right rule when the conversation IS the two of
-- you and the wrong one when it is a team of six. Making each of those branch on
-- a discriminator puts a conditional in the 3s poll and in the unread count,
-- where taking the wrong branch shows someone a conversation they are not in.
-- A project chat is a different object with different rules, so it gets its own
-- tables and its own read paths, and `Thread` is left exactly as it was.
--
-- WHY THERE IS NO ProjectChatMember TABLE
--
-- The chat's membership is the project's membership. Not "kept in agreement
-- with" — the same thing. A member table would be a copy that
-- inviteMemberAction, removeMemberAction and transferOwnershipAction each have
-- to write to as well, and the failure mode of that copy drifting is a person
-- reading a chat they were removed from, which is exactly the kind of bug that
-- does not announce itself. So the two pieces of per-person chat state go on
-- `Membership` instead, and authorization for the chat is the membership check
-- the project pages already use. Removing someone from a project removes them
-- from its chat in the same DELETE.
--
-- The cost of that choice is two chat-shaped columns on a table that is not
-- about chat, which is why both are named with a `chat` prefix — a bare
-- `lastReadAt` on Membership would read as "last looked at the project".
--
-- WHY chatLastReadAt IS BACKFILLED TO joinedAt, NOT TO THE EPOCH
--
-- The column means "you have seen everything up to here". For a member who
-- joined a project last week, the honest value is the moment they joined: the
-- messages sent before that are not unread mail they have been ignoring, they
-- are a conversation that happened without them. Defaulting to the epoch would
-- have opened the feature by telling every existing member they had a backlog,
-- and defaulting to now() at migration time would have been a lie in the other
-- direction for a chat that is about to be created empty anyway. joinedAt is the
-- only value that is true for every existing row. New rows default to now(),
-- which is the same statement for someone joining today.
--
-- GRANTS/RLS: two new tables, so they inherit nothing. Migrations
-- 20260805130000 and 20260805150000 revoked the default privileges that would
-- otherwise hand a fresh table to `anon`/`authenticated`, so there is nothing to
-- revoke here — but RLS is per-table state and a new table starts without it.
-- Enabling it with no policies preserves the invariant those migrations
-- established: every table in this schema yields zero rows to any role that does
-- not bypass RLS. Prisma connects as `postgres` (rolbypassrls), so the app is
-- unaffected. Written against current_schema() so the isolated e2e schema ends
-- up identical. `Membership` already has both settled, so the columns added to
-- it need no treatment.

-- Reports can now be filed against a project chat. `SubjectType` names every
-- surface a report can point at; the admin queue renders the value as text, so
-- widening the enum is the whole change.
ALTER TYPE "SubjectType" ADD VALUE IF NOT EXISTS 'PROJECT_CHAT';

-- --- Per-member chat state, on the team roster it belongs to -----------------

ALTER TABLE "Membership"
  ADD COLUMN "chatLastReadAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "chatTypingUntil" TIMESTAMP(3);

-- Existing members have not missed anything: their chat starts empty, and the
-- messages sent to a project before they joined were never addressed to them.
UPDATE "Membership" SET "chatLastReadAt" = "joinedAt";

-- --- The chat itself ---------------------------------------------------------

CREATE TABLE "ProjectChat" (
    "id"        TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectChat_pkey" PRIMARY KEY ("id")
);

-- One chat per project. This is also what makes the lazy create safe: two
-- members opening the chat at the same moment both attempt the insert, and the
-- constraint decides which one wins instead of leaving the project with two.
CREATE UNIQUE INDEX "ProjectChat_projectId_key" ON "ProjectChat"("projectId");

CREATE TABLE "ProjectChatMessage" (
    "id"              TEXT NOT NULL,
    "chatId"          TEXT NOT NULL,
    "authorProfileId" TEXT NOT NULL,
    "body"            TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectChatMessage_pkey" PRIMARY KEY ("id")
);

-- Serves three reads from one index, which is why authorProfileId rides along
-- rather than being a second index: the [chatId, createdAt] prefix pages a
-- transcript in both directions, and the trailing column lets the unread count
-- in /api/nav-counts and the per-viewer "hide people I blocked" filter be
-- answered without a heap lookup per row.
CREATE INDEX "ProjectChatMessage_chatId_createdAt_authorProfileId_idx"
  ON "ProjectChatMessage"("chatId", "createdAt", "authorProfileId");

-- ON DELETE CASCADE on the project: a deleted project has no team left to talk,
-- and the chat is part of the project rather than a record about it.
ALTER TABLE "ProjectChat"
  ADD CONSTRAINT "ProjectChat_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectChatMessage"
  ADD CONSTRAINT "ProjectChatMessage_chatId_fkey"
  FOREIGN KEY ("chatId") REFERENCES "ProjectChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ON DELETE CASCADE on the author, matching Message: a message is attributed
-- speech, not a snapshot like a share card, so when the speaker deletes their
-- account what they said goes with them rather than becoming unattributed text.
ALTER TABLE "ProjectChatMessage"
  ADD CONSTRAINT "ProjectChatMessage_authorProfileId_fkey"
  FOREIGN KEY ("authorProfileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  EXECUTE format('ALTER TABLE %I."ProjectChat" ENABLE ROW LEVEL SECURITY', current_schema());
  EXECUTE format('ALTER TABLE %I."ProjectChatMessage" ENABLE ROW LEVEL SECURITY', current_schema());
END
$$;
