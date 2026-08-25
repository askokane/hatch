-- Share attachments on messages.
--
-- Sharing a profile or a project into a thread used to mean pasting a URL, which
-- arrives as a line of grey text that says nothing about who or what is on the
-- other end. These three columns let the same act arrive as a card the recipient
-- can read and tap.
--
-- WHY THREE NULLABLE COLUMNS AND NOT A TABLE
--
-- A share IS a message — it occupies a position in the transcript, carries a
-- read receipt, and counts towards unread the same as any other. Modelling it as
-- a side table would mean the thread transcript became a merge of two ordered
-- sources on createdAt, and every reader (the 3s poll, the history backfill, the
-- unread count) would have to learn about the second one. Three columns on the
-- row that already exists keeps all of that unchanged: the existing
-- [threadId, createdAt, authorProfileId] index still serves paging, and the poll
-- selects three more fields from a row it was already reading.
--
-- WHY shareTargetId IS NOT A FOREIGN KEY
--
-- It points at either a Profile or a Project, so it cannot be one FK anyway --
-- but the deciding reason is deletion. A sent message is a record of what was
-- sent. If the shared profile deletes their account, ON DELETE CASCADE would
-- erase messages out of someone else's transcript and SET NULL would leave a
-- card with nothing behind it; both rewrite history to satisfy referential
-- tidiness nobody asked for. Instead the card renders from shareSnapshot, which
-- is self-contained, and the link it carries 404s like any other stale link.
--
-- WHY THE SNAPSHOT
--
-- The card shows a name, a handle, a one-line blurb and an avatar. Re-deriving
-- those on read would add a query per card -- on a poll that already runs every
-- three seconds, for a thread that may hold many -- and would let a transcript
-- silently restate itself when someone renames a project. Captured at send time,
-- the transcript says what was actually shared. See lib/share-core.ts.
--
-- BACKFILL: none needed. Every existing message is a plain message, and all
-- three columns are nullable with no default, which is exactly what a plain
-- message looks like.
--
-- GRANTS/RLS: none needed either. "Message" already has row-level security
-- enabled and no grants to `anon`/`authenticated` (migrations 20260805130000 and
-- 20260805150000); adding columns to an existing table inherits both.

CREATE TYPE "ShareKind" AS ENUM ('PROFILE', 'PROJECT');

ALTER TABLE "Message" ADD COLUMN "shareKind"     "ShareKind";
ALTER TABLE "Message" ADD COLUMN "shareTargetId" TEXT;
ALTER TABLE "Message" ADD COLUMN "shareSnapshot" JSONB;
