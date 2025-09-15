-- Performance Optimization Indexes for BSMarker
-- Handles 1000+ recordings efficiently
-- Created: 2025-01-14

-- Primary Performance Indexes for Recordings
CREATE INDEX IF NOT EXISTS idx_recordings_project_id ON recordings(project_id);
CREATE INDEX IF NOT EXISTS idx_recordings_created_at ON recordings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recordings_duration ON recordings(duration);
CREATE INDEX IF NOT EXISTS idx_recordings_user_id ON recordings(user_id);

-- Indexes for Annotations
CREATE INDEX IF NOT EXISTS idx_annotations_recording_id ON annotations(recording_id);
CREATE INDEX IF NOT EXISTS idx_annotations_user_id ON annotations(user_id);
CREATE INDEX IF NOT EXISTS idx_annotations_created_at ON annotations(created_at DESC);

-- Indexes for Bounding Boxes
CREATE INDEX IF NOT EXISTS idx_bounding_boxes_annotation_id ON bounding_boxes(annotation_id);
CREATE INDEX IF NOT EXISTS idx_bounding_boxes_label_id ON bounding_boxes(label_id);

-- Indexes for Projects
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);

-- Indexes for Spectrograms
CREATE INDEX IF NOT EXISTS idx_spectrograms_recording_id ON spectrograms(recording_id);
CREATE INDEX IF NOT EXISTS idx_spectrograms_status ON spectrograms(status);

-- Composite Indexes for Complex Queries
CREATE INDEX IF NOT EXISTS idx_recordings_project_search ON recordings(project_id, original_filename);
CREATE INDEX IF NOT EXISTS idx_recordings_project_created ON recordings(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recordings_project_status ON recordings(project_id, upload_status);

-- Partial Indexes for Common Filters
CREATE INDEX IF NOT EXISTS idx_recordings_active ON recordings(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_spectrograms_pending ON spectrograms(recording_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_spectrograms_completed ON spectrograms(recording_id) WHERE status = 'completed';

-- Statistics Update for Query Planner
ANALYZE recordings;
ANALYZE annotations;
ANALYZE bounding_boxes;
ANALYZE projects;
ANALYZE spectrograms;