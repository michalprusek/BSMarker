/**
 * Centralized notification management for BSMarker
 * Provides consistent toast messaging across the application with rate limiting
 * Uses react-hot-toast for consistency with the rest of the application
 */

import toast, { Toast } from "react-hot-toast";
import { logger } from "./logger";

export enum NotificationType {
  SUCCESS = "success",
  ERROR = "error",
  WARNING = "warning",
  INFO = "info",
}

// Rate limiting configuration
interface RateLimitConfig {
  maxNotifications: number;
  windowMs: number;
}

class NotificationRateLimiter {
  private notificationTimestamps: Map<string, number[]> = new Map();
  private config: RateLimitConfig = {
    maxNotifications: 3, // Max 3 notifications of same type
    windowMs: 5000, // Within 5 seconds
  };

  /**
   * Check if a notification should be shown based on rate limits
   * @param key - Unique key for the notification type
   * @returns Whether the notification should be shown
   */
  shouldShow(key: string): boolean {
    const now = Date.now();
    const timestamps = this.notificationTimestamps.get(key) || [];

    // Remove old timestamps outside the window
    const recentTimestamps = timestamps.filter(
      (timestamp) => now - timestamp < this.config.windowMs,
    );

    // Check if we're under the limit
    if (recentTimestamps.length >= this.config.maxNotifications) {
      logger.debug(
        `Rate limit hit for notification: ${key}`,
        "NotificationRateLimiter",
      );
      return false;
    }

    // Add current timestamp and update map
    recentTimestamps.push(now);
    this.notificationTimestamps.set(key, recentTimestamps);

    return true;
  }

  /**
   * Clear all rate limit data
   */
  reset(): void {
    this.notificationTimestamps.clear();
  }
}

const rateLimiter = new NotificationRateLimiter();

// Standardized message templates
export const Messages = {
  // Authentication
  AUTH: {
    LOGIN_SUCCESS: "Successfully logged in!",
    LOGIN_ERROR: "Login failed. Please check your credentials.",
    LOGOUT_SUCCESS: "Successfully logged out",
    SESSION_EXPIRED: "Session expired. Please login again.",
    UNAUTHORIZED: "You are not authorized to perform this action",
  },

  // User Management
  USER: {
    CREATE_SUCCESS: "User created successfully",
    UPDATE_SUCCESS: "User updated successfully",
    DELETE_SUCCESS: "User deleted successfully",
    FETCH_ERROR: "Failed to fetch users",
    CREATE_ERROR: "Failed to create user",
    UPDATE_ERROR: "Failed to update user",
    DELETE_ERROR: "Failed to delete user",
  },

  // Project Management
  PROJECT: {
    CREATE_SUCCESS: "Project created successfully",
    UPDATE_SUCCESS: "Project updated successfully",
    DELETE_SUCCESS: "Project deleted successfully",
    FETCH_ERROR: "Failed to fetch projects",
    CREATE_ERROR: "Failed to create project",
    UPDATE_ERROR: "Failed to update project",
    DELETE_ERROR: "Failed to delete project",
  },

  // Recording Management
  RECORDING: {
    UPLOAD_SUCCESS: (count: number) =>
      `Successfully uploaded ${count} file${count !== 1 ? "s" : ""}`,
    UPLOAD_ERROR: (filename: string, error?: string) =>
      `Failed to upload ${filename}${error ? `: ${error}` : ""}`,
    DELETE_SUCCESS: "Recording deleted successfully",
    DELETE_ERROR: "Failed to delete recording",
    FETCH_ERROR: "Failed to fetch recordings",
    PROCESSING: "Processing recording...",
    SPECTROGRAM_GENERATING: "Generating spectrogram...",
    SPECTROGRAM_ERROR: "Failed to generate spectrogram",
  },

  // Annotation Management
  ANNOTATION: {
    SAVE_SUCCESS: "Annotations saved successfully",
    SAVE_ERROR: "Failed to save annotations",
    LOAD_ERROR: "Failed to load annotations",
    DELETE_SUCCESS: "Annotation deleted successfully",
    AUTOSAVE_SUCCESS: "Changes auto-saved",
    EXPORT_SUCCESS: "Annotations exported successfully",
    EXPORT_ERROR: "Failed to export annotations",
    ADDED: (label: string) =>
      `Annotation added with "${label}" label. Right-click to edit label.`,
    ADDED_CLIPPED: (label: string) =>
      `Annotation added with "${label}" label (clipped to bottom line). Right-click to edit label.`,
    BELOW_BOTTOM_LINE: "Cannot create bounding box below the bottom line",
  },

  // Label Modes
  LABEL_MODE: {
    NO_DEFAULT: "Annotation mode: No default label",
    USE_LAST: (lastLabel: string | null) =>
      lastLabel
        ? `Annotation mode: Use last assigned label (currently: "${lastLabel}")`
        : "Annotation mode: Use last assigned label (none assigned yet)",
    CUSTOM_SET: (label: string) => `Default label set to: "${label}"`,
  },

  // Conflicts
  CONFLICT: {
    NONE_DETECTED: "No conflicts detected! All bounding boxes have proper 10ms gaps.",
    DETECTED: (count: number) =>
      `${count} conflict${count > 1 ? "s" : ""} detected`,
    RESOLVED: (count: number) =>
      `Resolved ${count} conflict${count > 1 ? "s" : ""}!`,
    NO_CONFLICTS_TO_RESOLVE: "No conflicts to resolve",
  },

  // General
  GENERAL: {
    SAVE_SUCCESS: "Changes saved successfully",
    SAVE_ERROR: "Failed to save changes",
    DELETE_SUCCESS: "Successfully deleted",
    DELETE_ERROR: "Failed to delete",
    LOADING_ERROR: "Failed to load data",
    NETWORK_ERROR: "Network error. Please check your connection.",
    UNKNOWN_ERROR: "An unexpected error occurred",
    COPIED_TO_CLIPBOARD: "Copied to clipboard",
    FILE_TOO_LARGE: (maxSize: number) => `File size exceeds ${maxSize}MB limit`,
    INVALID_FILE_TYPE: (accepted: string) =>
      `Invalid file type. Accepted formats: ${accepted}`,
  },
} as const;

class NotificationService {
  private notify(
    type: NotificationType,
    message: string,
    context?: string,
    duration?: number,
  ) {
    // Create rate limit key based on type and message
    const rateLimitKey = `${type}:${message.substring(0, 50)}`;

    // Check rate limit (always show errors to avoid missing critical issues)
    if (
      type !== NotificationType.ERROR &&
      !rateLimiter.shouldShow(rateLimitKey)
    ) {
      logger.debug(
        `Notification rate limited: ${message}`,
        context || "Notification",
      );
      return;
    }

    // Log the notification
    const logContext = context || "Notification";
    switch (type) {
      case NotificationType.SUCCESS:
        logger.info(message, logContext);
        toast.success(message, { duration: duration || 4000 });
        break;
      case NotificationType.ERROR:
        logger.error(message, logContext);
        toast.error(message, { duration: duration || 4000 });
        break;
      case NotificationType.WARNING:
        logger.warn(message, logContext);
        toast(message, { icon: "⚠️", duration: duration || 4000 });
        break;
      case NotificationType.INFO:
        logger.info(message, logContext);
        toast(message, { icon: "ℹ️", duration: duration || 4000 });
        break;
    }
  }

  success(message: string, context?: string, duration?: number) {
    this.notify(NotificationType.SUCCESS, message, context, duration);
  }

  error(message: string | Error, context?: string, duration?: number) {
    const errorMessage =
      message instanceof Error ? this.formatError(message) : message;
    this.notify(NotificationType.ERROR, errorMessage, context, duration);
  }

  warning(message: string, context?: string, duration?: number) {
    this.notify(NotificationType.WARNING, message, context, duration);
  }

  info(message: string, context?: string, duration?: number) {
    this.notify(NotificationType.INFO, message, context, duration);
  }

  // Helper method to format error objects
  private formatError(error: Error): string {
    // Check for common API error formats
    if (
      "response" in error &&
      typeof error.response === "object" &&
      error.response
    ) {
      const response = error.response as any;
      if (response.data?.detail) {
        return response.data.detail;
      }
      if (response.data?.message) {
        return response.data.message;
      }
      if (response.data?.error) {
        return response.data.error;
      }
      if (response.statusText) {
        return response.statusText;
      }
    }

    // Check for error message
    if (error.message) {
      return error.message;
    }

    // Fallback
    return Messages.GENERAL.UNKNOWN_ERROR;
  }

  // Show loading toast that can be updated
  loading(message: string = "Loading...") {
    return toast.loading(message);
  }

  // Promise-based notifications
  async promise<T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string;
      error: string;
    },
    context?: string,
  ): Promise<T> {
    try {
      const result = await toast.promise(promise, messages);
      logger.info(`Promise resolved: ${messages.loading}`, context);
      return result;
    } catch (error) {
      logger.error(`Promise rejected: ${messages.loading}`, context, error);
      throw error;
    }
  }

  // Custom toast with JSX (for complex content like conflict resolution buttons)
  custom(
    content: (t: Toast) => JSX.Element,
    duration?: number,
  ) {
    return toast.custom(content, { duration: duration || 8000 });
  }

  // Dismiss specific toast or all toasts
  dismiss(toastId?: string) {
    if (toastId) {
      toast.dismiss(toastId);
    } else {
      toast.dismiss();
    }
  }
}

// Singleton instance
export const notification = new NotificationService();

// Convenience exports
export const notifySuccess = (message: string, context?: string) =>
  notification.success(message, context);

export const notifyError = (message: string | Error, context?: string) =>
  notification.error(message, context);

export const notifyWarning = (message: string, context?: string) =>
  notification.warning(message, context);

export const notifyInfo = (message: string, context?: string) =>
  notification.info(message, context);

export default notification;
