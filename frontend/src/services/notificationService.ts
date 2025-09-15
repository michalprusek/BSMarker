/**
 * Centralized notification service for consistent toast notifications
 * Provides SSOT for all user notifications in the application
 */

import toast from "react-hot-toast";

export type NotificationType = "success" | "error" | "info" | "warning";

export interface NotificationOptions {
  duration?: number;
  icon?: string;
  position?:
    | "top-left"
    | "top-center"
    | "top-right"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right";
}

const DEFAULT_OPTIONS: NotificationOptions = {
  duration: 4000,
  position: "top-center",
};

const ERROR_DURATION = 5000;
const SUCCESS_DURATION = 3000;
const INFO_DURATION = 4000;

class NotificationService {
  /**
   * Show a success notification
   */
  success(message: string, options?: NotificationOptions): void {
    toast.success(message, {
      duration: options?.duration ?? SUCCESS_DURATION,
      position: options?.position ?? DEFAULT_OPTIONS.position,
      icon: options?.icon,
    });
  }

  /**
   * Show an error notification
   */
  error(message: string, options?: NotificationOptions): void {
    toast.error(message, {
      duration: options?.duration ?? ERROR_DURATION,
      position: options?.position ?? DEFAULT_OPTIONS.position,
      icon: options?.icon,
    });
  }

  /**
   * Show an info notification
   */
  info(message: string, options?: NotificationOptions): void {
    toast(message, {
      duration: options?.duration ?? INFO_DURATION,
      position: options?.position ?? DEFAULT_OPTIONS.position,
      icon: options?.icon ?? "ℹ️",
    });
  }

  /**
   * Show a warning notification
   */
  warning(message: string, options?: NotificationOptions): void {
    toast(message, {
      duration: options?.duration ?? INFO_DURATION,
      position: options?.position ?? DEFAULT_OPTIONS.position,
      icon: options?.icon ?? "⚠️",
      style: {
        background: "#FFA500",
        color: "#fff",
      },
    });
  }

  /**
   * Show a loading notification with a promise
   */
  async promise<T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: any) => string);
    },
    options?: NotificationOptions,
  ): Promise<T> {
    return toast.promise(
      promise,
      {
        loading: messages.loading,
        success: messages.success,
        error: messages.error,
      },
      {
        position: options?.position ?? DEFAULT_OPTIONS.position,
        duration: options?.duration,
      },
    );
  }

  /**
   * Dismiss a specific toast or all toasts
   */
  dismiss(toastId?: string): void {
    if (toastId) {
      toast.dismiss(toastId);
    } else {
      toast.dismiss();
    }
  }

  /**
   * Show custom toast with full control
   */
  custom(
    renderer: (toast: any) => JSX.Element,
    options?: NotificationOptions,
  ): string {
    return toast.custom(renderer, {
      duration: options?.duration ?? DEFAULT_OPTIONS.duration,
      position: options?.position ?? DEFAULT_OPTIONS.position,
    });
  }
}

// Export singleton instance
export const notificationService = new NotificationService();

// Common notification messages
export const NotificationMessages = {
  // Annotation messages
  ANNOTATION_SAVED: "Annotations saved successfully",
  ANNOTATION_SAVE_ERROR: "Failed to save annotations",
  ANNOTATION_DELETED: "Annotation deleted",
  ANNOTATION_COPIED: "Annotation copied to clipboard",
  ANNOTATION_PASTED: "Annotation pasted",
  ANNOTATION_NO_CLIPBOARD: "No annotation in clipboard",

  // Spectrogram messages
  SPECTROGRAM_LOADING: "Loading spectrogram...",
  SPECTROGRAM_LOADED: "Spectrogram loaded successfully",
  SPECTROGRAM_ERROR: "Failed to load spectrogram",
  SPECTROGRAM_GENERATING: "Generating spectrogram...",
  SPECTROGRAM_PROCESSING: "Processing spectrogram...",

  // Recording messages
  RECORDING_LOADED: "Recording loaded successfully",
  RECORDING_ERROR: "Failed to load recording",
  RECORDING_NOT_FOUND: "Recording not found",

  // Label messages
  LABEL_REQUIRED: "Please enter a label",
  LABEL_UPDATED: "Label updated successfully",
  LABEL_EXISTS: "Label already exists",

  // General messages
  NETWORK_ERROR: "Network error. Please check your connection.",
  PERMISSION_DENIED: "Permission denied",
  SESSION_EXPIRED: "Session expired. Please login again.",
  UNEXPECTED_ERROR: "An unexpected error occurred",

  // Action messages
  UNDO_SUCCESS: "Action undone",
  REDO_SUCCESS: "Action redone",
  NO_UNDO_AVAILABLE: "Nothing to undo",
  NO_REDO_AVAILABLE: "Nothing to redo",

  // Autosave messages
  AUTOSAVE_SUCCESS: "Changes auto-saved",
  AUTOSAVE_ERROR: "Auto-save failed",
  AUTOSAVE_DISABLED: "Auto-save disabled",

  // Mode messages
  ANNOTATION_MODE_ENABLED: "Annotation mode enabled",
  ANNOTATION_MODE_DISABLED: "Annotation mode disabled",
  SELECTION_MODE_ENABLED: "Selection mode enabled",

  // Navigation messages
  FIRST_RECORDING: "This is the first recording",
  LAST_RECORDING: "This is the last recording",
  NAVIGATING_TO: (name: string) => `Loading ${name}...`,
} as const;

export default notificationService;
