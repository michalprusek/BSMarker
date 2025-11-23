/**
 * Navigation Guard Hook
 *
 * Blocks React Router navigation when conflicts are detected.
 * Shows warning modal and allows user to resolve conflicts before leaving.
 */

import { useEffect, useState, useCallback } from "react";
import { useBlocker } from "react-router-dom";
import { BoundingBox } from "../types";
import {
  detectConflicts,
  BoundingBoxConflict,
  // New unified conflict system
  detectAllConflicts,
  UnifiedConflict,
} from "../utils/conflictDetection";

interface UseNavigationGuardOptions {
  /**
   * Bounding boxes to check for conflicts
   */
  boundingBoxes: BoundingBox[];

  /**
   * Whether navigation guard is enabled
   */
  enabled?: boolean;

  /**
   * Callback when navigation is attempted with conflicts
   */
  onNavigationBlocked?: (conflicts: UnifiedConflict[]) => void;
}

interface UseNavigationGuardReturn {
  /**
   * Whether to show the conflict warning modal
   */
  showConflictModal: boolean;

  /**
   * Detected conflicts (includes both nesting and gap conflicts)
   */
  conflicts: UnifiedConflict[];

  /**
   * Allow navigation to proceed
   */
  proceedNavigation: () => void;

  /**
   * Cancel navigation and stay on page
   */
  cancelNavigation: () => void;

  /**
   * Whether navigation is currently blocked
   */
  isBlocked: boolean;
}

/**
 * Hook to guard navigation when bounding box conflicts are detected.
 *
 * Usage:
 * ```tsx
 * const { showConflictModal, conflicts, proceedNavigation, cancelNavigation } = useNavigationGuard({
 *   boundingBoxes,
 *   enabled: true,
 *   onNavigationBlocked: (conflicts) => console.log(`${conflicts.length} conflicts detected`)
 * });
 * ```
 */
export function useNavigationGuard({
  boundingBoxes,
  enabled = true,
  onNavigationBlocked,
}: UseNavigationGuardOptions): UseNavigationGuardReturn {
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [detectedConflicts, setDetectedConflicts] = useState<UnifiedConflict[]>([]);

  // Block navigation when conflicts exist (includes nesting + gap conflicts)
  const shouldBlock = useCallback(() => {
    if (!enabled) return false;

    const conflicts = detectAllConflicts(boundingBoxes);
    return conflicts.length > 0;
  }, [boundingBoxes, enabled]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => {
      // Only block if we're actually navigating to a different location
      if (currentLocation.pathname === nextLocation.pathname) {
        return false;
      }

      return shouldBlock();
    }
  );

  // Handle blocker state changes
  useEffect(() => {
    if (blocker.state === "blocked") {
      // Detect conflicts again to show in modal (includes nesting + gap)
      const conflicts = detectAllConflicts(boundingBoxes);
      setDetectedConflicts(conflicts);
      setShowConflictModal(true);

      // Notify parent component
      if (onNavigationBlocked) {
        onNavigationBlocked(conflicts);
      }
    }
  }, [blocker.state, boundingBoxes, onNavigationBlocked]);

  const proceedNavigation = useCallback(() => {
    setShowConflictModal(false);
    setDetectedConflicts([]);

    if (typeof blocker.proceed !== 'function') {
      console.error('blocker.proceed is not a function', blocker);
      toast.error('Navigation error. Please refresh the page.');
      return;
    }

    try {
      blocker.proceed();
    } catch (error) {
      console.error('Error proceeding navigation:', error);
      toast.error('Failed to navigate. Please try again.');
    }
  }, [blocker]);

  const cancelNavigation = useCallback(() => {
    setShowConflictModal(false);
    setDetectedConflicts([]);

    if (typeof blocker.reset !== 'function') {
      console.error('blocker.reset is not a function', blocker);
      // User is already on the page, so just close modal
      return;
    }

    try {
      blocker.reset();
    } catch (error) {
      console.error('Error resetting blocker:', error);
      // Not critical - user stays on page anyway
    }
  }, [blocker]);

  // Add browser unload warning to prevent accidental tab/window closing
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!enabled) return;

      try {
        const conflicts = detectAllConflicts(boundingBoxes);
        if (conflicts.length > 0) {
          // Prevent default and show browser's built-in warning
          e.preventDefault();
          // Chrome requires returnValue to be set
          e.returnValue = '';
        }
      } catch (error) {
        console.error('Error detecting conflicts in beforeunload:', error);
        // Safer to prevent unload on error (protect user's work)
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled, boundingBoxes]);

  return {
    showConflictModal,
    conflicts: detectedConflicts,
    proceedNavigation,
    cancelNavigation,
    isBlocked: blocker.state === "blocked",
  };
}
