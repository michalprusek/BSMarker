/**
 * useDrawingMode - State machine for drawing/interaction modes
 *
 * Consolidates multiple drawing-related states into a single state machine:
 * - isAnnotationMode, isRoiSelectionMode, isSettingBottomLine -> mode
 * - isDrawing, drawingBox -> drawing state
 * - isSelecting, selectionRect -> selection state
 *
 * Only one mode can be active at a time, preventing conflicting interactions.
 */

import { useState, useCallback } from 'react';

export type DrawingMode =
  | 'none'           // Default - no special mode active
  | 'annotation'     // Drawing bounding boxes
  | 'roi_selection'  // Rectangle selection of multiple boxes
  | 'bottom_line'    // Setting frequency boundary
  | 'panning';       // Panning the view

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** @deprecated Use Rectangle instead */
export type DrawingBox = Rectangle;

/** @deprecated Use Rectangle instead */
export type SelectionRect = Rectangle;

export interface Point {
  x: number;
  y: number;
}

/** Calculate rectangle bounds from two corner points */
function calculateRectangle(start: Point, current: Point): Rectangle {
  return {
    x: Math.min(current.x, start.x),
    y: Math.min(current.y, start.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

interface UseDrawingModeOptions {
  /** Callback when mode changes */
  onModeChange?: (newMode: DrawingMode, prevMode: DrawingMode) => void;
}

interface DrawingModeReturn {
  // Current mode
  mode: DrawingMode;

  // Mode checks (for convenience)
  isAnnotationMode: boolean;
  isRoiSelectionMode: boolean;
  isSettingBottomLine: boolean;
  isPanning: boolean;

  // Drawing state
  isDrawing: boolean;
  drawingBox: DrawingBox | null;

  // Selection state
  isSelecting: boolean;
  selectionRect: SelectionRect | null;

  // Mode setters
  setMode: (mode: DrawingMode) => void;
  toggleAnnotationMode: () => void;
  toggleRoiSelectionMode: () => void;
  toggleBottomLineMode: () => void;
  enablePanning: () => void;
  disablePanning: () => void;
  resetMode: () => void;

  // Drawing operations
  startDrawing: (position: Point) => void;
  updateDrawing: (position: Point) => void;
  endDrawing: () => Rectangle | null;
  cancelDrawing: () => void;

  // Selection operations
  startSelection: (position: Point) => void;
  updateSelection: (position: Point) => void;
  endSelection: () => Rectangle | null;
  cancelSelection: () => void;
}

export function useDrawingMode(
  options: UseDrawingModeOptions = {}
): DrawingModeReturn {
  const { onModeChange } = options;

  const [mode, setModeState] = useState<DrawingMode>('none');
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingBox, setDrawingBox] = useState<Rectangle | null>(null);
  const [drawingStart, setDrawingStart] = useState<Point | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState<Rectangle | null>(null);
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);

  // Mode setters
  const setMode = useCallback((newMode: DrawingMode) => {
    setModeState(prev => {
      if (prev !== newMode && onModeChange) {
        onModeChange(newMode, prev);
      }
      // Clear any active drawing/selection when changing modes
      setIsDrawing(false);
      setDrawingBox(null);
      setDrawingStart(null);
      setIsSelecting(false);
      setSelectionRect(null);
      setSelectionStart(null);
      return newMode;
    });
  }, [onModeChange]);

  const toggleAnnotationMode = useCallback(() => {
    setMode(mode === 'annotation' ? 'none' : 'annotation');
  }, [mode, setMode]);

  const toggleRoiSelectionMode = useCallback(() => {
    setMode(mode === 'roi_selection' ? 'none' : 'roi_selection');
  }, [mode, setMode]);

  const toggleBottomLineMode = useCallback(() => {
    setMode(mode === 'bottom_line' ? 'none' : 'bottom_line');
  }, [mode, setMode]);

  const enablePanning = useCallback(() => {
    setMode('panning');
  }, [setMode]);

  const disablePanning = useCallback(() => {
    if (mode === 'panning') {
      setMode('none');
    }
  }, [mode, setMode]);

  const resetMode = useCallback(() => {
    setMode('none');
  }, [setMode]);

  // Drawing operations
  const startDrawing = useCallback((position: Point) => {
    if (mode !== 'annotation') return;
    setIsDrawing(true);
    setDrawingStart(position);
    setDrawingBox({ x: position.x, y: position.y, width: 0, height: 0 });
  }, [mode]);

  const updateDrawing = useCallback((position: Point) => {
    if (!isDrawing || !drawingStart) return;
    setDrawingBox(calculateRectangle(drawingStart, position));
  }, [isDrawing, drawingStart]);

  const endDrawing = useCallback((): Rectangle | null => {
    const result = drawingBox;
    setIsDrawing(false);
    setDrawingBox(null);
    setDrawingStart(null);
    return result;
  }, [drawingBox]);

  const cancelDrawing = useCallback(() => {
    setIsDrawing(false);
    setDrawingBox(null);
    setDrawingStart(null);
  }, []);

  // Selection operations
  const startSelection = useCallback((position: Point) => {
    if (mode !== 'roi_selection') return;
    setIsSelecting(true);
    setSelectionStart(position);
    setSelectionRect({ x: position.x, y: position.y, width: 0, height: 0 });
  }, [mode]);

  const updateSelection = useCallback((position: Point) => {
    if (!isSelecting || !selectionStart) return;
    setSelectionRect(calculateRectangle(selectionStart, position));
  }, [isSelecting, selectionStart]);

  const endSelection = useCallback((): Rectangle | null => {
    const result = selectionRect;
    setIsSelecting(false);
    setSelectionRect(null);
    setSelectionStart(null);
    return result;
  }, [selectionRect]);

  const cancelSelection = useCallback(() => {
    setIsSelecting(false);
    setSelectionRect(null);
    setSelectionStart(null);
  }, []);

  // Convenience mode checks
  const isAnnotationMode = mode === 'annotation';
  const isRoiSelectionMode = mode === 'roi_selection';
  const isSettingBottomLine = mode === 'bottom_line';
  const isPanning = mode === 'panning';

  return {
    mode,
    isAnnotationMode,
    isRoiSelectionMode,
    isSettingBottomLine,
    isPanning,
    isDrawing,
    drawingBox,
    isSelecting,
    selectionRect,
    setMode,
    toggleAnnotationMode,
    toggleRoiSelectionMode,
    toggleBottomLineMode,
    enablePanning,
    disablePanning,
    resetMode,
    startDrawing,
    updateDrawing,
    endDrawing,
    cancelDrawing,
    startSelection,
    updateSelection,
    endSelection,
    cancelSelection,
  };
}

export default useDrawingMode;
