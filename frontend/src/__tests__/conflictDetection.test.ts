import {
  detectConflicts,
  resolveConflicts,
  formatConflictDescription,
  MIN_TIME_GAP,
  BoundingBoxConflict,
  // New unified conflict system
  detectNestingConflicts,
  detectGapConflicts,
  detectAllConflicts,
  resolveAllConflicts,
  formatUnifiedConflictDescription,
  UnifiedConflict,
} from "../utils/conflictDetection";
import { BoundingBox } from "../types";

describe("conflictDetection", () => {
  describe("detectConflicts", () => {
    it("should detect overlapping bounding boxes", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0,
          end_time: 0.995,  // Changed: now ends at 0.995
          label: "Bird 1",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 2,
          x: 95,
          y: 0,
          width: 100,
          height: 50,
          start_time: 1.0,  // Changed: now starts at 1.0 (5ms gap)
          end_time: 2,
          label: "Bird 2",
          min_frequency: 1000,
          max_frequency: 2000,
        },
      ];

      const conflicts = detectConflicts(boxes);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].box1Index).toBe(0);
      expect(conflicts[0].box2Index).toBe(1);
      expect(conflicts[0].overlapAmount).toBeCloseTo(0.005, 3); // 5ms shortage
    });

    it("should not detect conflicts with sufficient gap", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0,
          end_time: 1,
          label: "Bird 1",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 2,
          x: 120,
          y: 0,
          width: 100,
          height: 50,
          start_time: 1.011, // 11ms gap > 10ms MIN_TIME_GAP
          end_time: 2,
          label: "Bird 2",
          min_frequency: 1000,
          max_frequency: 2000,
        },
      ];

      const conflicts = detectConflicts(boxes);
      expect(conflicts).toHaveLength(0);
    });

    it("should handle exactly MIN_TIME_GAP", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0,
          end_time: 1,
          label: "Bird 1",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 2,
          x: 110,
          y: 0,
          width: 100,
          height: 50,
          start_time: 1 + MIN_TIME_GAP, // Exactly MIN_TIME_GAP
          end_time: 2,
          label: "Bird 2",
          min_frequency: 1000,
          max_frequency: 2000,
        },
      ];

      const conflicts = detectConflicts(boxes);
      expect(conflicts).toHaveLength(0);
    });

    it("should detect multiple conflicts", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0,
          end_time: 1,
          label: "Bird 1",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 2,
          x: 95,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0.995, // Conflicts with box 1
          end_time: 2,
          label: "Bird 2",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 3,
          x: 195,
          y: 0,
          width: 100,
          height: 50,
          start_time: 1.997, // Conflicts with box 2
          end_time: 3,
          label: "Bird 3",
          min_frequency: 1000,
          max_frequency: 2000,
        },
      ];

      const conflicts = detectConflicts(boxes);
      expect(conflicts).toHaveLength(2);
    });

    it("should handle empty array", () => {
      const conflicts = detectConflicts([]);
      expect(conflicts).toHaveLength(0);
    });

    it("should handle single box", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0,
          end_time: 1,
          label: "Bird 1",
          min_frequency: 1000,
          max_frequency: 2000,
        },
      ];

      const conflicts = detectConflicts(boxes);
      expect(conflicts).toHaveLength(0);
    });

    it("should handle unsorted boxes correctly", () => {
      const boxes: BoundingBox[] = [
        {
          id: 2,
          x: 200,
          y: 0,
          width: 100,
          height: 50,
          start_time: 2.5,  // Changed: starts at 2.5 to avoid conflict
          end_time: 3.5,    // Changed: ends at 3.5
          label: "Bird 2",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0,
          end_time: 1,
          label: "Bird 1",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 3,
          x: 100,
          y: 0,
          width: 100,
          height: 50,
          start_time: 1.005, // Conflicts with Bird 1
          end_time: 2.0,
          label: "Bird 3",
          min_frequency: 1000,
          max_frequency: 2000,
        },
      ];

      const conflicts = detectConflicts(boxes);
      expect(conflicts).toHaveLength(1);
      // Should find conflict between boxes with IDs 1 and 3
      expect(
        (conflicts[0].box1.id === 1 && conflicts[0].box2.id === 3) ||
          (conflicts[0].box1.id === 3 && conflicts[0].box2.id === 1)
      ).toBe(true);
    });
  });

  describe("resolveConflicts", () => {
    it("should resolve a simple conflict by shrinking boxes", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0,
          end_time: 1,
          label: "Bird 1",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 2,
          x: 95,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0.995,
          end_time: 2,
          label: "Bird 2",
          min_frequency: 1000,
          max_frequency: 2000,
        },
      ];

      const conflicts = detectConflicts(boxes);
      const resolved = resolveConflicts(boxes, conflicts);

      // Check that conflict is resolved
      const newConflicts = detectConflicts(resolved);
      expect(newConflicts).toHaveLength(0);

      // Check that boxes were shrunk towards midpoint
      expect(resolved[0].end_time).toBeLessThan(boxes[0].end_time);
      expect(resolved[1].start_time).toBeGreaterThan(boxes[1].start_time);

      // Check minimum duration is maintained (1ms)
      expect(resolved[0].end_time - resolved[0].start_time).toBeGreaterThanOrEqual(0.001);
      expect(resolved[1].end_time - resolved[1].start_time).toBeGreaterThanOrEqual(0.001);
    });

    it("should handle multiple conflicts", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0,
          end_time: 1,
          label: "Bird 1",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 2,
          x: 95,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0.995,
          end_time: 2,
          label: "Bird 2",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 3,
          x: 195,
          y: 0,
          width: 100,
          height: 50,
          start_time: 1.997,
          end_time: 3,
          label: "Bird 3",
          min_frequency: 1000,
          max_frequency: 2000,
        },
      ];

      const conflicts = detectConflicts(boxes);
      const resolved = resolveConflicts(boxes, conflicts);

      // All conflicts should be resolved
      const newConflicts = detectConflicts(resolved);
      expect(newConflicts).toHaveLength(0);
    });

    it("should not modify boxes without conflicts", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0,
          end_time: 1,
          label: "Bird 1",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 2,
          x: 200,
          y: 0,
          width: 100,
          height: 50,
          start_time: 2,
          end_time: 3,
          label: "Bird 2",
          min_frequency: 1000,
          max_frequency: 2000,
        },
      ];

      const conflicts = detectConflicts(boxes);
      const resolved = resolveConflicts(boxes, conflicts);

      // Boxes should remain unchanged
      expect(resolved[0]).toEqual(boxes[0]);
      expect(resolved[1]).toEqual(boxes[1]);
    });

    it("should preserve box metadata during resolution", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0,
          end_time: 1,
          label: "Bird 1",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 2,
          x: 95,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0.995,
          end_time: 2,
          label: "Bird 2",
          min_frequency: 1500,
          max_frequency: 2500,
        },
      ];

      const conflicts = detectConflicts(boxes);
      const resolved = resolveConflicts(boxes, conflicts);

      // Check metadata is preserved
      expect(resolved[0].id).toBe(boxes[0].id);
      expect(resolved[0].label).toBe(boxes[0].label);
      expect(resolved[0].color).toBe(boxes[0].color);
      expect(resolved[0].min_frequency).toBe(boxes[0].min_frequency);
      expect(resolved[0].max_frequency).toBe(boxes[0].max_frequency);

      expect(resolved[1].id).toBe(boxes[1].id);
      expect(resolved[1].label).toBe(boxes[1].label);
      expect(resolved[1].color).toBe(boxes[1].color);
      expect(resolved[1].min_frequency).toBe(boxes[1].min_frequency);
      expect(resolved[1].max_frequency).toBe(boxes[1].max_frequency);
    });
  });

  describe("formatConflictDescription", () => {
    it("should format conflict with labels", () => {
      const conflict: BoundingBoxConflict = {
        box1Index: 0,
        box2Index: 1,
        box1: {
          id: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0,
          end_time: 1,
          label: "Bird A",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        box2: {
          id: 2,
          x: 95,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0.995,
          end_time: 2,
          label: "Bird B",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        overlapAmount: 0.005,
      };

      const description = formatConflictDescription(conflict);
      expect(description).toBe("Bird A and Bird B (gap shortage: 5.0ms)");
    });

    it("should format conflict without labels", () => {
      const conflict: BoundingBoxConflict = {
        box1Index: 0,
        box2Index: 1,
        box1: {
          id: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0,
          end_time: 1,
          min_frequency: 1000,
          max_frequency: 2000,
        },
        box2: {
          id: 2,
          x: 95,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0.997,
          end_time: 2,
          min_frequency: 1000,
          max_frequency: 2000,
        },
        overlapAmount: 0.003,
      };

      const description = formatConflictDescription(conflict);
      expect(description).toBe("Box 1 and Box 2 (gap shortage: 3.0ms)");
    });

    it("should format overlap amount correctly", () => {
      const conflict: BoundingBoxConflict = {
        box1Index: 5,
        box2Index: 10,
        box1: {
          id: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0,
          end_time: 1,
          label: "Test",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        box2: {
          id: 2,
          x: 95,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0.9923,
          end_time: 2,
          label: "Test2",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        overlapAmount: 0.0077,
      };

      const description = formatConflictDescription(conflict);
      expect(description).toContain("7.7ms");
    });
  });

  describe("MIN_TIME_GAP constant", () => {
    it("should be set to 10 milliseconds", () => {
      expect(MIN_TIME_GAP).toBe(0.010);
    });
  });

  // ============================================
  // NEW TESTS: Unified Conflict System
  // ============================================

  describe("detectNestingConflicts", () => {
    it("should detect nested box (shorter box inside longer box)", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 0,
          width: 300,
          height: 50,
          start_time: 0.0,
          end_time: 3.0,
          label: "Long Bird",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 2,
          x: 100,
          y: 0,
          width: 100,
          height: 50,
          start_time: 1.0,
          end_time: 2.0,
          label: "Short Bird",
          min_frequency: 1000,
          max_frequency: 2000,
        },
      ];

      const conflicts = detectNestingConflicts(boxes);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('nesting');
      expect(conflicts[0].nestedBoxIndex).toBe(1); // Short Bird is nested
      expect(conflicts[0].containerBoxIndex).toBe(0); // Long Bird is container
      expect(conflicts[0].nestingReason).toBe('shorter');
    });

    it("should detect nested box with same length (remove lower frequency)", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          start_time: 1.0,
          end_time: 2.0,
          label: "High Freq Bird",
          min_frequency: 500,  // Lower value = higher on spectrogram
          max_frequency: 2000,
        },
        {
          id: 2,
          x: 0,
          y: 50,
          width: 100,
          height: 50,
          start_time: 1.0,
          end_time: 2.0,
          label: "Low Freq Bird",
          min_frequency: 1500,  // Higher value = lower on spectrogram
          max_frequency: 3000,
        },
      ];

      const conflicts = detectNestingConflicts(boxes);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('nesting');
      expect(conflicts[0].nestedBoxIndex).toBe(1); // Low Freq Bird is nested (lower)
      expect(conflicts[0].containerBoxIndex).toBe(0); // High Freq Bird stays
      expect(conflicts[0].nestingReason).toBe('lower');
    });

    it("should detect chain nesting (A ⊂ B ⊂ C)", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 0,
          width: 500,
          height: 50,
          start_time: 0.0,
          end_time: 5.0,
          label: "Outer",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 2,
          x: 100,
          y: 0,
          width: 300,
          height: 50,
          start_time: 1.0,
          end_time: 4.0,
          label: "Middle",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 3,
          x: 200,
          y: 0,
          width: 100,
          height: 50,
          start_time: 2.0,
          end_time: 3.0,
          label: "Inner",
          min_frequency: 1000,
          max_frequency: 2000,
        },
      ];

      const conflicts = detectNestingConflicts(boxes);
      expect(conflicts.length).toBeGreaterThanOrEqual(2); // Both Inner and Middle should be detected as nested

      const nestedIndices = conflicts.map(c => c.nestedBoxIndex);
      expect(nestedIndices).toContain(2); // Inner is nested
      expect(nestedIndices).toContain(1); // Middle is nested
    });

    it("should not detect partial overlap as nesting", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 0,
          width: 150,
          height: 50,
          start_time: 0.0,
          end_time: 1.5,
          label: "Bird 1",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 2,
          x: 100,
          y: 0,
          width: 150,
          height: 50,
          start_time: 1.0,
          end_time: 2.5,
          label: "Bird 2",
          min_frequency: 1000,
          max_frequency: 2000,
        },
      ];

      const conflicts = detectNestingConflicts(boxes);
      expect(conflicts).toHaveLength(0); // Partial overlap, not nesting
    });

    it("should handle empty array", () => {
      const conflicts = detectNestingConflicts([]);
      expect(conflicts).toHaveLength(0);
    });

    it("should handle single box", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0,
          end_time: 1,
          label: "Solo Bird",
          min_frequency: 1000,
          max_frequency: 2000,
        },
      ];

      const conflicts = detectNestingConflicts(boxes);
      expect(conflicts).toHaveLength(0);
    });
  });

  describe("detectGapConflicts", () => {
    it("should detect gap conflicts (same as old detectConflicts)", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0,
          end_time: 0.995,  // Changed: ends at 0.995
          label: "Bird 1",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 2,
          x: 95,
          y: 0,
          width: 100,
          height: 50,
          start_time: 1.0,  // Changed: starts at 1.0 (5ms gap)
          end_time: 2,
          label: "Bird 2",
          min_frequency: 1000,
          max_frequency: 2000,
        },
      ];

      const conflicts = detectGapConflicts(boxes);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('gap');
      expect(conflicts[0].overlapAmount).toBeCloseTo(0.005, 3);
    });
  });

  describe("detectAllConflicts", () => {
    it("should detect both nesting and gap conflicts", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 0,
          width: 300,
          height: 50,
          start_time: 0.0,
          end_time: 2.995,  // Changed: ends at 2.995
          label: "Long Bird",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 2,
          x: 100,
          y: 0,
          width: 100,
          height: 50,
          start_time: 1.0,
          end_time: 2.0,
          label: "Nested Bird",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 3,
          x: 290,
          y: 0,
          width: 100,
          height: 50,
          start_time: 3.0,  // Changed: starts at 3.0 (5ms gap with first bird)
          end_time: 4.0,
          label: "Gap Bird",
          min_frequency: 1000,
          max_frequency: 2000,
        },
      ];

      const conflicts = detectAllConflicts(boxes);

      const nestingConflicts = conflicts.filter(c => c.type === 'nesting');
      const gapConflicts = conflicts.filter(c => c.type === 'gap');

      expect(nestingConflicts.length).toBe(1);
      expect(gapConflicts.length).toBe(1);
    });
  });

  describe("resolveAllConflicts", () => {
    it("should remove nested boxes and resolve gap conflicts", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 0,
          width: 300,
          height: 50,
          start_time: 0.0,
          end_time: 3.0,
          label: "Long Bird",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 2,
          x: 100,
          y: 0,
          width: 100,
          height: 50,
          start_time: 1.0,
          end_time: 2.0,
          label: "Nested Bird",
          min_frequency: 1000,
          max_frequency: 2000,
        },
      ];

      const conflicts = detectAllConflicts(boxes);
      const resolved = resolveAllConflicts(boxes, conflicts);

      // Nested bird should be removed
      expect(resolved).toHaveLength(1);
      expect(resolved[0].label).toBe("Long Bird");

      // No conflicts should remain
      const remainingConflicts = detectAllConflicts(resolved);
      expect(remainingConflicts).toHaveLength(0);
    });

    it("should handle gap conflicts after removing nested boxes", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0.0,
          end_time: 1.0,
          label: "Bird 1",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 2,
          x: 50,
          y: 0,
          width: 50,
          height: 50,
          start_time: 0.5,
          end_time: 0.7,
          label: "Nested (will be removed)",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 3,
          x: 95,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0.995,
          end_time: 2.0,
          label: "Bird 3",
          min_frequency: 1000,
          max_frequency: 2000,
        },
      ];

      const conflicts = detectAllConflicts(boxes);
      const resolved = resolveAllConflicts(boxes, conflicts);

      // Should have 2 boxes (nested removed)
      expect(resolved).toHaveLength(2);

      // Gap conflict should be resolved (10ms gap)
      const gap = resolved[1].start_time - resolved[0].end_time;
      expect(gap).toBeGreaterThanOrEqual(MIN_TIME_GAP);
    });

    it("should preserve box metadata during resolution", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 0,
          width: 200,
          height: 50,
          start_time: 0.0,
          end_time: 2.0,
          label: "Container",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 2,
          x: 50,
          y: 0,
          width: 50,
          height: 50,
          start_time: 0.5,
          end_time: 1.0,
          label: "Nested",
          min_frequency: 1500,
          max_frequency: 2500,
        },
      ];

      const conflicts = detectAllConflicts(boxes);
      const resolved = resolveAllConflicts(boxes, conflicts);

      // Container should remain with all metadata
      expect(resolved[0].id).toBe(1);
      expect(resolved[0].label).toBe("Container");
      expect(resolved[0].min_frequency).toBe(1000);
      expect(resolved[0].max_frequency).toBe(2000);
    });
  });

  describe("formatUnifiedConflictDescription", () => {
    it("should format gap conflicts", () => {
      const conflict: UnifiedConflict = {
        type: 'gap',
        box1Index: 0,
        box2Index: 1,
        box1: {
          id: 1,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0,
          end_time: 1,
          label: "Bird A",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        box2: {
          id: 2,
          x: 95,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0.995,
          end_time: 2,
          label: "Bird B",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        overlapAmount: 0.005,
      };

      const description = formatUnifiedConflictDescription(conflict);
      expect(description).toBe("Bird A and Bird B (gap shortage: 5.0ms)");
    });

    it("should format nesting conflicts", () => {
      const conflict: UnifiedConflict = {
        type: 'nesting',
        box1Index: 0,
        box2Index: 1,
        box1: {
          id: 1,
          x: 0,
          y: 0,
          width: 300,
          height: 50,
          start_time: 0,
          end_time: 3,
          label: "Container",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        box2: {
          id: 2,
          x: 100,
          y: 0,
          width: 100,
          height: 50,
          start_time: 1,
          end_time: 2,
          label: "Nested",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        nestedBoxIndex: 1,
        containerBoxIndex: 0,
        nestingReason: 'shorter',
      };

      const description = formatUnifiedConflictDescription(conflict);
      expect(description).toBe("Nested nested in Container (will be removed - shorter)");
    });
  });
});
