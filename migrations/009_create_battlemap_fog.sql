-- Persist fog-of-war shapes across server restarts.
-- Fog was previously in-memory only (battlemap.fogByImage); now it's mirrored
-- through this table on add/remove/update/clear from server.js.

CREATE TABLE IF NOT EXISTS battlemap_fog (
  id TEXT PRIMARY KEY,
  battlemap_id UUID NOT NULL REFERENCES battlemaps(id) ON DELETE CASCADE,
  battlemap_image_id UUID NOT NULL REFERENCES battlemap_images(id) ON DELETE CASCADE,
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  width DOUBLE PRECISION NOT NULL DEFAULT 0,
  height DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_battlemap_fog_battlemap_id ON battlemap_fog(battlemap_id);
CREATE INDEX IF NOT EXISTS idx_battlemap_fog_image_id ON battlemap_fog(battlemap_image_id);

ALTER TABLE battlemap_fog ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'battlemap_fog'
      AND policyname = 'Allow all operations on battlemap_fog'
  ) THEN
    CREATE POLICY "Allow all operations on battlemap_fog"
      ON battlemap_fog
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

CREATE TRIGGER update_battlemap_fog_updated_at
  BEFORE UPDATE ON battlemap_fog
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
