-- Ensure pgcrypto extension is available for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create battlemaps table to store map metadata and grid configuration
CREATE TABLE IF NOT EXISTS battlemaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Untitled Battlemap',
  map_path TEXT,
  grid_scale DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  grid_offset_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  grid_offset_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  grid_data JSONB NOT NULL DEFAULT '{
    "verticalLines": [],
    "horizontalLines": [],
    "imageWidth": 0,
    "imageHeight": 0
  }',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_battlemaps_created_at ON battlemaps(created_at ASC);

-- Enable RLS and allow unrestricted access (adjust based on auth requirements)
ALTER TABLE battlemaps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'battlemaps'
      AND policyname = 'Allow all operations on battlemaps'
  ) THEN
    CREATE POLICY "Allow all operations on battlemaps"
      ON battlemaps
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

-- Create table for persistent cover definitions scoped to a battlemap
CREATE TABLE IF NOT EXISTS battlemap_covers (
  id TEXT PRIMARY KEY,
  battlemap_id UUID NOT NULL REFERENCES battlemaps(id) ON DELETE CASCADE,
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  width DOUBLE PRECISION NOT NULL DEFAULT 0,
  height DOUBLE PRECISION NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#808080',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_battlemap_covers_battlemap_id ON battlemap_covers(battlemap_id);

ALTER TABLE battlemap_covers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'battlemap_covers'
      AND policyname = 'Allow all operations on battlemap_covers'
  ) THEN
    CREATE POLICY "Allow all operations on battlemap_covers"
      ON battlemap_covers
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

-- Reuse the timestamp trigger helper to keep updated_at in sync
CREATE TRIGGER update_battlemaps_updated_at
  BEFORE UPDATE ON battlemaps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_battlemap_covers_updated_at
  BEFORE UPDATE ON battlemap_covers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed a default battlemap so the application always has one available
INSERT INTO battlemaps (name, map_path, grid_data)
SELECT
  'Default Battlemap',
  '/maps/Training Ground.jpg',
  '{
    "verticalLines": [],
    "horizontalLines": [],
    "imageWidth": 0,
    "imageHeight": 0
  }'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM battlemaps);


