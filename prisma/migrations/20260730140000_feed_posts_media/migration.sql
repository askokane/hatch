-- The feed: profile posts plus the media they carry.
--
-- Project updates and open roles already exist as tables; the feed reads them
-- alongside Post rather than copying them, so nothing below duplicates content
-- that another table already owns.

-- POST is a new reportable subject, so the moderation queue can take a post.
ALTER TYPE "SubjectType" ADD VALUE 'POST';

CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "authorProfileId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- `data` is bytea. See the note on MediaAsset in schema.prisma for why the bytes
-- live here and what the object-storage upgrade would change.
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "ownerProfileId" TEXT NOT NULL,
    "postId" TEXT,
    "kind" "MediaKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- One author's posts, newest-first (the profile tab).
CREATE INDEX "Post_authorProfileId_createdAt_idx" ON "Post"("authorProfileId", "createdAt");
-- Every post, newest-first. The feed merges three independently-ordered sources
-- on createdAt, so each one needs its own ordered access path.
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt");

CREATE INDEX "MediaAsset_postId_idx" ON "MediaAsset"("postId");
-- Serves the pending-upload quota: unattached assets for one owner.
CREATE INDEX "MediaAsset_ownerProfileId_postId_idx" ON "MediaAsset"("ownerProfileId", "postId");

ALTER TABLE "Post" ADD CONSTRAINT "Post_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_ownerProfileId_fkey" FOREIGN KEY ("ownerProfileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
