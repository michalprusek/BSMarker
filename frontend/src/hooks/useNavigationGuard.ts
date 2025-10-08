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
  onNavigationBlocked?: (conflicts: BoundingBoxConflict[]) => void;
}

interface UseNavigationGuardReturn {
  /**
   * Whether to show the conflict warning modal
   */
  showConflictModal: boolean;

  /**
   * Detected conflicts
   */
  conflicts: BoundingBoxConflict[];

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
  const [detectedConflicts, setDetectedConflicts] = useState<BoundingBoxConflict[]>([]);

  // Block navigation when conflicts exist
  const shouldBlock = useCallback(() => {
    if (!enabled) return false;

    const conflicts = detectConflicts(boundingBoxes);
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
      // Detect conflicts again to show in modal
      const conflicts = detectConflicts(boundingBoxes);
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
    blocker.proceed?.();
  }, [blocker]);

  const cancelNavigation = useCallback(() => {
    setShowConflictModal(false);
    setDetectedConflicts([]);
    blocker.reset?.();
  }, [blocker]);

  return {
    showConflictModal,
    conflicts: detectedConflicts,
    proceedNavigation,
    cancelNavigation,
    isBlocked: blocker.state === "blocked",
  };
}
