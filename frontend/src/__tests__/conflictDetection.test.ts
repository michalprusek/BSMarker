import {
  detectConflicts,
  resolveConflicts,
  formatConflictDescription,
  MIN_TIME_GAP,
  BoundingBoxConflict,
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
          end_time: 1,
          label: "Bird 1",
          color: "#FF0000",
          min_frequency: 1000,
          max_frequency: 2000,
        },
        {
          id: 2,
          x: 95,
          y: 0,
          width: 100,
          height: 50,
          start_time: 0.995, // 5ms gap < 10ms MIN_TIME_GAP
          end_time: 2,
          label: "Bird 2",
          color: "#00FF00",
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
          color: "#FF0000",
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
          color: "#00FF00",
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
          color: "#FF0000",
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
          color: "#00FF00",
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
          color: "#FF0000",
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
          color: "#00FF00",
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
          color: "#0000FF",
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
          color: "#FF0000",
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
          start_time: 2,
          end_time: 3,
          label: "Bird 2",
          color: "#00FF00",
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
          color: "#FF0000",
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
          end_time: 2,
          label: "Bird 3",
          color: "#0000FF",
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
          color: "#FF0000",
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
          color: "#00FF00",
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
          color: "#FF0000",
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
          color: "#00FF00",
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
          color: "#0000FF",
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
          color: "#FF0000",
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
          color: "#00FF00",
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
          color: "#FF0000",
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
          color: "#00FF00",
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
          color: "#FF0000",
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
          color: "#00FF00",
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
          color: "#FF0000",
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
          color: "#00FF00",
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
          color: "#FF0000",
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
          color: "#00FF00",
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
});
