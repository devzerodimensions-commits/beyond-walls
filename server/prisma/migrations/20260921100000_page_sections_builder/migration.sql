-- Generalises page sections from "the homepage only" to any page, so every
-- content page can be composed visually in Admin -> Design Pages.
--
-- HomeSection becomes PageSection with the same columns plus a pageId. The old
-- table is only dropped AFTER its rows have been copied onto a "home" page, so
-- a live homepage carries over untouched.

-- 1. Pages the storefront routes to by name cannot be renamed or deleted.
ALTER TABLE "Page" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- 2. The new, page-scoped section table.
CREATE TABLE "PageSection" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "type" "SectionType" NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "bodyText" TEXT,
    "ctaLabel" TEXT,
    "ctaLink" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageSection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PageSection_pageId_sortOrder_idx" ON "PageSection"("pageId", "sortOrder");

ALTER TABLE "PageSection"
  ADD CONSTRAINT "PageSection_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. The homepage is now a page like any other. Create it if it is not there,
--    and mark it as a system page either way.
INSERT INTO "Page" ("id", "slug", "title", "content", "status", "isSystem", "sortOrder", "createdAt", "updatedAt")
SELECT 'page_home', 'home', 'Home', '', 'PUBLISHED', true, -1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Page" WHERE "slug" = 'home');

UPDATE "Page" SET "isSystem" = true WHERE "slug" = 'home';

-- 4. Carry every existing homepage section across, keeping its id, its order
--    and its settings, so the live homepage renders exactly as it did.
INSERT INTO "PageSection" (
  "id", "pageId", "type", "title", "subtitle", "bodyText",
  "ctaLabel", "ctaLink", "config", "sortOrder", "status", "createdAt", "updatedAt"
)
SELECT
  h."id",
  (SELECT "id" FROM "Page" WHERE "slug" = 'home'),
  h."type", h."title", h."subtitle", h."bodyText",
  h."ctaLabel", h."ctaLink", h."config", h."sortOrder", h."status",
  h."createdAt", h."updatedAt"
FROM "HomeSection" h;

-- 5. Only now is the old table redundant.
DROP TABLE "HomeSection";
