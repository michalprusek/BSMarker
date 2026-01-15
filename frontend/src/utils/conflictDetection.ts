import { BoundingBox } from "../types";

/**
 * Minimum required time gap between bounding boxes in seconds
 */
export const MIN_TIME_GAP = 0.010; // 10 milliseconds

/**
 * Gap to add when resolving conflicts (6ms on each side = 12ms total)
 * Using 12ms instead of 10ms to account for floating-point rounding errors
 */
const RESOLUTION_GAP = 0.006; // 6 milliseconds

/**
 * Type of conflict between bounding boxes
 */
export type ConflictType = 'gap' | 'nesting';

/**
 * Reason why a nested box should be removed
 */
export type NestingReason = 'shorter' | 'lower';

/**
 * Unified conflict interface supporting both gap and nesting conflicts
 */
export interface UnifiedConflict {
  type: ConflictType;
  box1Index: number;
  box2Index: number;
  box1: BoundingBox;
  box2: BoundingBox;

  // Gap-specific fields (only for type='gap')
  overlapAmount?: number; // in seconds

  // Nesting-specific fields (only for type='nesting')
  nestedBoxIndex?: number;      // Index of box that will be removed
  containerBoxIndex?: number;   // Index of box that contains the nested box
  nestingReason?: NestingReason; // Why the nested box is removed
}

/**
 * Detects nested bounding boxes (one box temporally contained within another)
 * Optimized algorithm: O(n log n) for sorting + O(n²) worst case for nested checking
 *
 * A box A is nested in box B if:
 * - A.start_time >= B.start_time AND A.end_time <= B.end_time
 *
 * Resolution rules:
 * - If lengths differ: remove the shorter box
 * - If lengths equal: remove the lower box (higher min_frequency value)
 *
 * @param boxes Array of bounding boxes to check
 * @returns Array of nesting conflicts found
 */
export function detectNestingConflicts(boxes: BoundingBox[]): UnifiedConflict[] {
  const conflicts: UnifiedConflict[] = [];

  if (boxes.length < 2) {
    return conflicts; // No nesting possible with 0 or 1 boxes
  }

  // Sort boxes by start_time for efficient detection - O(n log n)
  const sorted = boxes
    .map((box, index) => ({ box, index }))
    .sort((a, b) => a.box.start_time - b.box.start_time);

  // Track which boxes are already identified as nested to avoid duplicates
  const alreadyNested = new Set<number>();

  // For each box, check if it's nested within any other box
  for (let i = 0; i < sorted.length; i++) {
    if (alreadyNested.has(sorted[i].index)) continue;

    const current = sorted[i];
    const currentLength = current.box.end_time - current.box.start_time;

    // Check against all other boxes for nesting relationship
    for (let j = 0; j < sorted.length; j++) {
      if (i === j || alreadyNested.has(sorted[j].index)) continue;

      const other = sorted[j];
      const otherLength = other.box.end_time - other.box.start_time;

      // Check if current is nested in other
      const isCurrentNestedInOther =
        current.box.start_time >= other.box.start_time &&
        current.box.end_time <= other.box.end_time;

      // Check if other is nested in current
      const isOtherNestedInCurrent =
        other.box.start_time >= current.box.start_time &&
        other.box.end_time <= current.box.end_time;

      let nestedIndex: number | null = null;
      let containerIndex: number | null = null;
      let reason: NestingReason | null = null;

      if (isCurrentNestedInOther) {
        // current is inside other
        if (currentLength < otherLength) {
          // current is shorter → remove current
          nestedIndex = current.index;
          containerIndex = other.index;
          reason = 'shorter';
        } else if (currentLength === otherLength) {
          // Same length → remove the lower one (higher min_frequency)
          const currentMinFreq = current.box.min_frequency || 0;
          const otherMinFreq = other.box.min_frequency || 0;

          if (currentMinFreq > otherMinFreq) {
            nestedIndex = current.index;
            containerIndex = other.index;
            reason = 'lower';
          } else if (otherMinFreq > currentMinFreq) {
            nestedIndex = other.index;
            containerIndex = current.index;
            reason = 'lower';
          } else {
            // Equal frequencies - use index as tie-breaker (remove higher index)
            if (current.index > other.index) {
              nestedIndex = current.index;
              containerIndex = other.index;
            } else {
              nestedIndex = other.index;
              containerIndex = current.index;
            }
            reason = 'lower';
          }
        }
        // If current is longer, other should be removed (handled when j iteration processes other)
      } else if (isOtherNestedInCurrent) {
        // other is inside current
        if (otherLength < currentLength) {
          // other is shorter → remove other
          nestedIndex = other.index;
          containerIndex = current.index;
          reason = 'shorter';
        } else if (otherLength === currentLength) {
          // Same length → remove the lower one
          const currentMinFreq = current.box.min_frequency || 0;
          const otherMinFreq = other.box.min_frequency || 0;

          if (otherMinFreq > currentMinFreq) {
            nestedIndex = other.index;
            containerIndex = current.index;
            reason = 'lower';
          } else if (currentMinFreq > otherMinFreq) {
            nestedIndex = current.index;
            containerIndex = other.index;
            reason = 'lower';
          } else {
            // Equal frequencies - use index as tie-breaker (remove higher index)
            if (other.index > current.index) {
              nestedIndex = other.index;
              containerIndex = current.index;
            } else {
              nestedIndex = current.index;
              containerIndex = other.index;
            }
            reason = 'lower';
          }
        }
      }

      // If we identified a nesting conflict, add it
      if (nestedIndex !== null && containerIndex !== null && reason !== null) {
        alreadyNested.add(nestedIndex);

        conflicts.push({
          type: 'nesting',
          box1Index: Math.min(nestedIndex, containerIndex),
          box2Index: Math.max(nestedIndex, containerIndex),
          box1: boxes[Math.min(nestedIndex, containerIndex)],
          box2: boxes[Math.max(nestedIndex, containerIndex)],
          nestedBoxIndex: nestedIndex,
          containerBoxIndex: containerIndex,
          nestingReason: reason,
        });

        // Stop checking for this nested box
        break;
      }
    }
  }

  return conflicts;
}

/**
 * Detects gap conflicts between bounding boxes (time gap less than MIN_TIME_GAP)
 * Optimized algorithm: O(n log n) due to sorting + O(n) for single pass
 *
 * @param boxes Array of bounding boxes to check
 * @returns Array of gap conflicts as UnifiedConflict
 */
export function detectGapConflicts(boxes: BoundingBox[]): UnifiedConflict[] {
  const conflicts: UnifiedConflict[] = [];

  if (boxes.length < 2) {
    return conflicts; // No conflicts possible with 0 or 1 boxes
  }

  // Sort boxes by start time for efficient conflict detection - O(n log n)
  const sortedBoxes = boxes
    .map((box, index) => ({ box, index }))
    .sort((a, b) => a.box.start_time - b.box.start_time);

  // Single pass through sorted boxes to find conflicts - O(n)
  const activeBoxes: Array<{ box: BoundingBox; index: number }> = [];

  for (let i = 0; i < sortedBoxes.length; i++) {
    const current = sortedBoxes[i];

    // Remove boxes from active set that have ended before current box starts
    let activeIndex = 0;
    while (activeIndex < activeBoxes.length) {
      const active = activeBoxes[activeIndex];
      if (active.box.end_time + MIN_TIME_GAP <= current.box.start_time) {
        // This box is no longer active, remove it
        activeBoxes.splice(activeIndex, 1);
      } else {
        activeIndex++;
      }
    }

    // Check current box against all remaining active boxes
    for (const active of activeBoxes) {
      const gap = current.box.start_time - active.box.end_time;

      // Detect gap conflicts for both overlaps and insufficient gaps
      // Exclude nesting cases (where current box is completely inside active box)
      // Use >= to include boxes with same end_time but insufficient gap
      if (gap < MIN_TIME_GAP && current.box.end_time >= active.box.end_time) {
        const overlapAmount = MIN_TIME_GAP - gap;
        conflicts.push({
          type: 'gap',
          box1Index: active.index,
          box2Index: current.index,
          box1: active.box,
          box2: current.box,
          overlapAmount,
        });
      }
    }

    // Add current box to active set
    activeBoxes.push(current);
  }

  return conflicts;
}

/**
 * Detects all types of conflicts (nesting + gap) in a single call
 * Returns unified conflict array for consistent handling
 *
 * Resolution order:
 * 1. Nesting conflicts are detected first
 * 2. Gap conflicts are detected on boxes after nesting removal
 *
 * @param boxes Array of bounding boxes to check
 * @returns Array of all conflicts (nesting + gap)
 */
export function detectAllConflicts(boxes: BoundingBox[]): UnifiedConflict[] {
  // Note: We detect both types independently, but gap conflicts
  // should be resolved AFTER nesting conflicts are removed
  const nestingConflicts = detectNestingConflicts(boxes);
  const gapConflicts = detectGapConflicts(boxes);

  return [...nestingConflicts, ...gapConflicts];
}

/**
 * Internal helper: Resolves gap conflicts by adjusting bounding box times
 * Algorithm:
 * 1. Find the midpoint of the overlap
 * 2. Shrink each box by 6ms towards the midpoint
 * 3. This creates a 12ms gap between the boxes
 */
interface GapConflict {
  box1Index: number;
  box2Index: number;
  box1: BoundingBox;
  box2: BoundingBox;
  overlapAmount: number;
}

function resolveGapConflicts(
  boxes: BoundingBox[],
  conflicts: GapConflict[]
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

    // Adjust box1's end time: midpoint - 6ms
    const newBox1EndTime = midpoint - RESOLUTION_GAP;

    // Adjust box2's start time: midpoint + 6ms
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
 * Resolves all types of conflicts (nesting + gap) in correct order
 *
 * Resolution algorithm:
 * 1. Remove nested boxes (identified by nesting conflicts)
 * 2. Remap gap conflict indices after box removal
 * 3. Apply gap resolution (symmetric shrinking) to remaining boxes
 *
 * @param boxes Array of bounding boxes
 * @param conflicts Array of unified conflicts to resolve
 * @returns New array of bounding boxes with all conflicts resolved
 */
export function resolveAllConflicts(
  boxes: BoundingBox[],
  conflicts: UnifiedConflict[]
): BoundingBox[] {
  // Separate conflicts by type
  const nestingConflicts = conflicts.filter((c) => c.type === 'nesting');
  const gapConflicts = conflicts.filter((c) => c.type === 'gap');

  // Step 1: Remove nested boxes
  const indicesToRemove = new Set(
    nestingConflicts.map((c) => c.nestedBoxIndex!)
  );
  let resolved = boxes.filter((_, i) => !indicesToRemove.has(i));

  // Step 2: Remap gap conflict indices (after removal, indices have shifted)
  const indexMapping = new Map<number, number>();
  let newIndex = 0;
  for (let oldIndex = 0; oldIndex < boxes.length; oldIndex++) {
    if (!indicesToRemove.has(oldIndex)) {
      indexMapping.set(oldIndex, newIndex);
      newIndex++;
    }
  }

  // Convert UnifiedConflict gap conflicts to internal format with remapped indices
  const remappedGapConflicts: GapConflict[] = gapConflicts
    .map((c) => {
      const newBox1Index = indexMapping.get(c.box1Index);
      const newBox2Index = indexMapping.get(c.box2Index);

      // Skip gap conflicts involving nested boxes (they were already removed in Step 1)
      if (newBox1Index === undefined || newBox2Index === undefined) {
        return null;
      }

      return {
        box1Index: newBox1Index,
        box2Index: newBox2Index,
        box1: resolved[newBox1Index],
        box2: resolved[newBox2Index],
        overlapAmount: c.overlapAmount!,
      };
    })
    .filter((c): c is GapConflict => c !== null);

  // Step 3: Apply gap resolution to remaining boxes
  if (remappedGapConflicts.length > 0) {
    resolved = resolveGapConflicts(resolved, remappedGapConflicts);
  }

  return resolved;
}

/**
 * Formats unified conflict information for display
 * @param conflict The unified conflict to format
 * @returns Human-readable conflict description
 */
export function formatConflictDescription(conflict: UnifiedConflict): string {
  const box1Label = conflict.box1.label || `Box ${conflict.box1Index + 1}`;
  const box2Label = conflict.box2.label || `Box ${conflict.box2Index + 1}`;

  if (conflict.type === 'gap') {
    const overlapMs = (conflict.overlapAmount! * 1000).toFixed(1);
    return `${box1Label} and ${box2Label} (gap shortage: ${overlapMs}ms)`;
  } else if (conflict.type === 'nesting') {
    const nestedLabel =
      (conflict.nestedBoxIndex === conflict.box1Index ? conflict.box1.label : conflict.box2.label) ||
      `Box ${conflict.nestedBoxIndex! + 1}`;
    const containerLabel =
      (conflict.containerBoxIndex === conflict.box1Index ? conflict.box1.label : conflict.box2.label) ||
      `Box ${conflict.containerBoxIndex! + 1}`;
    const reason = conflict.nestingReason === 'shorter' ? 'shorter' : 'lower in frequency';

    return `${nestedLabel} nested in ${containerLabel} (will be removed - ${reason})`;
  }

  return 'Unknown conflict type';
}
