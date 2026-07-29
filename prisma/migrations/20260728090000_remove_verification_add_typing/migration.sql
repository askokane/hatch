-- Removes the on-platform email-verification step and adds typing presence.
--
-- 1. Existing accounts are grandfathered in as verified so nobody is left in a
--    state the UI no longer has a way to exit.
-- 2. EmailVerificationToken held nothing but single-use, short-lived token
--    hashes; with no verification flow left, every row is dead weight.
-- 3. ThreadMember.typingUntil stores a presence *expiry* rather than a boolean,
--    so a client that disappears mid-keystroke stops showing "typing…" on its
--    own with no reaper job.

-- Backfill: everyone who predates this change counts as verified.
UPDATE "User" SET "emailVerifiedAt" = COALESCE("emailVerifiedAt", "createdAt", CURRENT_TIMESTAMP);

-- DropTable
DROP TABLE IF EXISTS "EmailVerificationToken";

-- AlterTable
ALTER TABLE "ThreadMember" ADD COLUMN "typingUntil" TIMESTAMP(3);
