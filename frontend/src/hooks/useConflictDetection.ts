/**
 * useConflictDetection - Bounding box conflict management
 *
 * Extracts conflict detection and resolution logic from AnnotationEditor.
 * Handles both nesting conflicts (overlapping boxes) and gap conflicts
 * (boxes closer than 10ms minimum gap).
 */

import { useState, useCallback, useMemo } from 'react';
import {
  detectAllConflicts,
  resolveAllConflicts,
  UnifiedConflict,
} from '../utils/conflictDetection';
import { BoundingBox } from '../types';

interface UseConflictDetectionOptions {
  /** Callback when conflicts are detected */
  onConflictsDetected?: (conflicts: UnifiedConflict[]) => void;
  /** Callback when conflicts are resolved */
  onConflictsResolved?: (resolvedBoxes: BoundingBox[]) => void;
}

interface ConflictDetectionReturn {
  /** List of detected conflicts */
  conflicts: UnifiedConflict[];
  /** Whether conflicts should be highlighted in UI */
  highlightConflicts: boolean;
  /** Set of box indices that are in conflict */
  conflictingBoxIndices: Set<number>;
  /** Number of conflicts */
  conflictCount: number;
  /** Whether there are any conflicts */
  hasConflicts: boolean;

  /** Detect conflicts in the given boxes */
  detectConflicts: (boxes: BoundingBox[]) => UnifiedConflict[];
  /** Resolve all conflicts and return updated boxes */
  resolveConflicts: (
    boxes: BoundingBox[],
    duration: number,
    dimensions: { width: number; height: number }
  ) => BoundingBox[] | null;
  /** Enable/disable conflict highlighting */
  setHighlightConflicts: (highlight: boolean) => void;
  /** Clear all conflicts */
  clearConflicts: () => void;
  /** Manually set conflicts (for external updates) */
  setConflicts: (conflicts: UnifiedConflict[]) => void;
}

export function useConflictDetection(
  options: UseConflictDetectionOptions = {}
): ConflictDetectionReturn {
  const { onConflictsDetected, onConflictsResolved } = options;

  const [conflicts, setConflicts] = useState<UnifiedConflict[]>([]);
  const [highlightConflicts, setHighlightConflicts] = useState(false);

  // Memoized set of conflicting box indices for efficient lookup
  const conflictingBoxIndices = useMemo(() => {
    if (!highlightConflicts || conflicts.length === 0) {
      return new Set<number>();
    }
    return new Set(
      conflicts.flatMap((c) => [c.box1Index, c.box2Index])
    );
  }, [conflicts, highlightConflicts]);

  const detectConflicts = useCallback(
    (boxes: BoundingBox[]): UnifiedConflict[] => {
      const detected = detectAllConflicts(boxes);
      setConflicts(detected);
      setHighlightConflicts(detected.length > 0);
      onConflictsDetected?.(detected);
      return detected;
    },
    [onConflictsDetected]
  );

  const resolveConflicts = useCallback(
    (
      boxes: BoundingBox[],
      duration: number,
      dimensions: { width: number; height: number }
    ): BoundingBox[] | null => {
      if (conflicts.length === 0) {
        return null;
      }

      const resolved = resolveAllConflicts(boxes, conflicts);

      // Recalculate pixel coordinates from resolved times
      const timeToPixelX = (time: number): number =>
        (time / duration) * dimensions.width;

      const resolvedWithPixelCoords = resolved.map((box) => ({
        ...box,
        x: timeToPixelX(box.start_time),
        width: timeToPixelX(box.end_time - box.start_time),
      }));

      setConflicts([]);
      setHighlightConflicts(false);
      onConflictsResolved?.(resolvedWithPixelCoords);

      return resolvedWithPixelCoords;
    },
    [conflicts, onConflictsResolved]
  );

  const clearConflicts = useCallback(() => {
    setConflicts([]);
    setHighlightConflicts(false);
  }, []);

  return {
    conflicts,
    highlightConflicts,
    conflictingBoxIndices,
    conflictCount: conflicts.length,
    hasConflicts: conflicts.length > 0,
    detectConflicts,
    resolveConflicts,
    setHighlightConflicts,
    clearConflicts,
    setConflicts,
  };
}

export default useConflictDetection;
