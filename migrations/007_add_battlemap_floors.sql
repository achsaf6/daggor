-- Add support for multi-floor battlemaps (multiple images per battlemap)
-- Each floor has its own map image, and covers are scoped per-floor.
--
-- This migration is written to be safe to run once and keep legacy fields intact
-- (e.g. battlemaps.map_path) for backward compatibility.

-- Ensure pgcrypto extension is available for UUID generation (already used elsewhere)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Create battlemap_images (floors) table
CREATE TABLE IF NOT EXISTS battlemap_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battlemap_id UUID NOT NULL REFERENCES battlemaps(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Floor 1',
  map_path TEXT,
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_battlemap_images_battlemap_id ON battlemap_images(battlemap_id);
CREATE INDEX IF NOT EXISTS idx_battlemap_images_sort_index ON battlemap_images(battlemap_id, sort_index);

ALTER TABLE battlemap_images ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'battlemap_images'
      AND policyname = 'Allow all operations on battlemap_images'
  ) THEN
    CREATE POLICY "Allow all operations on battlemap_images"
      ON battlemap_images
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

-- Keep updated_at in sync
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_battlemap_images_updated_at'
  ) THEN
    CREATE TRIGGER update_battlemap_images_updated_at
      BEFORE UPDATE ON battlemap_images
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

-- 2) Add optional active_image_id to battlemaps (persist selected floor)
ALTER TABLE battlemaps
  ADD COLUMN IF NOT EXISTS active_image_id UUID;

-- Add FK if not present (best-effort; IF NOT EXISTS not available for constraints)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'battlemaps'
      AND tc.constraint_name = 'battlemaps_active_image_id_fkey'
  ) THEN
    ALTER TABLE battlemaps
      ADD CONSTRAINT battlemaps_active_image_id_fkey
      FOREIGN KEY (active_image_id)
      REFERENCES battlemap_images(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- 3) Add battlemap_image_id to battlemap_covers to scope covers per floor
ALTER TABLE battlemap_covers
  ADD COLUMN IF NOT EXISTS battlemap_image_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'battlemap_covers'
      AND tc.constraint_name = 'battlemap_covers_battlemap_image_id_fkey'
  ) THEN
    ALTER TABLE battlemap_covers
      ADD CONSTRAINT battlemap_covers_battlemap_image_id_fkey
      FOREIGN KEY (battlemap_image_id)
      REFERENCES battlemap_images(id)
      ON DELETE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_battlemap_covers_battlemap_image_id
  ON battlemap_covers(battlemap_image_id);

-- 4) Backfill: create a default Floor 1 image for each existing battlemap (if none exists)
INSERT INTO battlemap_images (battlemap_id, name, map_path, sort_index)
SELECT
  b.id,
  'Floor 1',
  b.map_path,
  0
FROM battlemaps b
WHERE NOT EXISTS (
  SELECT 1 FROM battlemap_images bi WHERE bi.battlemap_id = b.id
);

-- 5) Backfill battlemaps.active_image_id if missing
UPDATE battlemaps b
SET active_image_id = bi.id
FROM (
  SELECT DISTINCT ON (battlemap_id) id, battlemap_id
  FROM battlemap_images
  ORDER BY battlemap_id, sort_index ASC, created_at ASC
) bi
WHERE b.id = bi.battlemap_id
  AND b.active_image_id IS NULL;

-- 6) Backfill covers to be associated with the default floor image
UPDATE battlemap_covers c
SET battlemap_image_id = bi.id
FROM (
  SELECT DISTINCT ON (battlemap_id) id, battlemap_id
  FROM battlemap_images
  ORDER BY battlemap_id, sort_index ASC, created_at ASC
) bi
WHERE c.battlemap_id = bi.battlemap_id
  AND c.battlemap_image_id IS NULL;


