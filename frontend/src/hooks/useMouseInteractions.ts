/**
 * Custom hook for managing mouse interactions in the annotation editor
 * Provides centralized mouse event handling with consistent coordinate transformations
 */

import { useState, useCallback, useRef } from "react";
import { CoordinateUtils } from "../utils/coordinates";
import { getNearestBoxEdge, isPointInBox } from "../utils/annotationUtils";
import { BoundingBox } from "../types";

export interface MouseState {
  position: { x: number; y: number };
  isDown: boolean;
  isDragging: boolean;
  isSelecting: boolean;
  isDrawing: boolean;
  isPanning: boolean;
  dragStartPos: { x: number; y: number } | null;
  hoveredBoxIndex: number | null;
  hoveredHandle: { boxIndex: number; handle: string } | null;
}

export interface MouseInteractionConfig {
  scrollOffset: number;
  zoomLevel: number;
  spectrogramDimensions: { width: number; height: number };
  isAnnotationMode: boolean;
  boundingBoxes: BoundingBox[];
  handleThreshold?: number;
}

export interface MouseEventHandlers {
  onDrawStart: (pos: { x: number; y: number }) => void;
  onDrawMove: (pos: { x: number; y: number }) => void;
  onDrawEnd: (pos: { x: number; y: number }) => void;
  onBoxSelect: (index: number, multiSelect: boolean) => void;
  onBoxDragStart: (index: number, pos: { x: number; y: number }) => void;
  onBoxDragMove: (index: number, delta: { x: number; y: number }) => void;
  onBoxDragEnd: () => void;
  onBoxResizeStart: (index: number, handle: string) => void;
  onBoxResizeMove: (
    index: number,
    handle: string,
    delta: { x: number; y: number },
  ) => void;
  onBoxResizeEnd: () => void;
  onSelectionStart: (pos: { x: number; y: number }) => void;
  onSelectionMove: (pos: { x: number; y: number }) => void;
  onSelectionEnd: (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
  onPanStart: (pos: { x: number; y: number }) => void;
  onPanMove: (delta: { x: number; y: number }) => void;
  onPanEnd: () => void;
  onSeek: (position: number) => void;
  onContextMenu: (pos: { x: number; y: number }, boxIndex?: number) => void;
}

export function useMouseInteractions(
  config: MouseInteractionConfig,
  handlers: Partial<MouseEventHandlers>,
) {
  const [mouseState, setMouseState] = useState<MouseState>({
    position: { x: 0, y: 0 },
    isDown: false,
    isDragging: false,
    isSelecting: false,
    isDrawing: false,
    isPanning: false,
    dragStartPos: null,
    hoveredBoxIndex: null,
    hoveredHandle: null,
  });

  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragModeRef = useRef<
    "draw" | "select" | "drag" | "resize" | "pan" | null
  >(null);
  const activeBoxIndexRef = useRef<number | null>(null);
  const activeHandleRef = useRef<string | null>(null);

  /**
   * Convert stage coordinates to world coordinates
   */
  const stageToWorld = useCallback(
    (stagePoint: { x: number; y: number }) => {
      return CoordinateUtils.stageToWorldCoordinates(
        stagePoint,
        config.scrollOffset,
        config.zoomLevel,
        config.spectrogramDimensions,
      );
    },
    [config.scrollOffset, config.zoomLevel, config.spectrogramDimensions],
  );

  /**
   * Get seek position from mouse coordinates
   */
  const getSeekPosition = useCallback(
    (stagePoint: { x: number; y: number }) => {
      const absolutePos = CoordinateUtils.getAbsoluteScreenPosition(
        stagePoint,
        config.scrollOffset,
      );
      const effectiveWidth = CoordinateUtils.getEffectiveWidth(
        config.spectrogramDimensions.width,
      );
      return CoordinateUtils.getSeekPosition(
        absolutePos.x,
        effectiveWidth,
        config.zoomLevel,
      );
    },
    [config.scrollOffset, config.zoomLevel, config.spectrogramDimensions],
  );

  /**
   * Check if mouse is over a bounding box or its handles
   */
  const checkHover = useCallback(
    (worldPos: { x: number; y: number }) => {
      const handleThreshold = config.handleThreshold ?? 8;

      // Check each box from top to bottom (reverse order for z-index)
      for (let i = config.boundingBoxes.length - 1; i >= 0; i--) {
        const box = config.boundingBoxes[i];

        // Check handles first
        const nearEdge = getNearestBoxEdge(worldPos, box, handleThreshold);
        if (nearEdge) {
          return {
            boxIndex: i,
            handle: nearEdge,
            isHandle: true,
          };
        }

        // Check if inside box
        if (isPointInBox(worldPos, box)) {
          return {
            boxIndex: i,
            handle: null,
            isHandle: false,
          };
        }
      }

      return null;
    },
    [config.boundingBoxes, config.handleThreshold],
  );

  /**
   * Handle mouse down event
   */
  const handleMouseDown = useCallback(
    (event: any) => {
      const point = event.target.getStage()?.getPointerPosition();
      if (!point) return;

      const worldPos = stageToWorld(point);
      const hoverInfo = checkHover(worldPos);

      setMouseState((prev) => ({
        ...prev,
        isDown: true,
        dragStartPos: worldPos,
      }));

      lastMousePosRef.current = worldPos;

      // Handle different interaction modes
      if (event.shiftKey || event.metaKey) {
        // Pan mode
        dragModeRef.current = "pan";
        handlers.onPanStart?.(worldPos);
      } else if (hoverInfo) {
        if (hoverInfo.isHandle && hoverInfo.handle) {
          // Resize mode
          dragModeRef.current = "resize";
          activeBoxIndexRef.current = hoverInfo.boxIndex;
          activeHandleRef.current = hoverInfo.handle;
          handlers.onBoxResizeStart?.(hoverInfo.boxIndex, hoverInfo.handle);
        } else {
          // Drag or select mode
          dragModeRef.current = "drag";
          activeBoxIndexRef.current = hoverInfo.boxIndex;
          const multiSelect = event.ctrlKey || event.metaKey;
          handlers.onBoxSelect?.(hoverInfo.boxIndex, multiSelect);
          handlers.onBoxDragStart?.(hoverInfo.boxIndex, worldPos);
        }
      } else if (config.isAnnotationMode) {
        // Drawing mode
        dragModeRef.current = "draw";
        handlers.onDrawStart?.(worldPos);
        setMouseState((prev) => ({ ...prev, isDrawing: true }));
      } else {
        // Selection mode
        dragModeRef.current = "select";
        handlers.onSelectionStart?.(worldPos);
        setMouseState((prev) => ({ ...prev, isSelecting: true }));
      }

      // Handle seeking (if not in annotation mode and not over a box)
      if (!config.isAnnotationMode && !hoverInfo) {
        const seekPos = getSeekPosition(point);
        handlers.onSeek?.(seekPos);
      }
    },
    [
      stageToWorld,
      checkHover,
      config.isAnnotationMode,
      getSeekPosition,
      handlers,
    ],
  );

  /**
   * Handle mouse move event
   */
  const handleMouseMove = useCallback(
    (event: any) => {
      const point = event.target.getStage()?.getPointerPosition();
      if (!point) return;

      const worldPos = stageToWorld(point);
      const delta = {
        x: worldPos.x - lastMousePosRef.current.x,
        y: worldPos.y - lastMousePosRef.current.y,
      };

      setMouseState((prev) => ({ ...prev, position: worldPos }));

      // Update hover state when not dragging
      if (!mouseState.isDown) {
        const hoverInfo = checkHover(worldPos);
        setMouseState((prev) => ({
          ...prev,
          hoveredBoxIndex: hoverInfo?.boxIndex ?? null,
          hoveredHandle:
            hoverInfo?.isHandle && hoverInfo.handle
              ? { boxIndex: hoverInfo.boxIndex, handle: hoverInfo.handle }
              : null,
        }));
      }

      // Handle drag operations
      if (mouseState.isDown && dragModeRef.current) {
        setMouseState((prev) => ({ ...prev, isDragging: true }));

        switch (dragModeRef.current) {
          case "draw":
            handlers.onDrawMove?.(worldPos);
            break;
          case "select":
            handlers.onSelectionMove?.(worldPos);
            break;
          case "drag":
            if (activeBoxIndexRef.current !== null) {
              handlers.onBoxDragMove?.(activeBoxIndexRef.current, delta);
            }
            break;
          case "resize":
            if (activeBoxIndexRef.current !== null && activeHandleRef.current) {
              handlers.onBoxResizeMove?.(
                activeBoxIndexRef.current,
                activeHandleRef.current,
                delta,
              );
            }
            break;
          case "pan":
            handlers.onPanMove?.(delta);
            break;
        }
      }

      lastMousePosRef.current = worldPos;
    },
    [stageToWorld, checkHover, mouseState.isDown, handlers],
  );

  /**
   * Handle mouse up event
   */
  const handleMouseUp = useCallback(
    (event: any) => {
      const point = event.target.getStage()?.getPointerPosition();
      if (!point) return;

      const worldPos = stageToWorld(point);

      // Complete drag operations
      if (dragModeRef.current && mouseState.dragStartPos) {
        switch (dragModeRef.current) {
          case "draw":
            handlers.onDrawEnd?.(worldPos);
            break;
          case "select":
            if (mouseState.dragStartPos) {
              const rect = {
                x: Math.min(mouseState.dragStartPos.x, worldPos.x),
                y: Math.min(mouseState.dragStartPos.y, worldPos.y),
                width: Math.abs(worldPos.x - mouseState.dragStartPos.x),
                height: Math.abs(worldPos.y - mouseState.dragStartPos.y),
              };
              handlers.onSelectionEnd?.(rect);
            }
            break;
          case "drag":
            handlers.onBoxDragEnd?.();
            break;
          case "resize":
            handlers.onBoxResizeEnd?.();
            break;
          case "pan":
            handlers.onPanEnd?.();
            break;
        }
      }

      // Reset state
      setMouseState((prev) => ({
        ...prev,
        isDown: false,
        isDragging: false,
        isSelecting: false,
        isDrawing: false,
        isPanning: false,
        dragStartPos: null,
      }));

      dragModeRef.current = null;
      activeBoxIndexRef.current = null;
      activeHandleRef.current = null;
    },
    [stageToWorld, mouseState.dragStartPos, handlers],
  );

  /**
   * Handle context menu event
   */
  const handleContextMenu = useCallback(
    (event: any) => {
      event.evt.preventDefault();

      const point = event.target.getStage()?.getPointerPosition();
      if (!point) return;

      const worldPos = stageToWorld(point);
      const hoverInfo = checkHover(worldPos);

      handlers.onContextMenu?.(
        { x: event.evt.clientX, y: event.evt.clientY },
        hoverInfo?.boxIndex,
      );
    },
    [stageToWorld, checkHover, handlers],
  );

  /**
   * Handle double click event
   */
  const handleDoubleClick = useCallback(
    (event: any) => {
      const point = event.target.getStage()?.getPointerPosition();
      if (!point) return;

      const seekPos = getSeekPosition(point);
      handlers.onSeek?.(seekPos);
    },
    [getSeekPosition, handlers],
  );

  /**
   * Get cursor style based on current hover state
   */
  const getCursorStyle = useCallback(() => {
    if (mouseState.isPanning) return "grabbing";
    if (mouseState.isDrawing) return "crosshair";
    if (mouseState.isSelecting) return "crosshair";

    if (mouseState.hoveredHandle) {
      const handle = mouseState.hoveredHandle.handle;
      if (handle.includes("left") && handle.includes("top")) return "nw-resize";
      if (handle.includes("right") && handle.includes("top"))
        return "ne-resize";
      if (handle.includes("left") && handle.includes("bottom"))
        return "sw-resize";
      if (handle.includes("right") && handle.includes("bottom"))
        return "se-resize";
      if (handle === "left" || handle === "right") return "ew-resize";
      if (handle === "top" || handle === "bottom") return "ns-resize";
    }

    if (mouseState.hoveredBoxIndex !== null) return "move";
    if (config.isAnnotationMode) return "crosshair";

    return "default";
  }, [mouseState, config.isAnnotationMode]);

  return {
    mouseState,
    handlers: {
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onContextMenu: handleContextMenu,
      onDoubleClick: handleDoubleClick,
    },
    getCursorStyle,
  };
}

export default useMouseInteractions;
