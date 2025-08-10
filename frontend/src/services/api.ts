import axios from 'axios';
import { AuthToken, LoginCredentials, User, Project, Recording, Annotation } from '../types';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8123';

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authService = {
  login: async (credentials: LoginCredentials): Promise<AuthToken> => {
    const formData = new FormData();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);
    const response = await api.post<AuthToken>('/auth/login', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  
  getCurrentUser: async (): Promise<User> => {
    const response = await api.get<User>('/auth/me');
    return response.data;
  },
};

export const userService = {
  getUsers: async (): Promise<User[]> => {
    const response = await api.get<User[]>('/users/');
    return response.data;
  },
  
  createUser: async (userData: Partial<User> & { password: string }): Promise<User> => {
    const response = await api.post<User>('/users/', userData);
    return response.data;
  },
  
  updateUser: async (userId: number, userData: Partial<User>): Promise<User> => {
    const response = await api.put<User>(`/users/${userId}`, userData);
    return response.data;
  },
};

export const projectService = {
  getProjects: async (): Promise<Project[]> => {
    const response = await api.get<Project[]>('/projects/');
    return response.data;
  },
  
  getProject: async (projectId: number): Promise<Project> => {
    const response = await api.get<Project>(`/projects/${projectId}`);
    return response.data;
  },
  
  createProject: async (projectData: Partial<Project>): Promise<Project> => {
    const response = await api.post<Project>('/projects/', projectData);
    return response.data;
  },
  
  updateProject: async (projectId: number, projectData: Partial<Project>): Promise<Project> => {
    const response = await api.put<Project>(`/projects/${projectId}`, projectData);
    return response.data;
  },
  
  deleteProject: async (projectId: number): Promise<void> => {
    await api.delete(`/projects/${projectId}`);
  },
};

export const recordingService = {
  uploadRecording: async (projectId: number, file: File): Promise<Recording> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<Recording>(
      `/recordings/${projectId}/upload`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },
  
  getRecordings: async (
    projectId: number,
    params?: {
      search?: string;
      min_duration?: number;
      max_duration?: number;
      sort_by?: string;
      sort_order?: string;
    }
  ): Promise<Recording[]> => {
    const response = await api.get<Recording[]>(`/recordings/${projectId}/recordings`, { params });
    return response.data;
  },
  
  getRecording: async (recordingId: number): Promise<Recording> => {
    const response = await api.get<Recording>(`/recordings/${recordingId}`);
    return response.data;
  },
  
  deleteRecording: async (recordingId: number): Promise<void> => {
    await api.delete(`/recordings/${recordingId}`);
  },
  
  bulkDeleteRecordings: async (projectId: number, recordingIds: number[]): Promise<void> => {
    await api.post(`/recordings/${projectId}/bulk-delete`, recordingIds);
  },
  
  getRecordingUrl: (filePath: string): string => {
    const token = localStorage.getItem('token');
    return `${API_URL}/files/recordings/${filePath}?token=${token}`;
  },
  
  getSpectrogramUrl: async (recordingId: number): Promise<string | null> => {
    try {
      // Get the spectrogram URL directly from the API
      const token = localStorage.getItem('token');
      const response = await api.get(`/recordings/${recordingId}/spectrogram-url`);
      if (response.data && response.data.url) {
        return `${API_URL}${response.data.url}?token=${token}`;
      }
      // Fallback to constructing URL from recording ID
      return `${API_URL}/files/spectrograms/${recordingId}_spectrogram.png?token=${token}`;
    } catch (error) {
      console.error('Failed to get spectrogram URL:', error);
      // Fallback URL
      const token = localStorage.getItem('token');
      return `${API_URL}/files/spectrograms/${recordingId}_spectrogram.png?token=${token}`;
    }
  },
  
  downloadRecording: async (recordingId: number): Promise<Blob> => {
    const recording = await recordingService.getRecording(recordingId);
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/files/recordings/${recording.file_path}?token=${token}`);
    if (!response.ok) {
      throw new Error(`Failed to download recording: ${response.status}`);
    }
    return response.blob();
  },
  
  getAuthenticatedBlob: async (url: string): Promise<string> => {
    const token = localStorage.getItem('token');
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },
};

export const annotationService = {
  getAnnotations: async (recordingId: number): Promise<Annotation[]> => {
    const response = await api.get<Annotation[]>(`/annotations/${recordingId}/`);
    return response.data;
  },
  
  createAnnotation: async (recordingId: number, annotationData: Partial<Annotation>): Promise<Annotation> => {
    const response = await api.post<Annotation>(`/annotations/${recordingId}`, annotationData);
    return response.data;
  },
  
  updateAnnotation: async (annotationId: number, annotationData: Partial<Annotation>): Promise<Annotation> => {
    const response = await api.put<Annotation>(`/annotations/${annotationId}`, annotationData);
    return response.data;
  },
  
  deleteAnnotation: async (annotationId: number): Promise<void> => {
    await api.delete(`/annotations/${annotationId}`);
  },
  
  createOrUpdateAnnotation: async (recordingId: number, boundingBoxes: any[]): Promise<Annotation> => {
    // Ensure all required fields are present for each bounding box
    const validBoxes = boundingBoxes.map(box => ({
      x: box.x || 0,
      y: box.y || 0,
      width: box.width || 0,
      height: box.height || 0,
      start_time: box.start_time || 0,
      end_time: box.end_time || 0,
      min_frequency: box.min_frequency || 0,
      max_frequency: box.max_frequency || 10000,
      label: box.label || 'None',
      confidence: box.confidence || null,
      metadata: box.metadata || null
    }));
    
    const response = await api.post<Annotation>(`/annotations/${recordingId}`, {
      bounding_boxes: validBoxes
    });
    return response.data;
  },
};

export default api;