import { BoundingBox } from "../types";

/**
 * Minimum required time gap between bounding boxes in seconds
 */
export const MIN_TIME_GAP = 0.010; // 10 milliseconds

/**
 * Gap to add when resolving conflicts (5ms on each side = 10ms total)
 */
const RESOLUTION_GAP = 0.005; // 5 milliseconds

/**
 * Interface representing a conflict between two bounding boxes
 */
export interface BoundingBoxConflict {
  box1Index: number;
  box2Index: number;
  box1: BoundingBox;
  box2: BoundingBox;
  overlapAmount: number; // in seconds
}

/**
 * Detects conflicts between bounding boxes where the time gap is less than MIN_TIME_GAP
 * @param boxes Array of bounding boxes to check
 * @returns Array of conflicts found
 */
export function detectConflicts(boxes: BoundingBox[]): BoundingBoxConflict[] {
  const conflicts: BoundingBoxConflict[] = [];

  // Sort boxes by start time for efficient conflict detection
  const sortedBoxes = boxes
    .map((box, index) => ({ box, index }))
    .sort((a, b) => a.box.start_time - b.box.start_time);

  // Check each pair of consecutive boxes
  for (let i = 0; i < sortedBoxes.length - 1; i++) {
    for (let j = i + 1; j < sortedBoxes.length; j++) {
      const { box: box1, index: index1 } = sortedBoxes[i];
      const { box: box2, index: index2 } = sortedBoxes[j];

      // If box2 starts after box1 ends + MIN_TIME_GAP, no conflict possible
      if (box2.start_time >= box1.end_time + MIN_TIME_GAP) {
        break;
      }

      // Check if there's overlap or insufficient gap
      const gap = box2.start_time - box1.end_time;

      if (gap < MIN_TIME_GAP) {
        const overlapAmount = MIN_TIME_GAP - gap;
        conflicts.push({
          box1Index: index1,
          box2Index: index2,
          box1,
          box2,
          overlapAmount,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Resolves conflicts by adjusting bounding box times
 * Algorithm:
 * 1. Find the midpoint of the overlap
 * 2. Shrink each box by 5ms towards the midpoint
 * 3. This creates a 10ms gap between the boxes
 *
 * @param boxes Array of bounding boxes
 * @param conflicts Array of conflicts to resolve
 * @returns New array of bounding boxes with conflicts resolved
 */
export function resolveConflicts(
  boxes: BoundingBox[],
  conflicts: BoundingBoxConflict[]
): BoundingBox[] {
  // Create a copy of the boxes array
  const resolvedBoxes = [...boxes];

  // Track which boxes have been modified to avoid double-modifications
  const modifications = new Map<number, { newEndTime?: number; newStartTime?: number }>();

  // Process each conflict
  for (const conflict of conflicts) {
    const { box1Index, box2Index, box1, box2 } = conflict;

    // Calculate the midpoint between the two boxes
    const midpoint = (box1.end_time + box2.start_time) / 2;

    // Get existing modifications or create new ones
    const box1Mod = modifications.get(box1Index) || {};
    const box2Mod = modifications.get(box2Index) || {};

    // Adjust box1's end time: midpoint - 5ms
    const newBox1EndTime = midpoint - RESOLUTION_GAP;

    // Adjust box2's start time: midpoint + 5ms
    const newBox2StartTime = midpoint + RESOLUTION_GAP;

    // Only update if the new time is more restrictive (shrinks the box more)
    if (!box1Mod.newEndTime || newBox1EndTime < box1Mod.newEndTime) {
      box1Mod.newEndTime = Math.max(box1.start_time + 0.001, newBox1EndTime); // Ensure at least 1ms duration
    }

    if (!box2Mod.newStartTime || newBox2StartTime > box2Mod.newStartTime) {
      box2Mod.newStartTime = Math.min(box2.end_time - 0.001, newBox2StartTime); // Ensure at least 1ms duration
    }

    modifications.set(box1Index, box1Mod);
    modifications.set(box2Index, box2Mod);
  }

  // Apply all modifications
  modifications.forEach((mod, index) => {
    const box = resolvedBoxes[index];
    resolvedBoxes[index] = {
      ...box,
      end_time: mod.newEndTime ?? box.end_time,
      start_time: mod.newStartTime ?? box.start_time,
    };
  });

  return resolvedBoxes;
}

/**
 * Formats conflict information for display
 * @param conflict The conflict to format
 * @returns Human-readable conflict description
 */
export function formatConflictDescription(conflict: BoundingBoxConflict): string {
  const box1Label = conflict.box1.label || `Box ${conflict.box1Index + 1}`;
  const box2Label = conflict.box2.label || `Box ${conflict.box2Index + 1}`;
  const overlapMs = (conflict.overlapAmount * 1000).toFixed(1);

  return `${box1Label} and ${box2Label} (gap shortage: ${overlapMs}ms)`;
}
