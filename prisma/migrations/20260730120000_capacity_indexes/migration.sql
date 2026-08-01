-- Indexes backing the read paths that scale with platform size rather than with
-- one user's own activity. Each one replaces a planner sort or a heap lookup that
-- only showed up once the tables held more than seed-sized data.

-- getPeople(): discoverable profiles ordered by updatedAt. Previously the filter
-- was indexed but the ORDER BY was not, so every people search sorted the whole
-- matching set.
CREATE INDEX "Profile_isDiscoverable_updatedAt_idx" ON "Profile"("isDiscoverable", "updatedAt");

-- getProjects(): public projects newest-first, same filter-indexed/sort-unindexed
-- problem as above.
CREATE INDEX "Project_visibility_createdAt_idx" ON "Project"("visibility", "createdAt");

-- getRankedRoleFeed(): OPEN roles newest-first. Serves the status equality and the
-- createdAt ordering from a single index.
CREATE INDEX "OpenRole_status_createdAt_idx" ON "OpenRole"("status", "createdAt");

-- The unread-count query behind /api/nav-counts is the app's hottest read. Adding
-- authorProfileId to the existing pair makes that query satisfiable from the index
-- alone — no heap fetch per counted row. The old two-column index is dropped
-- rather than kept alongside: it is an exact prefix of the new one, so transcript
-- paging is served identically, and one index means one less structure to maintain
-- on the message-send write path.
DROP INDEX "Message_threadId_createdAt_idx";
CREATE INDEX "Message_threadId_createdAt_authorProfileId_idx" ON "Message"("threadId", "createdAt", "authorProfileId");
