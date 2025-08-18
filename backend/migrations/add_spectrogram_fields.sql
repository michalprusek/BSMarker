-- Migration script to add new fields to spectrograms table
-- Run this script in the database to add support for multi-resolution spectrograms

-- Add new columns to spectrograms table
ALTER TABLE spectrograms 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending' NOT NULL,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS processing_time FLOAT,
ADD COLUMN IF NOT EXISTS thumbnail_path VARCHAR(255),
ADD COLUMN IF NOT EXISTS standard_path VARCHAR(255),
ADD COLUMN IF NOT EXISTS full_path VARCHAR(255),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create enum for status if it doesn't exist (PostgreSQL-specific)
DO $$ BEGIN
    CREATE TYPE spectrogramstatus AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Alter status column to use enum (PostgreSQL-specific)
-- ALTER TABLE spectrograms ALTER COLUMN status TYPE spectrogramstatus USING status::spectrogramstatus;

-- Make image_path nullable for backward compatibility
ALTER TABLE spectrograms ALTER COLUMN image_path DROP NOT NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_spectrograms_status ON spectrograms(status);
CREATE INDEX IF NOT EXISTS idx_spectrograms_recording_id_status ON spectrograms(recording_id, status);

-- Update existing records to have 'completed' status if they have an image_path
UPDATE spectrograms 
SET status = 'completed', 
    standard_path = image_path,
    updated_at = NOW()
WHERE image_path IS NOT NULL AND status = 'pending';

-- Add trigger to update updated_at column automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS update_spectrograms_updated_at ON spectrograms;
CREATE TRIGGER update_spectrograms_updated_at 
    BEFORE UPDATE ON spectrograms 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Verify the migration
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'spectrograms' 
ORDER BY ordinal_position;