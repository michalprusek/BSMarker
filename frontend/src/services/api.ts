import axios from 'axios';
import { AuthToken, LoginCredentials, User, Project, Recording, Annotation } from '../types';

// Use relative URL to automatically use the same protocol as the page
const API_URL = process.env.REACT_APP_API_URL || '';

console.log('API Configuration:', {
  API_URL,
  baseURL: `${API_URL}/api/v1`,
  env: process.env.NODE_ENV,
  reactAppApiUrl: process.env.REACT_APP_API_URL
});

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout (increased from 10s)
});

console.log('Axios instance created with config:', {
  baseURL: api.defaults.baseURL,
  timeout: api.defaults.timeout,
  headers: api.defaults.headers
});

api.interceptors.request.use(
  (config) => {
    console.log('API Request Interceptor:', {
      url: `${config.baseURL}${config.url}`,
      method: config.method?.toUpperCase(),
      headers: config.headers,
      hasData: !!config.data
    });
    
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('API Request Interceptor: Added Bearer token to request');
    } else {
      console.log('API Request Interceptor: No token found in localStorage');
    }
    return config;
  },
  (error) => {
    console.error('API Request Interceptor Error:', error);
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    console.log('API Response Interceptor:', {
      url: response.config.url,
      status: response.status,
      statusText: response.statusText,
      hasData: !!response.data
    });
    return response;
  },
  (error) => {
    console.error('API Response Interceptor Error:', {
      url: error.config?.url,
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: error.message,
      code: error.code
    });
    
    if (error.response?.status === 401) {
      console.log('API Response Interceptor: 401 Unauthorized - removing token and redirecting to login');
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Health check function to test backend connectivity
export const healthCheck = async (): Promise<boolean> => {
  try {
    console.log('Health Check: Testing backend connectivity...');
    const response = await axios.get(`${API_URL}/docs`, { timeout: 5000 });
    console.log('Health Check: Backend is reachable', response.status);
    return true;
  } catch (error: any) {
    console.error('Health Check: Backend is not reachable:', {
      message: error.message,
      code: error.code,
      status: error.response?.status
    });
    return false;
  }
};

export const authService = {
  login: async (credentials: LoginCredentials): Promise<AuthToken> => {
    console.log('authService.login: Starting login request');
    console.log('authService.login: API base URL:', api.defaults.baseURL);
    console.log('authService.login: Full URL will be:', `${api.defaults.baseURL}/auth/login`);
    console.log('authService.login: Username:', credentials.username);
    
    try {
      const formData = new FormData();
      formData.append('username', credentials.username);
      formData.append('password', credentials.password);
      
      console.log('authService.login: FormData created with credentials');
      console.log('authService.login: About to send POST request');
      
      const startTime = Date.now();
      const response = await api.post<AuthToken>('/auth/login', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const endTime = Date.now();
      
      console.log(`authService.login: Request completed in ${endTime - startTime}ms`);
      console.log('authService.login: Response status:', response.status);
      console.log('authService.login: Response headers:', response.headers);
      console.log('authService.login: Response data:', {
        hasAccessToken: !!response.data?.access_token,
        tokenType: response.data?.token_type,
        tokenLength: response.data?.access_token?.length
      });
      
      if (!response.data?.access_token) {
        console.error('authService.login: No access_token in response data');
        throw new Error('No access token received from server');
      }
      
      console.log('authService.login: Returning successful response');
      return response.data;
      
    } catch (error: any) {
      console.error('authService.login: Request failed:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        method: error.config?.method,
        baseURL: error.config?.baseURL,
        responseData: error.response?.data,
        responseHeaders: error.response?.headers,
        requestHeaders: error.config?.headers,
        timeout: error.config?.timeout,
        code: error.code,
        stack: error.stack
      });
      
      // Network error handling
      if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
        console.error('authService.login: Network connection failed - backend may be down');
        const networkError = new Error('Unable to connect to server. Please check if the backend is running.');
        throw networkError;
      }
      
      // Timeout error handling
      if (error.code === 'ECONNABORTED') {
        console.error('authService.login: Request timeout');
        const timeoutError = new Error('Login request timed out. Please try again.');
        throw timeoutError;
      }
      
      throw error;
    }
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
  uploadRecording: async (
    projectId: number, 
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<Recording> => {
    console.log(`RecordingService: Uploading ${file.name} to project ${projectId}`);
    console.log(`RecordingService: File size: ${(file.size/1024/1024).toFixed(2)} MB`);
    console.log(`RecordingService: File type: ${file.type || 'unknown'}`);
    
    // Validate file before sending
    if (file.size === 0) {
      throw new Error('File is empty');
    }
    
    if (file.size > 100 * 1024 * 1024) {
      throw new Error(`File too large: ${(file.size/1024/1024).toFixed(2)} MB (max 100 MB)`);
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      console.log(`RecordingService: Sending POST to /recordings/${projectId}/upload`);
      const response = await api.post<Recording>(
        `/recordings/${projectId}/upload`,
        formData,
        { 
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 180000, // 3 minute timeout for uploads (includes spectrogram generation time)
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percentComplete = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              console.log(`RecordingService: Upload progress for ${file.name}: ${percentComplete}%`);
              if (onProgress) {
                onProgress(percentComplete);
              }
            }
          }
        }
      );
      console.log(`RecordingService: Upload successful for ${file.name}`, response.data);
      return response.data;
    } catch (error: any) {
      console.error(`RecordingService: Upload failed for ${file.name}`, error);
      console.error(`RecordingService: Error details:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers
      });
      
      // Provide better error messages
      if (error.response?.status === 400) {
        const detail = error.response.data?.detail;
        if (detail) {
          throw new Error(detail);
        }
      } else if (error.response?.status === 413) {
        throw new Error('File too large for server');
      } else if (error.response?.status === 415) {
        throw new Error('Unsupported file format');
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Upload timeout - file may be too large or connection is slow');
      }
      
      throw error;
    }
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
    console.log('createOrUpdateAnnotation called with:', {
      recordingId,
      boundingBoxesCount: boundingBoxes.length,
      rawBoxes: boundingBoxes
    });

    // Ensure all required fields are present for each bounding box
    const validBoxes = boundingBoxes.map(box => ({
      x: Number(box.x) || 0,
      y: Number(box.y) || 0,
      width: Number(box.width) || 0,
      height: Number(box.height) || 0,
      start_time: Number(box.start_time) || 0,
      end_time: Number(box.end_time) || 0,
      min_frequency: box.min_frequency !== undefined ? Number(box.min_frequency) : null,
      max_frequency: box.max_frequency !== undefined ? Number(box.max_frequency) : null,
      label: String(box.label || 'None'),
      confidence: box.confidence !== undefined ? Number(box.confidence) : null,
      metadata: box.metadata || null
    }));
    
    console.log('After mapping - validBoxes:', validBoxes);
    
    // Filter out invalid boxes (with NaN or invalid values)
    const filteredBoxes = validBoxes.filter(box => 
      !isNaN(box.x) && !isNaN(box.y) && 
      !isNaN(box.width) && !isNaN(box.height) &&
      !isNaN(box.start_time) && !isNaN(box.end_time) &&
      box.width > 0 && box.height > 0 &&
      box.end_time > box.start_time
    );
    
    console.log('After filtering - filteredBoxes:', filteredBoxes);
    
    // Backend expects AnnotationCreate schema with recording_id and bounding_boxes
    const payload = {
      recording_id: recordingId,
      bounding_boxes: filteredBoxes
    };
    
    console.log('Final payload being sent to API:', JSON.stringify(payload, null, 2));
    
    try {
      const response = await api.post<Annotation>(`/annotations/${recordingId}`, payload);
      console.log('Annotation saved successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('Failed to save annotation:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      console.error('Full error object:', error);
      
      // Log the exact validation error from backend
      if (error.response?.data?.detail) {
        console.error('Backend validation error detail:', error.response.data.detail);
        if (Array.isArray(error.response.data.detail)) {
          error.response.data.detail.forEach((err: any, index: number) => {
            console.error(`Validation error ${index}:`, err);
          });
        }
      }
      
      throw error;
    }
  },
};

export default api;