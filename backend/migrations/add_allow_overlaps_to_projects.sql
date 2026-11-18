-- Per-project switch: may syllables overlap in time?
-- Adds a column only; no existing row or annotation is changed (all projects
-- start with FALSE, i.e. the current behaviour). Run BEFORE deploying the
-- backend that reads it. Safe to run twice.

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS allow_overlaps BOOLEAN DEFAULT FALSE NOT NULL;

-- Verify the migration
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'projects' AND column_name = 'allow_overlaps';
