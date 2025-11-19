ALTER TABLE battlemaps
ADD COLUMN IF NOT EXISTS sort_index INTEGER;

WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY created_at ASC) - 1 AS rn
  FROM battlemaps
)
UPDATE battlemaps AS b
SET sort_index = ordered.rn
FROM ordered
WHERE b.id = ordered.id
  AND b.sort_index IS NULL;

ALTER TABLE battlemaps
ALTER COLUMN sort_index SET DEFAULT 0;

ALTER TABLE battlemaps
ALTER COLUMN sort_index SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_battlemaps_sort_index ON battlemaps(sort_index ASC);

