-- Spawn area: a per-battlemap rectangle (image-relative %) that tells the
-- server where to drop player tokens when they connect or when the active
-- battlemap changes. Stored as JSONB so the shape can grow later (e.g. radius,
-- rotation) without another migration.

ALTER TABLE battlemaps
  ADD COLUMN IF NOT EXISTS spawn_area JSONB;

-- Default spawn area: a 20%x20% square centred on the map. Used until the GM
-- draws a real one in the dashboard.
UPDATE battlemaps
SET spawn_area = '{"x": 40, "y": 40, "width": 20, "height": 20}'::jsonb
WHERE spawn_area IS NULL;
