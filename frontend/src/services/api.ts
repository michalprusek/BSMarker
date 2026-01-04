import axios from "axios";
import {
  AuthToken,
  LoginCredentials,
  User,
  Project,
  Recording,
  Annotation,
} from "../types";
import { PaginatedResponse } from "../types/pagination";

// Use relative URL to automatically use the same protocol as the page
const API_URL = process.env.REACT_APP_API_URL || "";

// Only log in development mode to prevent leaking sensitive info in production
const IS_DEV = process.env.NODE_ENV === "development";
const debugLog = (...args: unknown[]) => {
  if (IS_DEV) {
    console.log(...args);
  }
};

if (IS_DEV) {
  console.log("API Configuration:", {
    API_URL,
    baseURL: API_URL,
    env: process.env.NODE_ENV,
  });
}

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000, // 30 second timeout (increased from 10s)
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    console.error("API Request Interceptor Error:", error);
    return Promise.reject(error);
  },
);

// Token refresh configuration
let refreshTimer: NodeJS.Timeout | null = null;

const scheduleTokenRefresh = () => {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    // Decode JWT to get expiry (without verification, just for scheduling)
    const payload = JSON.parse(atob(token.split(".")[1]));
    const expiryTime = payload.exp * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    const timeUntilExpiry = expiryTime - currentTime;

    // Refresh 5 minutes before expiry
    const refreshTime = timeUntilExpiry - 5 * 60 * 1000;

    if (refreshTime > 0) {
      refreshTimer = setTimeout(async () => {
        try {
          // Call refresh endpoint (if exists) or re-login
          const response = await api.post("/auth/refresh");
          if (response.data.access_token) {
            localStorage.setItem("token", response.data.access_token);
            scheduleTokenRefresh(); // Schedule next refresh
          }
        } catch (error) {
          console.error("Token refresh failed:", error);
        }
      }, refreshTime);
    }
  } catch (error) {
    console.error("Error scheduling token refresh:", error);
  }
};

// Call on login success
export const setAuthToken = (token: string) => {
  localStorage.setItem("token", token);
  scheduleTokenRefresh();
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      // Check if it's a real auth error vs other 403 (like rate limiting)
      const isAuthError =
        error.response?.data?.detail?.toLowerCase().includes("credential") ||
        error.response?.data?.detail?.toLowerCase().includes("token") ||
        error.response?.data?.detail?.toLowerCase().includes("expired") ||
        error.response?.data?.detail?.toLowerCase().includes("invalid") ||
        error.response?.data?.detail?.toLowerCase().includes("unauthorized") ||
        error.response?.status === 401; // Always treat 401 as auth error

      if (isAuthError) {
        // Clear token and redirect to login
        localStorage.removeItem("token");
        localStorage.removeItem("user");

        // Only redirect if not already on login page
        if (!window.location.pathname.includes("/login")) {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  },
);

// Health check function to test backend connectivity
export const healthCheck = async (): Promise<boolean> => {
  try {
    // Use a simple API endpoint that always works
    await axios.get(`${API_URL}/projects/`, { timeout: 5000 });
    return true;
  } catch (error: unknown) {
    // 401/403 means backend is up but requires auth - this is success for health check
    if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
      return true;
    }
    return false;
  }
};

export const authService = {
  login: async (credentials: LoginCredentials): Promise<AuthToken> => {
    try {
      const formData = new FormData();
      formData.append("username", credentials.username);
      formData.append("password", credentials.password);

      const response = await api.post<AuthToken>("/auth/login", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (!response.data?.access_token) {
        throw new Error("No access token received from server");
      }

      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        // Network error handling
        if (error.code === "ECONNREFUSED" || error.code === "ERR_NETWORK") {
          throw new Error(
            "Unable to connect to server. Please check if the backend is running.",
          );
        }

        // Timeout error handling
        if (error.code === "ECONNABORTED") {
          throw new Error("Login request timed out. Please try again.");
        }
      }

      throw error;
    }
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await api.get<User>("/auth/me");
    return response.data;
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await api.post("/auth/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },
};

export const userService = {
  getUsers: async (): Promise<User[]> => {
    const response = await api.get<User[]>("/users/");
    return response.data;
  },

  createUser: async (
    userData: Partial<User> & { password: string },
  ): Promise<User> => {
    const response = await api.post<User>("/users/", userData);
    return response.data;
  },

  updateUser: async (
    userId: number,
    userData: Partial<User>,
  ): Promise<User> => {
    const response = await api.put<User>(`/users/${userId}`, userData);
    return response.data;
  },
};

export const projectService = {
  getProjects: async (): Promise<Project[]> => {
    const response = await api.get<Project[]>("/projects/");
    return response.data;
  },

  getProject: async (projectId: number): Promise<Project> => {
    const response = await api.get<Project>(`/projects/${projectId}`);
    return response.data;
  },

  createProject: async (projectData: Partial<Project>): Promise<Project> => {
    const response = await api.post<Project>("/projects/", projectData);
    return response.data;
  },

  updateProject: async (
    projectId: number,
    projectData: Partial<Project>,
  ): Promise<Project> => {
    const response = await api.put<Project>(
      `/projects/${projectId}`,
      projectData,
    );
    return response.data;
  },

  deleteProject: async (projectId: number): Promise<void> => {
    await api.delete(`/projects/${projectId}`);
  },

  exportAnnotations: async (
    projectId: number,
    filters?: {
      search?: string;
      min_duration?: number;
      max_duration?: number;
      annotation_status?: string;
    },
    onProgress?: (loaded: number) => void,
  ): Promise<Blob> => {
    const response = await api.get(
      `/projects/${projectId}/annotations/export`,
      {
        params: { include: "annotations", ...filters },
        responseType: "blob",
        timeout: 1800000, // 30 minute timeout for large exports
        onDownloadProgress: (progressEvent) => {
          if (onProgress && progressEvent.loaded) {
            onProgress(progressEvent.loaded);
          }
        },
      },
    );
    return response.data;
  },

  exportFull: async (
    projectId: number,
    filters?: {
      search?: string;
      min_duration?: number;
      max_duration?: number;
      annotation_status?: string;
    },
    onProgress?: (loaded: number) => void,
  ): Promise<Blob> => {
    const response = await api.get(
      `/projects/${projectId}/annotations/export`,
      {
        params: { include: "full", ...filters },
        responseType: "blob",
        timeout: 1800000, // 30 minute timeout for full exports with audio
        onDownloadProgress: (progressEvent) => {
          if (onProgress && progressEvent.loaded) {
            onProgress(progressEvent.loaded);
          }
        },
      },
    );
    return response.data;
  },
};

export const recordingService = {
  uploadRecording: async (
    projectId: number,
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<Recording> => {
    // Validate file before sending
    if (file.size === 0) {
      throw new Error("File is empty");
    }

    if (file.size > 100 * 1024 * 1024) {
      throw new Error(
        `File too large: ${(file.size / 1024 / 1024).toFixed(2)} MB (max 100 MB)`,
      );
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await api.post<Recording>(
        `/recordings/${projectId}/upload`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 180000, // 3 minute timeout for uploads (includes spectrogram generation time)
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total && onProgress) {
              const percentComplete = Math.round(
                (progressEvent.loaded * 100) / progressEvent.total,
              );
              onProgress(percentComplete);
            }
          },
        },
      );
      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        // Provide better error messages
        if (error.response?.status === 400) {
          const detail = error.response.data?.detail;
          if (detail) {
            throw new Error(detail);
          }
        } else if (error.response?.status === 413) {
          throw new Error("File too large for server");
        } else if (error.response?.status === 415) {
          throw new Error("Unsupported file format");
        } else if (error.code === "ECONNABORTED") {
          throw new Error(
            "Upload timeout - file may be too large or connection is slow",
          );
        }
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
      skip?: number;
      limit?: number;
      annotation_status?: string;
    },
  ): Promise<PaginatedResponse<Recording>> => {
    const response = await api.get<PaginatedResponse<Recording>>(
      `/recordings/${projectId}/recordings`,
      {
        params: {
          skip: params?.skip || 0,
          limit: params?.limit || 50,
          ...params,
        },
      },
    );
    return response.data;
  },

  getRecording: async (recordingId: number): Promise<Recording> => {
    const response = await api.get<Recording>(`/recordings/${recordingId}`);
    return response.data;
  },

  deleteRecording: async (recordingId: number): Promise<void> => {
    await api.delete(`/recordings/${recordingId}`);
  },

  bulkDeleteRecordings: async (
    projectId: number,
    recordingIds: number[],
  ): Promise<void> => {
    await api.post(`/recordings/${projectId}/bulk-delete`, recordingIds);
  },

  getRecordingUrl: (filePath: string): string => {
    const token = localStorage.getItem("token");
    const baseUrl = API_URL.replace(/\/api\/v1$/, '');
    return `${baseUrl}/files/recordings/${filePath}?token=${token}`;
  },

  getSpectrogramStatus: async (
    recordingId: number,
  ): Promise<{
    status: string;
    recording_id: number;
    available: boolean;
    error_message?: string;
    processing_time?: number;
    width?: number;
    height?: number;
    created_at?: string;
    updated_at?: string;
  }> => {
    const response = await api.get(
      `/recordings/${recordingId}/spectrogram/status`,
    );
    return response.data;
  },

  getSpectrogramUrl: async (recordingId: number): Promise<string | null> => {
    try {
      const status = await recordingService.getSpectrogramStatus(recordingId);

      if (status.status === "completed" && status.available) {
        // Return direct API URL for completed spectrograms with cache-busting timestamp
        const timestamp = Date.now();
        return `${API_URL}/recordings/${recordingId}/spectrogram?v=${timestamp}`;
      }

      return null; // Spectrogram not ready yet
    } catch (error) {
      console.error("Failed to get spectrogram URL:", error);
      return null;
    }
  },

  getSpectrogramBlob: async (recordingId: number): Promise<Blob | null> => {
    try {
      // Add cache-busting timestamp to prevent stale spectrograms
      const timestamp = Date.now();
      const response = await api.get(
        `/recordings/${recordingId}/spectrogram?v=${timestamp}`,
        {
          responseType: "blob",
        },
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 202) {
        // Spectrogram is being generated
        return null;
      }
      throw error;
    }
  },

  downloadRecording: async (recordingId: number): Promise<Blob> => {
    const recording = await recordingService.getRecording(recordingId);
    const token = localStorage.getItem("token");
    const baseUrl = API_URL.replace(/\/api\/v1$/, '');
    const response = await fetch(
      `${baseUrl}/files/recordings/${recording.file_path}?token=${token}`,
    );
    if (!response.ok) {
      throw new Error(`Failed to download recording: ${response.status}`);
    }
    return response.blob();
  },

  getAuthenticatedBlob: async (url: string): Promise<string> => {
    const token = localStorage.getItem("token");
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },

  toggleFinished: async (recordingId: number): Promise<Recording> => {
    const response = await api.patch<Recording>(`/recordings/${recordingId}/finished`);
    return response.data;
  },
};

export const annotationService = {
  getAnnotations: async (recordingId: number): Promise<Annotation[]> => {
    const response = await api.get<Annotation[]>(`/annotations/${recordingId}`);
    return response.data;
  },

  createAnnotation: async (
    recordingId: number,
    annotationData: Partial<Annotation>,
  ): Promise<Annotation> => {
    const response = await api.post<Annotation>(
      `/annotations/${recordingId}`,
      annotationData,
    );
    return response.data;
  },

  updateAnnotation: async (
    annotationId: number,
    annotationData: Partial<Annotation>,
  ): Promise<Annotation> => {
    const response = await api.put<Annotation>(
      `/annotations/${annotationId}`,
      annotationData,
    );
    return response.data;
  },

  deleteAnnotation: async (annotationId: number): Promise<void> => {
    await api.delete(`/annotations/${annotationId}`);
  },

  createOrUpdateAnnotation: async (
    recordingId: number,
    boundingBoxes: unknown[],
  ): Promise<Annotation> => {
    // Ensure all required fields are present for each bounding box
    // Round coordinates to prevent floating-point precision issues
    const validBoxes = boundingBoxes.map((box: unknown) => {
      const b = box as Record<string, unknown>;
      return {
        x: Math.round(Number(b.x) || 0),
        y: Math.round(Number(b.y) || 0),
        width: Math.round(Number(b.width) || 0),
        height: Math.round(Number(b.height) || 0),
        start_time: Number(b.start_time) || 0,
        end_time: Number(b.end_time) || 0,
        min_frequency:
          b.min_frequency !== undefined ? Number(b.min_frequency) : null,
        max_frequency:
          b.max_frequency !== undefined ? Number(b.max_frequency) : null,
        label: String(b.label || "None"),
        confidence: b.confidence !== undefined ? Number(b.confidence) : null,
        metadata: (b.metadata as Record<string, unknown>) || null,
      };
    });

    // Filter out invalid boxes (with NaN or invalid values)
    const filteredBoxes = validBoxes.filter(
      (box) =>
        !isNaN(box.x) &&
        !isNaN(box.y) &&
        !isNaN(box.width) &&
        !isNaN(box.height) &&
        !isNaN(box.start_time) &&
        !isNaN(box.end_time) &&
        box.width > 0 &&
        box.height > 0 &&
        box.end_time > box.start_time,
    );

    // Backend expects AnnotationCreate schema with recording_id and bounding_boxes
    const payload = {
      recording_id: recordingId,
      bounding_boxes: filteredBoxes,
    };

    const response = await api.post<Annotation>(
      `/annotations/${recordingId}`,
      payload,
    );
    return response.data;
  },
};

export default api;
