import { useEffect, useRef, useCallback } from 'react';

interface UseAutosaveOptions {
  data: any;
  onSave: () => Promise<boolean>;
  interval?: number; // default 30000ms
  debounceDelay?: number; // default 3000ms
  enabled?: boolean;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
}

interface UseAutosaveReturn {
  triggerSave: () => Promise<boolean>;
  isAutoSaving: boolean;
  lastSaveTime: Date | null;
  saveError: string | null;
}

export const useAutosave = ({
  data,
  onSave,
  interval = 30000,
  debounceDelay = 3000,
  enabled = true,
  hasUnsavedChanges,
  isSaving
}: UseAutosaveOptions): UseAutosaveReturn => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const isAutoSavingRef = useRef<boolean>(false);
  const lastSaveTimeRef = useRef<Date | null>(null);
  const saveErrorRef = useRef<string | null>(null);
  const saveQueueRef = useRef<boolean>(false);

  // Queue-based save function to prevent concurrent saves
  const triggerSave = useCallback(async (): Promise<boolean> => {
    if (!enabled || isSaving || isAutoSavingRef.current || saveQueueRef.current || !hasUnsavedChanges) {
      return false;
    }

    saveQueueRef.current = true;
    isAutoSavingRef.current = true;
    saveErrorRef.current = null;

    const maxRetries = 3;

    for (let retryCount = 0; retryCount < maxRetries; retryCount++) {
      try {
        const success = await onSave();
        if (success) {
          lastSaveTimeRef.current = new Date();
          saveErrorRef.current = null;
          isAutoSavingRef.current = false;
          saveQueueRef.current = false;
          return true;
        }
        throw new Error('Save operation returned false');
      } catch (error) {
        saveErrorRef.current = `Save failed (attempt ${retryCount + 1}/${maxRetries}): ${error instanceof Error ? error.message : 'Unknown error'}`;
        
        if (retryCount >= maxRetries - 1) {
          break;
        }
        
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount + 1) * 1000));
      }
    }

    isAutoSavingRef.current = false;
    saveQueueRef.current = false;
    return false;
  }, [enabled, isSaving, hasUnsavedChanges, onSave]);

  // Synchronous save for beforeunload (best effort)
  const synchronousSave = useCallback(() => {
    if (!hasUnsavedChanges || isSaving) return;
    
    // Use navigator.sendBeacon for best chance of completing
    // This is a fallback - we'll try the async save first
    try {
      onSave().catch(() => {
        // Silent fail - we can't do much in beforeunload
      });
    } catch {
      // Silent fail
    }
  }, [hasUnsavedChanges, isSaving, onSave]);

  // Debounced autosave after changes
  useEffect(() => {
    if (!enabled || !hasUnsavedChanges) return;

    // Clear existing debounce timer
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Set new debounce timer
    debounceRef.current = setTimeout(() => {
      triggerSave();
    }, debounceDelay);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [data, enabled, hasUnsavedChanges, debounceDelay, triggerSave]);

  // Interval-based autosave
  useEffect(() => {
    if (!enabled) return;

    intervalRef.current = setInterval(() => {
      if (hasUnsavedChanges && !isSaving) {
        triggerSave();
      }
    }, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, hasUnsavedChanges, isSaving, interval, triggerSave]);

  // Handle page visibility change (tab switch, minimize)
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && hasUnsavedChanges && !isSaving) {
        triggerSave();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, hasUnsavedChanges, isSaving, triggerSave]);

  // Handle beforeunload (page refresh, browser close)
  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        // Attempt to save synchronously
        synchronousSave();
        
        // Show browser confirmation dialog
        event.preventDefault();
        event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return event.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, hasUnsavedChanges, synchronousSave]);

  // Note: React Router navigation blocking will be handled in the component
  // using the hook, as it needs access to component-specific navigation logic

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return {
    triggerSave,
    isAutoSaving: isAutoSavingRef.current,
    lastSaveTime: lastSaveTimeRef.current,
    saveError: saveErrorRef.current
  };
};