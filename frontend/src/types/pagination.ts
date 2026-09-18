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
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMetadata;
}
