/**
 * Shared loading state hook for BSMarker
 * Provides consistent loading state management across components
 */

import { useState, useCallback } from "react";
import { logger } from "../../lib/logger";

export interface LoadingState {
  isLoading: boolean;
  error: Error | null;
  isSuccess: boolean;
}

export interface UseLoadingStateReturn extends LoadingState {
  setLoading: () => void;
  setSuccess: () => void;
  setError: (error: Error | string) => void;
  reset: () => void;
  execute: <T>(promise: Promise<T>) => Promise<T>;
}

export const useLoadingState = (
  initialLoading: boolean = false,
  context?: string,
): UseLoadingStateReturn => {
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [error, setErrorState] = useState<Error | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const setLoading = useCallback(() => {
    setIsLoading(true);
    setErrorState(null);
    setIsSuccess(false);
    logger.debug("Loading state started", context);
  }, [context]);

  const setSuccess = useCallback(() => {
    setIsLoading(false);
    setErrorState(null);
    setIsSuccess(true);
    logger.debug("Loading state succeeded", context);
  }, [context]);

  const setError = useCallback(
    (error: Error | string) => {
      const errorObj = typeof error === "string" ? new Error(error) : error;
      setIsLoading(false);
      setErrorState(errorObj);
      setIsSuccess(false);
      logger.error("Loading state failed", context, errorObj);
    },
    [context],
  );

  const reset = useCallback(() => {
    setIsLoading(false);
    setErrorState(null);
    setIsSuccess(false);
    logger.debug("Loading state reset", context);
  }, [context]);

  const execute = useCallback(
    async <T>(promise: Promise<T>): Promise<T> => {
      setLoading();
      try {
        const result = await promise;
        setSuccess();
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      }
    },
    [setLoading, setSuccess, setError],
  );

  return {
    isLoading,
    error,
    isSuccess,
    setLoading,
    setSuccess,
    setError,
    reset,
    execute,
  };
};

// Hook for managing multiple loading states
export interface MultiLoadingState {
  [key: string]: boolean;
}

export const useMultiLoadingState = (keys: string[]) => {
  const initialState = keys.reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {} as MultiLoadingState);

  const [loadingStates, setLoadingStates] =
    useState<MultiLoadingState>(initialState);

  const setLoading = useCallback((key: string, isLoading: boolean) => {
    setLoadingStates((prev) => ({
      ...prev,
      [key]: isLoading,
    }));
  }, []);

  const isAnyLoading = Object.values(loadingStates).some((state) => state);
  const isAllLoading = Object.values(loadingStates).every((state) => state);

  return {
    loadingStates,
    setLoading,
    isAnyLoading,
    isAllLoading,
  };
};
