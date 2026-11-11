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
import { TOKEN_KEY, USER_KEY } from "../utils/storage";

// Use relative URL to automatically use the same protocol as the page
const API_URL = process.env.REACT_APP_API_URL || "";

// Only log in development mode to prevent leaking sensitive info in production
const IS_DEV = process.env.NODE_ENV === "development";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    const token = localStorage.getItem(TOKEN_KEY);
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

// Session keep-alive: swap the token for a fresh one shortly before it
// expires, so an open tab never logs the user out mid-work. Only the request
// interceptor below ends a session (on a real 401/403 auth error); a failed
// refresh because of the network is simply retried.
const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;
const REFRESH_RETRY_MS = 30 * 1000;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const tokenExpiry = (token: string): number | null => {
  try {
    // Decoded without verification, only to schedule the refresh.
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
};

const refreshToken = async () => {
  const sent = localStorage.getItem(TOKEN_KEY);
  if (!sent) return; // logged out meanwhile
  try {
    const response = await api.post<AuthToken>("/auth/refresh");
    // A logout (or a login as someone else) during the request wins.
    if (localStorage.getItem(TOKEN_KEY) !== sent) return;
    localStorage.setItem(TOKEN_KEY, response.data.access_token);
    scheduleTokenRefresh();
  } catch (error: unknown) {
    // 401/403 log out via the response interceptor; 400/404 mean an inactive
    // or deleted user. Anything else (network, 5xx during a deploy, 429) is
    // transient — keep trying while the token is still valid.
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status !== undefined && [400, 401, 403, 404].includes(status)) return;
    const expiry = tokenExpiry(sent);
    if (expiry === null || expiry <= Date.now()) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshToken, REFRESH_RETRY_MS);
  }
};

const scheduleTokenRefresh = () => {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;

  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = token ? tokenExpiry(token) : null;
  if (expiry === null || expiry <= Date.now()) return;

  const delay = Math.max(0, expiry - Date.now() - REFRESH_BEFORE_EXPIRY_MS);
  refreshTimer = setTimeout(refreshToken, delay);
};

// Also after a page reload, not just after login. Browsers throttle or freeze
// timers in background tabs and during sleep, so re-check when the tab returns.
scheduleTokenRefresh();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") scheduleTokenRefresh();
});
window.addEventListener("online", scheduleTokenRefresh);

// Call on login success
export const setAuthToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token);
  scheduleTokenRefresh();
};

export const clearAuthToken = () => {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
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
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);

        // Only redirect if not already on login page
        if (!window.location.pathname.includes("/login")) {
          window.location.href = `${process.env.PUBLIC_URL}/login`;
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
    if (
      axios.isAxiosError(error) &&
      (error.response?.status === 401 || error.response?.status === 403)
    ) {
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

  changePassword: async (
    currentPassword: string,
    newPassword: string,
  ): Promise<void> => {
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

  toggleFinished: async (recordingId: number): Promise<Recording> => {
    const response = await api.patch<Recording>(
      `/recordings/${recordingId}/finished`,
    );
    return response.data;
  },
};

export const annotationService = {
  getAnnotations: async (recordingId: number): Promise<Annotation[]> => {
    const response = await api.get<Annotation[]>(`/annotations/${recordingId}`);
    return response.data;
  },
};

export default api;
