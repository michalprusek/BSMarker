export interface PaginationMetadata {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
  total_duration?: number; // Total duration in seconds for recordings
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMetadata;
}
