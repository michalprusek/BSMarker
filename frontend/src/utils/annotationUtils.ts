/**
 * Utility functions for annotation operations
 * Provides SSOT for bounding box validation, constraints, and transformations
 */

import { BoundingBox } from "../types";

/**
 * Check if a point is inside a bounding box
 */
export function isPointInBox(
  point: { x: number; y: number },
  box: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}

/**
 * Calculate the center point of a bounding box
 */
export function getBoxCenter(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}): {
  x: number;
  y: number;
} {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

/**
 * Calculate the distance between two points
 */
export function getDistance(
  point1: { x: number; y: number },
  point2: { x: number; y: number },
): number {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate temporal distance between two bounding boxes
 * Returns distance in milliseconds, or null if boxes overlap
 */
export function calculateTemporalDistance(
  box1: BoundingBox,
  box2: BoundingBox,
): number | null {
  // Extract time values
  const box1Start = box1.start_time;
  const box1End = box1.end_time;
  const box2Start = box2.start_time;
  const box2End = box2.end_time;

  // Validate all time values are valid numbers
  if (
    typeof box1Start !== 'number' ||
    typeof box1End !== 'number' ||
    typeof box2Start !== 'number' ||
    typeof box2End !== 'number' ||
    !isFinite(box1Start) ||
    !isFinite(box1End) ||
    !isFinite(box2Start) ||
    !isFinite(box2End)
  ) {
    console.error('Invalid box times in calculateTemporalDistance', {
      box1: { start: box1Start, end: box1End },
      box2: { start: box2Start, end: box2End }
    });
    return null;
  }

  // Validate box time ordering
  if (box1End < box1Start || box2End < box2Start) {
    console.warn('Box has end_time before start_time', {
      box1: { start: box1Start, end: box1End },
      box2: { start: box2Start, end: box2End }
    });
    return null;
  }

  // Check for temporal overlap
  if (!(box1End <= box2Start || box2End <= box1Start)) {
    return null;
  }

  // Calculate gap between boxes (in seconds, then convert to ms)
  let distanceSeconds: number;
  if (box1End <= box2Start) {
    // box1 is before box2
    distanceSeconds = box2Start - box1End;
  } else {
    // box2 is before box1
    distanceSeconds = box1Start - box2End;
  }

  return distanceSeconds * 1000; // Convert to milliseconds
}

/**
 * Find the nearest box to a target box from a list of candidates
 * Uses combined metric: temporal distance (primary) and spatial distance (tiebreaker)
 * Temporal distance is more relevant for audio annotation workflows
 */
export function findNearestBox(
  targetBox: BoundingBox,
  candidateBoxes: BoundingBox[],
): BoundingBox | null {
  if (candidateBoxes.length === 0) return null;

  let nearestBox: BoundingBox | null = null;
  let minTemporalDistance = Infinity;
  let minSpatialDistance = Infinity;

  candidateBoxes.forEach((box) => {
    // Calculate temporal distance (gap in time)
    const temporalDist = calculateTemporalDistance(targetBox, box);

    // If boxes overlap in time, temporal distance is 0
    const temporalDistValue = temporalDist === null ? 0 : Math.abs(temporalDist);

    // Calculate spatial distance between centers (for tiebreaker)
    const targetCenter = getBoxCenter(targetBox);
    const boxCenter = getBoxCenter(box);
    const spatialDist = getDistance(targetCenter, boxCenter);

    // Priority 1: Temporal distance (closer in time is more relevant)
    // Priority 2: Spatial distance (tiebreaker if same temporal distance)
    if (
      temporalDistValue < minTemporalDistance ||
      (temporalDistValue === minTemporalDistance &&
        spatialDist < minSpatialDistance)
    ) {
      minTemporalDistance = temporalDistValue;
      minSpatialDistance = spatialDist;
      nearestBox = box;
    }
  });

  return nearestBox;
}

/**
 * PERFORMANCE OPTIMIZATION: Fast shallow comparison of bounding box arrays
 * Avoids O(n) JSON.stringify by checking reference equality first,
 * then falls back to key-by-key comparison of changed properties.
 *
 * @returns true if arrays are functionally equal, false otherwise
 */
export function boxArraysEqual(
  arr1: BoundingBox[] | null,
  arr2: BoundingBox[] | null,
): boolean {
  // Reference equality - fastest path
  if (arr1 === arr2) return true;

  // Null checks
  if (!arr1 || !arr2) return false;

  // Length check - fast rejection
  if (arr1.length !== arr2.length) return false;

  // Empty arrays are equal
  if (arr1.length === 0) return true;

  // Compare each box - check only essential properties for change detection
  for (let i = 0; i < arr1.length; i++) {
    const box1 = arr1[i];
    const box2 = arr2[i];

    // Reference equality for individual boxes
    if (box1 === box2) continue;

    // Compare essential properties that affect rendering/history
    if (
      box1.x !== box2.x ||
      box1.y !== box2.y ||
      box1.width !== box2.width ||
      box1.height !== box2.height ||
      box1.label !== box2.label ||
      box1.id !== box2.id
    ) {
      return false;
    }
  }

  return true;
}

/**
 * PERFORMANCE OPTIMIZATION: Check if box arrays have changed
 * Returns true if there are differences, false if equal.
 * This is the inverse of boxArraysEqual for semantic clarity in change detection.
 */
export function boxArraysChanged(
  current: BoundingBox[] | null,
  previous: BoundingBox[] | null,
): boolean {
  return !boxArraysEqual(current, previous);
}
