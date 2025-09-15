/**
 * Utility functions for annotation operations
 * Provides SSOT for bounding box validation, constraints, and transformations
 */

import { BoundingBox } from "../types";
import { CoordinateUtils } from "./coordinates";

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
 * Check if two bounding boxes overlap
 */
export function doBoxesOverlap(
  box1: { x: number; y: number; width: number; height: number },
  box2: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    box1.x + box1.width < box2.x ||
    box2.x + box2.width < box1.x ||
    box1.y + box1.height < box2.y ||
    box2.y + box2.height < box1.y
  );
}

/**
 * Check if a box is completely inside another box
 */
export function isBoxInsideBox(
  inner: { x: number; y: number; width: number; height: number },
  outer: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * Get the intersection of two boxes
 */
export function getBoxIntersection(
  box1: { x: number; y: number; width: number; height: number },
  box2: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } | null {
  const x = Math.max(box1.x, box2.x);
  const y = Math.max(box1.y, box2.y);
  const right = Math.min(box1.x + box1.width, box2.x + box2.width);
  const bottom = Math.min(box1.y + box1.height, box2.y + box2.height);

  if (right > x && bottom > y) {
    return {
      x,
      y,
      width: right - x,
      height: bottom - y,
    };
  }

  return null;
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
 * Check if a point is near a box edge (for resize handles)
 */
export function getNearestBoxEdge(
  point: { x: number; y: number },
  box: { x: number; y: number; width: number; height: number },
  threshold: number = 5,
):
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | null {
  const nearLeft = Math.abs(point.x - box.x) < threshold;
  const nearRight = Math.abs(point.x - (box.x + box.width)) < threshold;
  const nearTop = Math.abs(point.y - box.y) < threshold;
  const nearBottom = Math.abs(point.y - (box.y + box.height)) < threshold;

  // Check corners first
  if (nearLeft && nearTop) return "top-left";
  if (nearRight && nearTop) return "top-right";
  if (nearLeft && nearBottom) return "bottom-left";
  if (nearRight && nearBottom) return "bottom-right";

  // Check edges
  if (nearLeft) return "left";
  if (nearRight) return "right";
  if (nearTop) return "top";
  if (nearBottom) return "bottom";

  return null;
}

/**
 * Validate bounding box dimensions
 */
export function validateBoxDimensions(
  box: { width: number; height: number },
  minWidth: number = 5,
  minHeight: number = 5,
): boolean {
  return box.width >= minWidth && box.height >= minHeight;
}

/**
 * Constrain a bounding box within boundaries
 */
export function constrainBoxInBounds(
  box: { x: number; y: number; width: number; height: number },
  bounds: { width: number; height: number },
  minSize: { width: number; height: number } = { width: 5, height: 5 },
): { x: number; y: number; width: number; height: number } {
  // Ensure minimum size
  const width = Math.max(box.width, minSize.width);
  const height = Math.max(box.height, minSize.height);

  // Constrain position
  const x = Math.max(0, Math.min(box.x, bounds.width - width));
  const y = Math.max(0, Math.min(box.y, bounds.height - height));

  // Constrain size if box is too large
  const constrainedWidth = Math.min(width, bounds.width - x);
  const constrainedHeight = Math.min(height, bounds.height - y);

  return {
    x,
    y,
    width: constrainedWidth,
    height: constrainedHeight,
  };
}

/**
 * Calculate bounding box from two points (for drawing)
 */
export function getBoxFromPoints(
  start: { x: number; y: number },
  end: { x: number; y: number },
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

/**
 * Resize a box from a specific handle
 */
export function resizeBoxFromHandle(
  box: { x: number; y: number; width: number; height: number },
  handle: string,
  deltaX: number,
  deltaY: number,
  maintainAspectRatio: boolean = false,
): { x: number; y: number; width: number; height: number } {
  let { x, y, width, height } = box;

  switch (handle) {
    case "top-left":
      x += deltaX;
      y += deltaY;
      width -= deltaX;
      height -= deltaY;
      break;
    case "top-right":
      y += deltaY;
      width += deltaX;
      height -= deltaY;
      break;
    case "bottom-left":
      x += deltaX;
      width -= deltaX;
      height += deltaY;
      break;
    case "bottom-right":
      width += deltaX;
      height += deltaY;
      break;
    case "left":
      x += deltaX;
      width -= deltaX;
      break;
    case "right":
      width += deltaX;
      break;
    case "top":
      y += deltaY;
      height -= deltaY;
      break;
    case "bottom":
      height += deltaY;
      break;
  }

  // Maintain aspect ratio if required
  if (maintainAspectRatio && box.width > 0 && box.height > 0) {
    const aspectRatio = box.width / box.height;
    if (handle.includes("left") || handle.includes("right")) {
      height = width / aspectRatio;
    } else {
      width = height * aspectRatio;
    }
  }

  return { x, y, width, height };
}

/**
 * Get all boxes that intersect with a selection rectangle
 */
export function getBoxesInSelection(
  selectionRect: { x: number; y: number; width: number; height: number },
  boxes: Array<{ x: number; y: number; width: number; height: number }>,
): number[] {
  const selectedIndices: number[] = [];

  boxes.forEach((box, index) => {
    if (doBoxesOverlap(selectionRect, box)) {
      selectedIndices.push(index);
    }
  });

  return selectedIndices;
}

/**
 * Sort bounding boxes by position (left to right, top to bottom)
 */
export function sortBoxesByPosition(boxes: BoundingBox[]): BoundingBox[] {
  return [...boxes].sort((a, b) => {
    // First sort by x position
    if (Math.abs(a.x - b.x) > 10) {
      return a.x - b.x;
    }
    // If x positions are similar, sort by y position
    return a.y - b.y;
  });
}

/**
 * Group overlapping boxes
 */
export function groupOverlappingBoxes(boxes: BoundingBox[]): BoundingBox[][] {
  const groups: BoundingBox[][] = [];
  const visited = new Set<number>();

  boxes.forEach((box, index) => {
    if (visited.has(index)) return;

    const group: BoundingBox[] = [box];
    visited.add(index);

    // Find all boxes that overlap with this group
    let changed = true;
    while (changed) {
      changed = false;
      boxes.forEach((otherBox, otherIndex) => {
        if (visited.has(otherIndex)) return;

        // Check if this box overlaps with any box in the group
        const overlapsWithGroup = group.some((groupBox) =>
          doBoxesOverlap(groupBox, otherBox),
        );

        if (overlapsWithGroup) {
          group.push(otherBox);
          visited.add(otherIndex);
          changed = true;
        }
      });
    }

    groups.push(group);
  });

  return groups;
}

/**
 * Merge overlapping boxes into a single box
 */
export function mergeBoxes(
  boxes: Array<{ x: number; y: number; width: number; height: number }>,
): { x: number; y: number; width: number; height: number } | null {
  if (boxes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  boxes.forEach((box) => {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  });

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Calculate the minimum bounding box that contains all given boxes
 */
export function getBoundingBoxOfBoxes(
  boxes: Array<{ x: number; y: number; width: number; height: number }>,
): { x: number; y: number; width: number; height: number } | null {
  return mergeBoxes(boxes);
}

/**
 * Snap a value to grid
 */
export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Snap a box to grid
 */
export function snapBoxToGrid(
  box: { x: number; y: number; width: number; height: number },
  gridSize: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: snapToGrid(box.x, gridSize),
    y: snapToGrid(box.y, gridSize),
    width: snapToGrid(box.width, gridSize),
    height: snapToGrid(box.height, gridSize),
  };
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return "just now";
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  } else {
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  }
}

/**
 * Generate a unique ID for a bounding box
 */
export function generateBoxId(): string {
  return `box_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default {
  isPointInBox,
  doBoxesOverlap,
  isBoxInsideBox,
  getBoxIntersection,
  getBoxCenter,
  getDistance,
  getNearestBoxEdge,
  validateBoxDimensions,
  constrainBoxInBounds,
  getBoxFromPoints,
  resizeBoxFromHandle,
  getBoxesInSelection,
  sortBoxesByPosition,
  groupOverlappingBoxes,
  mergeBoxes,
  getBoundingBoxOfBoxes,
  snapToGrid,
  snapBoxToGrid,
  formatTimestamp,
  generateBoxId,
};
