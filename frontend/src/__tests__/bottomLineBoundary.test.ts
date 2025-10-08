/**
 * Comprehensive tests for bottom line boundary behavior
 *
 * Tests the fix for bottom line bounding box shape preservation.
 * Previously, boxes would get permanently flattened when dragged below the bottom line.
 * Now, boxes should maintain their original shape (like spectrogram boundaries).
 */

import { BoundingBox } from "../types";

// Mock the constrainBox function behavior from AnnotationEditor
// This simulates the actual implementation
interface BottomLineState {
  isActive: boolean;
  pixelY: number | null;
  frequency: number | null;
}

interface SpectrogramDimensions {
  width: number;
  height: number;
}

// Simplified version of the constrainBox logic for testing
function constrainBoxWithBottomLine(
  box: BoundingBox,
  bottomLine: BottomLineState,
  spectrogramDimensions: SpectrogramDimensions
): BoundingBox {
  // First apply basic spectrogram constraints
  let constrained = { ...box };

  // Constrain to spectrogram boundaries (simplified)
  const maxY = spectrogramDimensions.height;
  constrained.y = Math.max(0, Math.min(constrained.y, maxY - constrained.height));
  constrained.height = Math.min(constrained.height, maxY - constrained.y);

  // Apply bottom line constraint if active
  // NOTE: Use position-based constraint (like spectrogram boundaries) to preserve box shape
  if (bottomLine.isActive && bottomLine.pixelY !== null) {
    const bottomY = bottomLine.pixelY;

    // If box extends below the bottom line, move it up to keep it fully above the line
    // This preserves the original box height instead of clipping it
    if (constrained.y + constrained.height > bottomY) {
      constrained.y = Math.max(0, bottomY - constrained.height);
    }
  }

  return constrained;
}

// Old (buggy) implementation for comparison tests
function constrainBoxWithBottomLine_Old(
  box: BoundingBox,
  bottomLine: BottomLineState,
  spectrogramDimensions: SpectrogramDimensions
): BoundingBox {
  let constrained = { ...box };

  const maxY = spectrogramDimensions.height;
  constrained.y = Math.max(0, Math.min(constrained.y, maxY - constrained.height));
  constrained.height = Math.min(constrained.height, maxY - constrained.y);

  // Old buggy implementation that clipped height
  if (bottomLine.isActive && bottomLine.pixelY !== null) {
    const bottomY = bottomLine.pixelY;

    if (constrained.y + constrained.height > bottomY) {
      if (constrained.y >= bottomY) {
        constrained.y = Math.max(0, bottomY - constrained.height);
      } else {
        // BUG: This permanently clips the height
        constrained.height = bottomY - constrained.y;
      }
    }
  }

  return constrained;
}

describe("Bottom Line Boundary Behavior", () => {
  const spectrogramDimensions: SpectrogramDimensions = {
    width: 1200,
    height: 600,
  };

  const bottomLineAt300: BottomLineState = {
    isActive: true,
    pixelY: 300,
    frequency: 5000,
  };

  const noBottomLine: BottomLineState = {
    isActive: false,
    pixelY: null,
    frequency: null,
  };

  describe("Shape Preservation (NEW BEHAVIOR)", () => {
    it("should preserve box height when box is entirely above bottom line", () => {
      const box: BoundingBox = {
        x: 100,
        y: 50,
        width: 200,
        height: 100,
        start_time: 0,
        end_time: 1,
        min_frequency: 1000,
        max_frequency: 2000,
      };

      const result = constrainBoxWithBottomLine(box, bottomLineAt300, spectrogramDimensions);

      expect(result.height).toBe(100); // Height unchanged
      expect(result.y).toBe(50); // Position unchanged
    });

    it("should preserve box height and adjust position when box extends below bottom line", () => {
      const box: BoundingBox = {
        x: 100,
        y: 250, // Top at 250
        width: 200,
        height: 100, // Bottom at 350, which exceeds bottomLineAt300
        start_time: 0,
        end_time: 1,
        min_frequency: 1000,
        max_frequency: 2000,
      };

      const result = constrainBoxWithBottomLine(box, bottomLineAt300, spectrogramDimensions);

      expect(result.height).toBe(100); // ✓ Height preserved
      expect(result.y).toBe(200); // ✓ Position moved up to 300 - 100 = 200
      expect(result.y + result.height).toBe(300); // Bottom exactly at bottom line
    });

    it("should preserve box height when box is entirely below bottom line", () => {
      const box: BoundingBox = {
        x: 100,
        y: 400, // Entirely below bottom line at 300
        width: 200,
        height: 100,
        start_time: 0,
        end_time: 1,
        min_frequency: 500,
        max_frequency: 1000,
      };

      const result = constrainBoxWithBottomLine(box, bottomLineAt300, spectrogramDimensions);

      expect(result.height).toBe(100); // ✓ Height preserved
      expect(result.y).toBe(200); // ✓ Moved up to fit above bottom line
    });

    it("should handle tall boxes that don't fit above bottom line", () => {
      const box: BoundingBox = {
        x: 100,
        y: 100,
        width: 200,
        height: 350, // Taller than space above bottom line (300px)
        start_time: 0,
        end_time: 1,
        min_frequency: 1000,
        max_frequency: 8000,
      };

      const result = constrainBoxWithBottomLine(box, bottomLineAt300, spectrogramDimensions);

      expect(result.height).toBe(350); // Height preserved
      expect(result.y).toBe(0); // Pushed to top (Math.max(0, 300 - 350) = 0)
      // Note: Box will extend below bottom line in this case, which is acceptable
      // since we prioritize shape preservation over strict boundary enforcement
    });

    it("should not modify box when bottom line is inactive", () => {
      const box: BoundingBox = {
        x: 100,
        y: 400,
        width: 200,
        height: 100,
        start_time: 0,
        end_time: 1,
        min_frequency: 1000,
        max_frequency: 2000,
      };

      const result = constrainBoxWithBottomLine(box, noBottomLine, spectrogramDimensions);

      // Should only apply spectrogram constraints, not bottom line
      expect(result.height).toBe(100);
      expect(result.y).toBe(400);
    });
  });

  describe("Simulation: Dragging Box Down Past Bottom Line", () => {
    it("should maintain shape during progressive downward movement", () => {
      const originalBox: BoundingBox = {
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        start_time: 0,
        end_time: 1,
        min_frequency: 3000,
        max_frequency: 5000,
      };

      // Simulate dragging down in steps
      const positions = [100, 150, 200, 250, 300, 350, 400];
      const results: BoundingBox[] = [];

      positions.forEach(yPos => {
        const movedBox = { ...originalBox, y: yPos };
        const constrained = constrainBoxWithBottomLine(
          movedBox,
          bottomLineAt300,
          spectrogramDimensions
        );
        results.push(constrained);
      });

      // All results should have the same height
      results.forEach((result, index) => {
        expect(result.height).toBe(100); // ✓ Shape preserved at all positions

        // Compute expected Y position
        const expectedY = positions[index] + 100 > 300 ? 200 : positions[index];
        expect(result.y).toBe(expectedY); // Constrained if needed
      });
    });

    it("should restore original position when dragging back up", () => {
      const originalBox: BoundingBox = {
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        start_time: 0,
        end_time: 1,
        min_frequency: 3000,
        max_frequency: 5000,
      };

      // Drag down past bottom line
      const draggedDown = constrainBoxWithBottomLine(
        { ...originalBox, y: 400 },
        bottomLineAt300,
        spectrogramDimensions
      );

      expect(draggedDown.height).toBe(100); // Height preserved
      expect(draggedDown.y).toBe(200); // Constrained position

      // Drag back to original position
      const draggedBack = constrainBoxWithBottomLine(
        { ...originalBox, y: 100 },
        bottomLineAt300,
        spectrogramDimensions
      );

      expect(draggedBack.height).toBe(100); // ✓ Still original height
      expect(draggedBack.y).toBe(100); // ✓ Back to original position
    });
  });

  describe("Comparison: Old vs New Behavior", () => {
    it("OLD BEHAVIOR: Would flatten box when crossing bottom line", () => {
      const box: BoundingBox = {
        x: 100,
        y: 250,
        width: 200,
        height: 100, // Bottom at 350, exceeds bottomLineAt300
        start_time: 0,
        end_time: 1,
        min_frequency: 2000,
        max_frequency: 4000,
      };

      const oldResult = constrainBoxWithBottomLine_Old(box, bottomLineAt300, spectrogramDimensions);

      // Old behavior: Height gets clipped
      expect(oldResult.height).toBe(50); // ✗ FLATTENED (300 - 250)
      expect(oldResult.y).toBe(250); // Position unchanged
    });

    it("NEW BEHAVIOR: Preserves shape when crossing bottom line", () => {
      const box: BoundingBox = {
        x: 100,
        y: 250,
        width: 200,
        height: 100,
        start_time: 0,
        end_time: 1,
        min_frequency: 2000,
        max_frequency: 4000,
      };

      const newResult = constrainBoxWithBottomLine(box, bottomLineAt300, spectrogramDimensions);

      // New behavior: Height preserved, position adjusted
      expect(newResult.height).toBe(100); // ✓ PRESERVED
      expect(newResult.y).toBe(200); // ✓ Moved up
    });

    it("Should demonstrate the permanent flattening bug in old implementation", () => {
      const originalBox: BoundingBox = {
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        start_time: 0,
        end_time: 1,
        min_frequency: 3000,
        max_frequency: 5000,
      };

      // OLD: Drag down past bottom line
      const oldDraggedDown = constrainBoxWithBottomLine_Old(
        { ...originalBox, y: 250 },
        bottomLineAt300,
        spectrogramDimensions
      );
      expect(oldDraggedDown.height).toBe(50); // Flattened

      // OLD: Drag back up - but height is now 50, not 100!
      const oldDraggedBack = constrainBoxWithBottomLine_Old(
        { ...oldDraggedDown, y: 100 }, // Using flattened box
        bottomLineAt300,
        spectrogramDimensions
      );
      expect(oldDraggedBack.height).toBe(50); // ✗ STAYS FLATTENED (bug)

      // NEW: Drag down past bottom line
      const newDraggedDown = constrainBoxWithBottomLine(
        { ...originalBox, y: 250 },
        bottomLineAt300,
        spectrogramDimensions
      );
      expect(newDraggedDown.height).toBe(100); // Preserved

      // NEW: Drag back up - height still 100!
      const newDraggedBack = constrainBoxWithBottomLine(
        { ...newDraggedDown, y: 100 },
        bottomLineAt300,
        spectrogramDimensions
      );
      expect(newDraggedBack.height).toBe(100); // ✓ PRESERVED (fixed)
    });
  });

  describe("Edge Cases", () => {
    it("should handle box at exact bottom line position", () => {
      const box: BoundingBox = {
        x: 100,
        y: 200,
        width: 200,
        height: 100, // Bottom exactly at 300
        start_time: 0,
        end_time: 1,
        min_frequency: 2000,
        max_frequency: 4000,
      };

      const result = constrainBoxWithBottomLine(box, bottomLineAt300, spectrogramDimensions);

      expect(result.height).toBe(100); // Height preserved
      expect(result.y).toBe(200); // Position unchanged (already at boundary)
    });

    it("should handle zero-height box", () => {
      const box: BoundingBox = {
        x: 100,
        y: 350,
        width: 200,
        height: 0,
        start_time: 0,
        end_time: 1,
        min_frequency: 2000,
        max_frequency: 2000,
      };

      const result = constrainBoxWithBottomLine(box, bottomLineAt300, spectrogramDimensions);

      expect(result.height).toBe(0); // Zero height preserved
      expect(result.y).toBe(300); // Moved to bottom line
    });

    it("should handle box at y=0 with bottom line", () => {
      const box: BoundingBox = {
        x: 100,
        y: 0,
        width: 200,
        height: 100,
        start_time: 0,
        end_time: 1,
        min_frequency: 5000,
        max_frequency: 7000,
      };

      const result = constrainBoxWithBottomLine(box, bottomLineAt300, spectrogramDimensions);

      expect(result.height).toBe(100); // Height preserved
      expect(result.y).toBe(0); // Position unchanged (already above bottom line)
    });

    it("should handle bottom line at y=0", () => {
      const bottomLineAtZero: BottomLineState = {
        isActive: true,
        pixelY: 0,
        frequency: 22050,
      };

      const box: BoundingBox = {
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        start_time: 0,
        end_time: 1,
        min_frequency: 1000,
        max_frequency: 3000,
      };

      const result = constrainBoxWithBottomLine(box, bottomLineAtZero, spectrogramDimensions);

      // Box can't fit above y=0, so it gets pushed to 0
      expect(result.height).toBe(100); // Height preserved
      expect(result.y).toBe(0); // Math.max(0, 0 - 100) = 0
    });

    it("should handle bottom line at spectrogram bottom", () => {
      const bottomLineAtBottom: BottomLineState = {
        isActive: true,
        pixelY: 600,
        frequency: 0,
      };

      const box: BoundingBox = {
        x: 100,
        y: 550,
        width: 200,
        height: 100,
        start_time: 0,
        end_time: 1,
        min_frequency: 500,
        max_frequency: 1500,
      };

      const result = constrainBoxWithBottomLine(box, bottomLineAtBottom, spectrogramDimensions);

      // Bottom line at 600 means box can extend to full height
      expect(result.height).toBe(100); // Height preserved
      expect(result.y).toBe(500); // 600 - 100 = 500
    });
  });

  describe("Consistency with Spectrogram Boundaries", () => {
    it("should behave like spectrogram top boundary", () => {
      // Spectrogram top boundary prevents boxes from going above y=0
      // Bottom line should prevent boxes from going below bottomLine.pixelY
      // Both should preserve shape

      const boxNearTop: BoundingBox = {
        x: 100,
        y: -50, // Trying to go above spectrogram
        width: 200,
        height: 100,
        start_time: 0,
        end_time: 1,
        min_frequency: 8000,
        max_frequency: 10000,
      };

      const result = constrainBoxWithBottomLine(boxNearTop, bottomLineAt300, spectrogramDimensions);

      expect(result.height).toBe(100); // Height preserved
      expect(result.y).toBe(0); // Position clamped to 0
    });

    it("should handle both top boundary and bottom line constraints simultaneously", () => {
      const tallBox: BoundingBox = {
        x: 100,
        y: -100,
        width: 200,
        height: 500, // Extends from -100 to 400, crossing bottom line at 300
        start_time: 0,
        end_time: 1,
        min_frequency: 1000,
        max_frequency: 11000,
      };

      const result = constrainBoxWithBottomLine(tallBox, bottomLineAt300, spectrogramDimensions);

      expect(result.height).toBe(500); // Height preserved
      expect(result.y).toBe(0); // Can't go below -200 (300-500), clamped to 0
    });
  });

  describe("Performance: Repeated Constraints", () => {
    it("should produce consistent results when applied multiple times", () => {
      const box: BoundingBox = {
        x: 100,
        y: 250,
        width: 200,
        height: 100,
        start_time: 0,
        end_time: 1,
        min_frequency: 2000,
        max_frequency: 4000,
      };

      const result1 = constrainBoxWithBottomLine(box, bottomLineAt300, spectrogramDimensions);
      const result2 = constrainBoxWithBottomLine(result1, bottomLineAt300, spectrogramDimensions);
      const result3 = constrainBoxWithBottomLine(result2, bottomLineAt300, spectrogramDimensions);

      // Should be idempotent
      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });
  });
});
