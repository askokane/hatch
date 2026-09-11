ALTER TABLE "User" ADD COLUMN "credentialVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Session" ADD COLUMN "credentialVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Intent" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Project" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "Project" DROP CONSTRAINT "Project_createdById_fkey";
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IntroRequest" ADD COLUMN "pairKey" TEXT;
UPDATE "IntroRequest"
SET "pairKey" = LEAST("fromProfileId", "toProfileId") || ':' || GREATEST("fromProfileId", "toProfileId");
ALTER TABLE "IntroRequest" ALTER COLUMN "pairKey" SET NOT NULL;

ALTER TABLE "Message" ADD COLUMN "clientId" TEXT;
ALTER TABLE "ProjectChatMessage" ADD COLUMN "clientId" TEXT;
ALTER TABLE "MediaAsset" ADD COLUMN "draftId" TEXT;
ALTER TABLE "ThreadMember" ADD COLUMN "lastReadMessageId" TEXT;
ALTER TABLE "Membership" ADD COLUMN "chatLastReadMessageId" TEXT;

CREATE TABLE "ActionAttempt" (
  "id" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
CREATE INDEX "ActionAttempt_bucket_subject_createdAt_idx" ON "ActionAttempt"("bucket", "subject", "createdAt");
CREATE INDEX "ActionAttempt_createdAt_idx" ON "ActionAttempt"("createdAt");
CREATE INDEX "IntroRequest_pairKey_status_idx" ON "IntroRequest"("pairKey", "status");
CREATE UNIQUE INDEX "IntroRequest_one_pending_pair" ON "IntroRequest"("pairKey") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "IntroRequest_one_accepted_pair" ON "IntroRequest"("pairKey") WHERE "status" = 'ACCEPTED';
CREATE UNIQUE INDEX "Message_threadId_authorProfileId_clientId_key" ON "Message"("threadId", "authorProfileId", "clientId");
CREATE INDEX "ProjectChatMessage_chatId_authorProfileId_createdAt_idx" ON "ProjectChatMessage"("chatId", "authorProfileId", "createdAt");
CREATE UNIQUE INDEX "ProjectChatMessage_chatId_authorProfileId_clientId_key" ON "ProjectChatMessage"("chatId", "authorProfileId", "clientId");
CREATE INDEX "MediaAsset_ownerProfileId_draftId_postId_idx" ON "MediaAsset"("ownerProfileId", "draftId", "postId");
CREATE INDEX "MediaAsset_createdAt_idx" ON "MediaAsset"("createdAt");
CREATE INDEX "Report_reporterProfileId_createdAt_idx" ON "Report"("reporterProfileId", "createdAt");

ALTER TABLE "ActionAttempt" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ActionAttempt" FROM PUBLIC, anon, authenticated;

ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_byteSize_nonnegative" CHECK ("byteSize" >= 0);
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_position_nonnegative" CHECK ("position" >= 0);
ALTER TABLE "Message" ADD CONSTRAINT "Message_content_present" CHECK (
  length("body") > 0 OR ("shareKind" IS NOT NULL AND "shareTargetId" IS NOT NULL AND "shareSnapshot" IS NOT NULL)
);
ALTER TABLE "Message" ADD CONSTRAINT "Message_share_all_or_none" CHECK (
  ("shareKind" IS NULL AND "shareTargetId" IS NULL AND "shareSnapshot" IS NULL) OR
  ("shareKind" IS NOT NULL AND "shareTargetId" IS NOT NULL AND "shareSnapshot" IS NOT NULL)
);

-- Normalized B-tree indexes accelerate exact and prefix search without a
-- database-wide extension. Search results remain capped for infix queries.
CREATE INDEX "Profile_name_lower_idx" ON "Profile" (lower("name"));
CREATE INDEX "Profile_handle_lower_idx" ON "Profile" (lower("handle"));
CREATE INDEX "Profile_school_lower_idx" ON "Profile" (lower("school"));
CREATE INDEX "Profile_basedIn_lower_idx" ON "Profile" (lower("basedIn"));
CREATE INDEX "Tag_label_lower_idx" ON "Tag" (lower("label"));
CREATE INDEX "School_name_lower_idx" ON "School" (lower("name"));

CREATE FUNCTION hatch_check_project_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid text := COALESCE(NEW."projectId", OLD."projectId");
BEGIN
  IF EXISTS (SELECT 1 FROM "Project" WHERE id=pid) AND NOT EXISTS (SELECT 1 FROM "Membership" WHERE "projectId"=pid AND "isOwner") THEN
    RAISE EXCEPTION 'project % must retain an owner', pid;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "Membership_project_owner_guard" AFTER DELETE OR UPDATE OF "isOwner", "projectId" ON "Membership"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hatch_check_project_owner();

CREATE FUNCTION hatch_check_thread_members() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid text := CASE WHEN TG_TABLE_NAME='Thread' THEN COALESCE(NEW.id, OLD.id) ELSE COALESCE(NEW."threadId", OLD."threadId") END;
BEGIN
  IF EXISTS (SELECT 1 FROM "Thread" WHERE id=tid) AND (SELECT count(*) FROM "ThreadMember" WHERE "threadId"=tid) <> 2 THEN
    RAISE EXCEPTION 'direct thread % must have exactly two members', tid;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "Thread_member_count_guard" AFTER INSERT ON "Thread" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hatch_check_thread_members();
CREATE CONSTRAINT TRIGGER "ThreadMember_count_guard" AFTER INSERT OR DELETE OR UPDATE OF "threadId" ON "ThreadMember" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hatch_check_thread_members();

CREATE FUNCTION hatch_check_message_author() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "ThreadMember" WHERE "threadId"=NEW."threadId" AND "profileId"=NEW."authorProfileId") THEN
    RAISE EXCEPTION 'message author must be a thread member';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Message_author_guard" BEFORE INSERT OR UPDATE OF "threadId", "authorProfileId" ON "Message" FOR EACH ROW EXECUTE FUNCTION hatch_check_message_author();

CREATE FUNCTION hatch_check_chat_author() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "ProjectChat" c JOIN "Membership" m ON m."projectId"=c."projectId" WHERE c.id=NEW."chatId" AND m."profileId"=NEW."authorProfileId") THEN
    RAISE EXCEPTION 'chat message author must be a project member';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ProjectChatMessage_author_guard" BEFORE INSERT OR UPDATE OF "chatId", "authorProfileId" ON "ProjectChatMessage" FOR EACH ROW EXECUTE FUNCTION hatch_check_chat_author();

CREATE FUNCTION hatch_check_media_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."postId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Post" p WHERE p.id=NEW."postId" AND p."authorProfileId"=NEW."ownerProfileId") THEN
    RAISE EXCEPTION 'media owner must match post author';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "MediaAsset_owner_guard" BEFORE INSERT OR UPDATE OF "postId", "ownerProfileId" ON "MediaAsset" FOR EACH ROW EXECUTE FUNCTION hatch_check_media_owner();
