-- Migration script to add is_finished field to recordings table
-- This field allows users to mark recordings as "finished" (completed annotation)

-- Add is_finished column to recordings table
ALTER TABLE recordings
ADD COLUMN IF NOT EXISTS is_finished BOOLEAN DEFAULT FALSE NOT NULL;

-- Create index for performance when filtering by finished status
CREATE INDEX IF NOT EXISTS idx_recordings_is_finished ON recordings (
    is_finished
);

-- Create composite index for project_id + is_finished for efficient filtering
CREATE INDEX IF NOT EXISTS idx_recordings_project_finished ON recordings (
    project_id, is_finished
);

-- Verify the migration
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'recordings' AND column_name = 'is_finished';
