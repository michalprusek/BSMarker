export interface User {
  id: number;
  email: string;
  username: string;
  full_name?: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  owner_id: number;
  created_at: string;
  updated_at?: string;
}

export interface Recording {
  id: number;
  filename: string;
  original_filename: string;
  file_path: string;
  duration?: number;
  sample_rate?: number;
  project_id: number;
  created_at: string;
  annotation_count?: number;
}

export interface Spectrogram {
  id: number;
  recording_id: number;
  image_path: string;
  parameters: any;
  width: number;
  height: number;
  created_at: string;
}

export interface BoundingBox {
  id?: number;
  annotation_id?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  start_time: number;
  end_time: number;
  min_frequency?: number;
  max_frequency?: number;
  label?: string;
  confidence?: number;
  metadata?: any;
}

export interface Annotation {
  id: number;
  recording_id: number;
  user_id: number;
  created_at: string;
  updated_at?: string;
  bounding_boxes: BoundingBox[];
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
}
