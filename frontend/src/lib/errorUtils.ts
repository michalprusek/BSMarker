/**
 * Error handling utilities for BSMarker
 * Provides consistent error processing across the application
 */

import { logger } from "./logger";

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
  details?: any;
}

export interface ErrorInfo {
  message: string;
  type: "network" | "api" | "validation" | "permission" | "unknown";
  status?: number;
  context?: string;
  timestamp: Date;
}

/**
 * Format error for display
 */
export const formatError = (error: any): string => {
  // Handle different error types
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    // Check for Axios error structure
    if ("response" in error && error.response) {
      const response = (error as any).response;
      if (response.data?.message) {
        return response.data.message;
      }
      if (response.data?.error) {
        return response.data.error;
      }
      if (response.statusText) {
        return `${response.status}: ${response.statusText}`;
      }
    }

    // Check for network errors
    if ("code" in error && error.code === "ERR_NETWORK") {
      return "Network error. Please check your connection.";
    }

    // Return error message
    return error.message || "An unknown error occurred";
  }

  // Handle API error objects
  if (error && typeof error === "object") {
    if ("message" in error) {
      return error.message;
    }
    if ("error" in error) {
      return error.error;
    }
  }

  return "An unexpected error occurred";
};

/**
 * Get error type from error object
 */
export const getErrorType = (error: any): ErrorInfo["type"] => {
  if (!error) return "unknown";

  // Network errors
  if (error.code === "ERR_NETWORK" || error.message?.includes("Network")) {
    return "network";
  }

  // API errors
  if (error.response || error.status) {
    const status = error.response?.status || error.status;
    if (status === 401 || status === 403) {
      return "permission";
    }
    if (status >= 400 && status < 500) {
      return "validation";
    }
    return "api";
  }

  // Validation errors
  if (error.name === "ValidationError" || error.type === "validation") {
    return "validation";
  }

  return "unknown";
};

/**
 * Extract error info
 */
export const extractErrorInfo = (error: any, context?: string): ErrorInfo => {
  const message = formatError(error);
  const type = getErrorType(error);
  const status = error.response?.status || error.status;

  const errorInfo: ErrorInfo = {
    message,
    type,
    status,
    context,
    timestamp: new Date(),
  };

  logger.error(
    `Error occurred: ${message}`,
    context || "ErrorUtils",
    errorInfo,
  );

  return errorInfo;
};

/**
 * Handle API error response
 */
export const handleApiError = (error: any, context?: string): ApiError => {
  const errorInfo = extractErrorInfo(error, context);

  const apiError: ApiError = {
    message: errorInfo.message,
    status: errorInfo.status,
    code: error.code || error.response?.data?.code,
    details: error.response?.data?.details,
  };

  // Log based on error type
  if (errorInfo.type === "network") {
    logger.error("Network error occurred", context || "API", apiError);
  } else if (errorInfo.type === "permission") {
    logger.warn("Permission denied", context || "API", apiError);
  } else {
    logger.error("API error occurred", context || "API", apiError);
  }

  return apiError;
};

/**
 * Create user-friendly error messages
 */
export const getUserFriendlyMessage = (error: any): string => {
  const errorType = getErrorType(error);
  const status = error.response?.status || error.status;

  switch (errorType) {
    case "network":
      return "Connection failed. Please check your internet connection and try again.";

    case "permission":
      if (status === 401) {
        return "Your session has expired. Please log in again.";
      }
      return "You do not have permission to perform this action.";

    case "validation":
      const message = formatError(error);
      if (message && message !== "An unexpected error occurred") {
        return message;
      }
      return "Please check your input and try again.";

    case "api":
      if (status >= 500) {
        return "Server error occurred. Please try again later.";
      }
      return formatError(error);

    default:
      return "An unexpected error occurred. Please try again.";
  }
};

/**
 * Retry failed operation
 */
export const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000,
  context?: string,
): Promise<T> => {
  let lastError: any;
  let currentDelay = delay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(
        `Attempting operation (${attempt}/${maxRetries})`,
        context || "Retry",
      );
      const result = await operation();

      if (attempt > 1) {
        logger.info(
          `Operation succeeded after ${attempt} attempts`,
          context || "Retry",
        );
      }

      return result;
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const errorType = getErrorType(error);

        // Don't retry permission errors
        if (errorType === "permission") {
          throw error;
        }

        const retryDelay = currentDelay;
        logger.warn(
          `Operation failed (attempt ${attempt}/${maxRetries}), retrying in ${retryDelay}ms`,
          context || "Retry",
          error,
        );

        // eslint-disable-next-line no-loop-func
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        // Exponential backoff
        currentDelay *= 2;
      }
    }
  }

  logger.error(
    `Operation failed after ${maxRetries} attempts`,
    context || "Retry",
    lastError,
  );
  throw lastError;
};

/**
 * Error boundary helper
 */
export class ErrorBoundary {
  private static handlers: Map<string, (error: Error, errorInfo: any) => void> =
    new Map();

  static register(
    key: string,
    handler: (error: Error, errorInfo: any) => void,
  ) {
    this.handlers.set(key, handler);
  }

  static unregister(key: string) {
    this.handlers.delete(key);
  }

  static handleError(error: Error, errorInfo: any) {
    logger.error("Error boundary triggered", "ErrorBoundary", {
      error,
      errorInfo,
    });

    // Call all registered handlers
    this.handlers.forEach((handler) => {
      try {
        handler(error, errorInfo);
      } catch (handlerError) {
        logger.error("Error in error handler", "ErrorBoundary", handlerError);
      }
    });
  }
}

/**
 * Create error with context
 */
export const createError = (
  message: string,
  code?: string,
  details?: any,
): Error => {
  const error = new Error(message) as any;
  if (code) error.code = code;
  if (details) error.details = details;
  return error;
};

/**
 * Check if error is retryable
 */
export const isRetryableError = (error: any): boolean => {
  const errorType = getErrorType(error);
  const status = error.response?.status || error.status;

  // Network errors are usually retryable
  if (errorType === "network") return true;

  // Server errors might be temporary
  if (status >= 500 && status < 600) return true;

  // Rate limiting
  if (status === 429) return true;

  // Timeout errors
  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") return true;

  return false;
};
