-- The "covers" feature was replaced by fog-of-war (commit e0cc0a0). The
-- battlemap_covers table has been dormant since — server.js no longer reads
-- or writes to it. Drop it cleanly.

DROP TRIGGER IF EXISTS update_battlemap_covers_updated_at ON battlemap_covers;

DROP TABLE IF EXISTS battlemap_covers;
