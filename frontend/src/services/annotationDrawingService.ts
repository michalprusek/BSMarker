/**
 * Annotation drawing service for BSMarker
 * Handles all drawing, selection, and manipulation logic for bounding boxes
 */

import { BoundingBox } from '../types';
import { CoordinateUtils, LAYOUT_CONSTANTS } from '../utils/coordinates';
import { logger } from '../lib/logger';

export interface DrawingState {
  isDrawing: boolean;
  startPoint: { x: number; y: number } | null;
  currentBox: Partial<BoundingBox> | null;
}

export interface SelectionState {
  selectedBoxes: Set<number>;
  isMultiSelect: boolean;
  selectionRect: { x: number; y: number; width: number; height: number } | null;
}

export interface DragState {
  isDragging: boolean;
  draggedBoxIndex: number | null;
  dragOffset: { x: number; y: number };
  initialPositions: Map<number, { x: number; y: number }>;
}

export interface ResizeState {
  isResizing: boolean;
  resizedBoxIndex: number | null;
  resizeHandle: 'nw' | 'ne' | 'sw' | 'se' | null;
  initialBox: BoundingBox | null;
}

export class AnnotationDrawingService {
  private readonly MIN_BOX_SIZE = 10;
  private readonly HANDLE_SIZE = 8;

  // Check if a point is inside a box
  isPointInBox(point: { x: number; y: number }, box: BoundingBox): boolean {
    return (
      point.x >= box.x &&
      point.x <= box.x + box.width &&
      point.y >= box.y &&
      point.y <= box.y + box.height
    );
  }

  // Get resize handle at point
  getResizeHandle(
    point: { x: number; y: number },
    box: BoundingBox
  ): 'nw' | 'ne' | 'sw' | 'se' | null {
    const handles = {
      nw: { x: box.x, y: box.y },
      ne: { x: box.x + box.width, y: box.y },
      sw: { x: box.x, y: box.y + box.height },
      se: { x: box.x + box.width, y: box.y + box.height },
    };

    for (const [handle, pos] of Object.entries(handles)) {
      const distance = Math.sqrt(
        Math.pow(point.x - pos.x, 2) + Math.pow(point.y - pos.y, 2)
      );
      if (distance <= this.HANDLE_SIZE) {
        return handle as 'nw' | 'ne' | 'sw' | 'se';
      }
    }

    return null;
  }

  // Find box at point
  findBoxAtPoint(
    point: { x: number; y: number },
    boxes: BoundingBox[]
  ): number | null {
    // Search in reverse order (top to bottom)
    for (let i = boxes.length - 1; i >= 0; i--) {
      if (this.isPointInBox(point, boxes[i])) {
        return i;
      }
    }
    return null;
  }

  // Create new bounding box
  createBoundingBox(
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number },
    duration: number,
    spectrogramDimensions: { width: number; height: number },
    nyquistFreq: number
  ): BoundingBox {
    const x = Math.min(startPoint.x, endPoint.x);
    const y = Math.min(startPoint.y, endPoint.y);
    const width = Math.abs(endPoint.x - startPoint.x);
    const height = Math.abs(endPoint.y - startPoint.y);

    // Calculate time and frequency values
    const startTime = CoordinateUtils.pixelToTime(
      x,
      duration,
      spectrogramDimensions.width,
      1,
      false
    );
    const endTime = CoordinateUtils.pixelToTime(
      x + width,
      duration,
      spectrogramDimensions.width,
      1,
      false
    );
    const maxFrequency = CoordinateUtils.pixelToFrequency(
      y,
      nyquistFreq,
      spectrogramDimensions.height * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO
    );
    const minFrequency = CoordinateUtils.pixelToFrequency(
      y + height,
      nyquistFreq,
      spectrogramDimensions.height * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO
    );

    return {
      x,
      y,
      width,
      height,
      label: '',
      start_time: startTime,
      end_time: endTime,
      min_frequency: minFrequency,
      max_frequency: maxFrequency,
    };
  }

  // Resize bounding box
  resizeBoundingBox(
    box: BoundingBox,
    handle: 'nw' | 'ne' | 'sw' | 'se',
    newPoint: { x: number; y: number },
    spectrogramDimensions: { width: number; height: number }
  ): BoundingBox {
    const newBox = { ...box };
    const maxX = spectrogramDimensions.width - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
    const maxY = spectrogramDimensions.height * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO;

    switch (handle) {
      case 'nw':
        newBox.width = Math.max(this.MIN_BOX_SIZE, box.x + box.width - newPoint.x);
        newBox.height = Math.max(this.MIN_BOX_SIZE, box.y + box.height - newPoint.y);
        newBox.x = Math.min(newPoint.x, box.x + box.width - this.MIN_BOX_SIZE);
        newBox.y = Math.min(newPoint.y, box.y + box.height - this.MIN_BOX_SIZE);
        break;
      case 'ne':
        newBox.width = Math.max(this.MIN_BOX_SIZE, newPoint.x - box.x);
        newBox.height = Math.max(this.MIN_BOX_SIZE, box.y + box.height - newPoint.y);
        newBox.y = Math.min(newPoint.y, box.y + box.height - this.MIN_BOX_SIZE);
        break;
      case 'sw':
        newBox.width = Math.max(this.MIN_BOX_SIZE, box.x + box.width - newPoint.x);
        newBox.height = Math.max(this.MIN_BOX_SIZE, newPoint.y - box.y);
        newBox.x = Math.min(newPoint.x, box.x + box.width - this.MIN_BOX_SIZE);
        break;
      case 'se':
        newBox.width = Math.max(this.MIN_BOX_SIZE, newPoint.x - box.x);
        newBox.height = Math.max(this.MIN_BOX_SIZE, newPoint.y - box.y);
        break;
    }

    // Constrain to boundaries
    newBox.x = Math.max(0, Math.min(newBox.x, maxX - newBox.width));
    newBox.y = Math.max(0, Math.min(newBox.y, maxY - newBox.height));
    newBox.width = Math.min(newBox.width, maxX - newBox.x);
    newBox.height = Math.min(newBox.height, maxY - newBox.y);

    return newBox;
  }

  // Move bounding box
  moveBoundingBox(
    box: BoundingBox,
    deltaX: number,
    deltaY: number,
    spectrogramDimensions: { width: number; height: number }
  ): BoundingBox {
    const maxX = spectrogramDimensions.width - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
    const maxY = spectrogramDimensions.height * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO;

    const newX = Math.max(0, Math.min(box.x + deltaX, maxX - box.width));
    const newY = Math.max(0, Math.min(box.y + deltaY, maxY - box.height));

    return {
      ...box,
      x: newX,
      y: newY,
    };
  }

  // Select boxes within rectangle
  selectBoxesInRectangle(
    rect: { x: number; y: number; width: number; height: number },
    boxes: BoundingBox[]
  ): Set<number> {
    const selected = new Set<number>();
    const rectLeft = Math.min(rect.x, rect.x + rect.width);
    const rectRight = Math.max(rect.x, rect.x + rect.width);
    const rectTop = Math.min(rect.y, rect.y + rect.height);
    const rectBottom = Math.max(rect.y, rect.y + rect.height);

    boxes.forEach((box, index) => {
      // Check if box intersects with selection rectangle
      if (
        box.x < rectRight &&
        box.x + box.width > rectLeft &&
        box.y < rectBottom &&
        box.y + box.height > rectTop
      ) {
        selected.add(index);
      }
    });

    logger.debug(`Selected ${selected.size} boxes in rectangle`, 'AnnotationDrawing');
    return selected;
  }

  // Duplicate bounding boxes
  duplicateBoxes(
    boxes: BoundingBox[],
    indices: Set<number>,
    offsetX: number = 20,
    offsetY: number = 20
  ): BoundingBox[] {
    const duplicated: BoundingBox[] = [];
    
    indices.forEach(index => {
      if (boxes[index]) {
        const original = boxes[index];
        duplicated.push({
          ...original,
          x: original.x + offsetX,
          y: original.y + offsetY,
        });
      }
    });

    logger.info(`Duplicated ${duplicated.length} boxes`, 'AnnotationDrawing');
    return duplicated;
  }

  // Align boxes
  alignBoxes(
    boxes: BoundingBox[],
    indices: Set<number>,
    alignment: 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v'
  ): BoundingBox[] {
    if (indices.size === 0) return boxes;

    const selectedBoxes = Array.from(indices).map(i => boxes[i]).filter(Boolean);
    if (selectedBoxes.length === 0) return boxes;

    let alignValue: number;
    const updatedBoxes = [...boxes];

    switch (alignment) {
      case 'left':
        alignValue = Math.min(...selectedBoxes.map(b => b.x));
        indices.forEach(i => {
          if (updatedBoxes[i]) updatedBoxes[i].x = alignValue;
        });
        break;
      case 'right':
        alignValue = Math.max(...selectedBoxes.map(b => b.x + b.width));
        indices.forEach(i => {
          if (updatedBoxes[i]) updatedBoxes[i].x = alignValue - updatedBoxes[i].width;
        });
        break;
      case 'top':
        alignValue = Math.min(...selectedBoxes.map(b => b.y));
        indices.forEach(i => {
          if (updatedBoxes[i]) updatedBoxes[i].y = alignValue;
        });
        break;
      case 'bottom':
        alignValue = Math.max(...selectedBoxes.map(b => b.y + b.height));
        indices.forEach(i => {
          if (updatedBoxes[i]) updatedBoxes[i].y = alignValue - updatedBoxes[i].height;
        });
        break;
      case 'center-h':
        const avgX = selectedBoxes.reduce((sum, b) => sum + b.x + b.width / 2, 0) / selectedBoxes.length;
        indices.forEach(i => {
          if (updatedBoxes[i]) updatedBoxes[i].x = avgX - updatedBoxes[i].width / 2;
        });
        break;
      case 'center-v':
        const avgY = selectedBoxes.reduce((sum, b) => sum + b.y + b.height / 2, 0) / selectedBoxes.length;
        indices.forEach(i => {
          if (updatedBoxes[i]) updatedBoxes[i].y = avgY - updatedBoxes[i].height / 2;
        });
        break;
    }

    logger.info(`Aligned ${indices.size} boxes: ${alignment}`, 'AnnotationDrawing');
    return updatedBoxes;
  }

  // Distribute boxes evenly
  distributeBoxes(
    boxes: BoundingBox[],
    indices: Set<number>,
    direction: 'horizontal' | 'vertical'
  ): BoundingBox[] {
    if (indices.size < 3) return boxes; // Need at least 3 boxes to distribute

    const selectedBoxes = Array.from(indices)
      .map(i => ({ index: i, box: boxes[i] }))
      .filter(item => item.box)
      .sort((a, b) => {
        return direction === 'horizontal' 
          ? a.box.x - b.box.x 
          : a.box.y - b.box.y;
      });

    if (selectedBoxes.length < 3) return boxes;

    const updatedBoxes = [...boxes];
    const first = selectedBoxes[0].box;
    const last = selectedBoxes[selectedBoxes.length - 1].box;

    if (direction === 'horizontal') {
      const totalSpace = last.x - first.x;
      const spacing = totalSpace / (selectedBoxes.length - 1);
      
      selectedBoxes.forEach((item, i) => {
        if (i > 0 && i < selectedBoxes.length - 1) {
          updatedBoxes[item.index].x = first.x + spacing * i;
        }
      });
    } else {
      const totalSpace = last.y - first.y;
      const spacing = totalSpace / (selectedBoxes.length - 1);
      
      selectedBoxes.forEach((item, i) => {
        if (i > 0 && i < selectedBoxes.length - 1) {
          updatedBoxes[item.index].y = first.y + spacing * i;
        }
      });
    }

    logger.info(`Distributed ${indices.size} boxes ${direction}ly`, 'AnnotationDrawing');
    return updatedBoxes;
  }
}

// Singleton instance
export const annotationDrawingService = new AnnotationDrawingService();
export default annotationDrawingService;