-- Three product changes in one migration, because two of them rewrite existing
-- rows and must not be able to land separately:
--   1. Profile."basedIn" — optional "City, Country".
--   2. School — the shared, user-grown university/school catalog, backfilled
--      from the schools already typed into profiles.
--   3. Handles move from "-" to "_", including every handle already issued.

-- 1 ---------------------------------------------------------------------------
ALTER TABLE "Profile" ADD COLUMN "basedIn" TEXT NOT NULL DEFAULT '';

-- 2 ---------------------------------------------------------------------------
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "School_slug_key" ON "School"("slug");
CREATE INDEX "School_name_idx" ON "School"("name");

-- Seed the catalog from what people have already typed, so the dropdown is
-- useful to the next signup rather than starting empty.
--
-- The slug expression here is the SQL twin of catalogSlug() in
-- src/lib/catalog-slug.ts: lowercase, runs of non-alphanumerics to "-", ends
-- trimmed. The two MUST agree — a school whose slug differs between them would
-- be catalogued twice, once by this backfill and again by the first ensureSchool()
-- call after deploy.
--
-- Where several spellings collapse to one slug, the earliest profile's spelling
-- wins, matching ensureSchool()'s "first writer sets the canonical name" rule.
WITH normalized AS (
    SELECT
        btrim(regexp_replace(lower("school"), '[^a-z0-9]+', '-', 'g'), '-') AS slug,
        "school" AS name,
        "createdAt" AS created
    FROM "Profile"
),
ranked AS (
    SELECT slug, name, row_number() OVER (PARTITION BY slug ORDER BY created ASC) AS rn
    FROM normalized
    -- A school name with nothing sluggable in it would be an entry no search
    -- could ever match; skip it rather than catalogue noise.
    WHERE slug <> ''
)
INSERT INTO "School" ("id", "slug", "name", "createdAt")
SELECT gen_random_uuid()::text, slug, name, CURRENT_TIMESTAMP
FROM ranked
WHERE rn = 1;

-- 3 ---------------------------------------------------------------------------
-- Rewrite issued handles to the new charset. Existing handles were constrained to
-- [a-z0-9-] with no leading/trailing hyphen, so swapping "-" for "_" is the whole
-- transformation — nothing else in them can be illegal under the new rule, and
-- the result can never start or end with "_".
--
-- The loop exists for one reason: "handle" is UNIQUE, and both "ada-lovelace" and
-- "ada_lovelace" may already exist. Oldest profile keeps the natural name; a
-- later collision gets a numeric suffix, truncated to stay within the 30-char cap.
DO $$
DECLARE
    r RECORD;
    base TEXT;
    candidate TEXT;
    n INT;
BEGIN
    FOR r IN
        SELECT "id", "handle" FROM "Profile"
        WHERE "handle" LIKE '%-%'
        ORDER BY "createdAt" ASC, "id" ASC
    LOOP
        base := replace(r."handle", '-', '_');
        candidate := base;
        n := 1;
        WHILE EXISTS (
            SELECT 1 FROM "Profile" p WHERE p."handle" = candidate AND p."id" <> r."id"
        ) LOOP
            n := n + 1;
            candidate := left(base, 30 - length(n::text)) || n::text;
        END LOOP;
        UPDATE "Profile" SET "handle" = candidate WHERE "id" = r."id";
    END LOOP;
END $$;
