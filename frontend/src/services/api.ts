import axios from 'axios';
import { AuthToken, LoginCredentials, User, Project, Recording, Annotation } from '../types';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

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
    const response = await api.get<User[]>('/users');
    return response.data;
  },
  
  createUser: async (userData: Partial<User> & { password: string }): Promise<User> => {
    const response = await api.post<User>('/users', userData);
    return response.data;
  },
  
  updateUser: async (userId: number, userData: Partial<User>): Promise<User> => {
    const response = await api.put<User>(`/users/${userId}`, userData);
    return response.data;
  },
};

export const projectService = {
  getProjects: async (): Promise<Project[]> => {
    const response = await api.get<Project[]>('/projects');
    return response.data;
  },
  
  getProject: async (projectId: number): Promise<Project> => {
    const response = await api.get<Project>(`/projects/${projectId}`);
    return response.data;
  },
  
  createProject: async (projectData: Partial<Project>): Promise<Project> => {
    const response = await api.post<Project>('/projects', projectData);
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
  
  getRecordings: async (projectId: number): Promise<Recording[]> => {
    const response = await api.get<Recording[]>(`/recordings/${projectId}/recordings`);
    return response.data;
  },
  
  getRecording: async (recordingId: number): Promise<Recording> => {
    const response = await api.get<Recording>(`/recordings/${recordingId}`);
    return response.data;
  },
  
  deleteRecording: async (recordingId: number): Promise<void> => {
    await api.delete(`/recordings/${recordingId}`);
  },
  
  getRecordingUrl: (filePath: string): string => {
    return `${API_URL}/files/recordings/${filePath}`;
  },
  
  getSpectrogramUrl: (filePath: string): string => {
    return `${API_URL}/files/spectrograms/${filePath}`;
  },
};

export const annotationService = {
  getAnnotations: async (recordingId: number): Promise<Annotation[]> => {
    const response = await api.get<Annotation[]>(`/annotations/${recordingId}`);
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
    const response = await api.post<Annotation>(`/annotations/${recordingId}`, {
      bounding_boxes: boundingBoxes
    });
    return response.data;
  },
};

export default api;