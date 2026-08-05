-- Uploaded profile pictures.
--
-- The picture is a MediaAsset like any post photo, so the existing upload
-- validation, byte storage and GET /api/media/:id serving path are reused
-- unchanged. Two columns are all that is added on top:
--
--   MediaAsset.isAvatar   — exempts the row from the abandoned-upload sweep and
--                           the pending-upload quota, both of which key off
--                           `postId IS NULL` and would otherwise treat a profile
--                           picture as composer litter.
--   Profile.avatarAssetId — the pointer. Scalar rather than a join so the people,
--                           feed, thread and nav queries can select it alongside
--                           the handle. NULL means "render the identicon", which
--                           is why every existing row backfills correctly with no
--                           data migration: avatarSeed was already there and
--                           still is.

ALTER TABLE "MediaAsset" ADD COLUMN "isAvatar" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Profile" ADD COLUMN "avatarAssetId" TEXT;

-- One profile per asset (the relation is 1-1); also the index behind the FK.
CREATE UNIQUE INDEX "Profile_avatarAssetId_key" ON "Profile"("avatarAssetId");

-- ON DELETE SET NULL: an asset that disappears for any reason degrades the
-- profile to its identicon instead of leaving a dangling reference.
ALTER TABLE "Profile"
    ADD CONSTRAINT "Profile_avatarAssetId_fkey"
    FOREIGN KEY ("avatarAssetId") REFERENCES "MediaAsset"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
