export interface PaginationMetadata {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
  total_duration?: number; // Total duration in seconds for recordings
  finished_count?: number; // Total number of finished recordings
  annotated_count?: number; // Total number of annotated recordings
  spectrogram_ready_count?: number; // Spectrograms with status 'completed'
  spectrogram_generating_count?: number; // Spectrograms with status 'processing'
  spectrogram_queued_count?: number; // Spectrograms with status 'pending'
  spectrogram_failed_count?: number; // Spectrograms with status 'failed'
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMetadata;
}
