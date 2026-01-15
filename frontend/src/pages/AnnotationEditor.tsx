import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeftIcon,
  PlayIcon,
  PauseIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowsPointingOutIcon,
  QuestionMarkCircleIcon,
  CursorArrowRaysIcon,
  MinusIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/solid";
import toast from "react-hot-toast";
import WaveSurfer from "wavesurfer.js";
import { Stage, Layer, Rect, Line, Circle, Group, Text } from "react-konva";
import Konva from "konva";
import { recordingService, annotationService } from "../services/api";
import { Recording, BoundingBox } from "../types";
import { notification, Messages } from "../lib/notifications";
import BoundingBoxList from "../components/BoundingBoxList";
import LabelModal from "../components/LabelModal";
import ContextMenu from "../components/ContextMenu";
import SpectrogramScales from "../components/SpectrogramScales";
import LoadingSpinner from "../components/LoadingSpinner";
import KeyboardShortcutsModal from "../components/KeyboardShortcutsModal";
import BottomLineModal from "../components/BottomLineModal";
import ConflictWarningModal from "../components/ConflictWarningModal";
import ContrastModal from "../components/ContrastModal";
import OptimizedWaveform, { OptimizedWaveformHandle } from "../components/OptimizedWaveform";
import { CoordinateUtils, LAYOUT_CONSTANTS } from "../utils/coordinates";
import {
  calculateTemporalDistance,
  findNearestBox,
  isPointInBox,
  boxArraysChanged,
} from "../utils/annotationUtils";
import {
  AXIS_STYLES,
  formatTimeLabel,
  getTimeTickInterval,
} from "../utils/axisStyles";
import { useAutosave } from "../hooks/useAutosave";
import { useMouseCoordinates } from "../hooks/useMouseCoordinates";
import { useBoundingBoxTimeFrequency } from "../hooks/useBoundingBoxTimeFrequency";
import { useBottomLine } from "../hooks/useBottomLine";
import { useNavigationGuard } from "../hooks/useNavigationGuard";
import { useModalManager } from "../hooks/useModalManager";
import { useDrawingMode } from "../hooks/useDrawingMode";
import { useConflictDetection } from "../hooks/useConflictDetection";
import { ANNOTATION_CONSTANTS, LABEL_COLORS } from "../utils/constants";
import {
  detectAllConflicts,
  resolveAllConflicts,
  UnifiedConflict,
} from "../utils/conflictDetection";
import { throttle } from "lodash";

// PERF: Limit pixel ratio for better performance on high-DPI displays
// On retina displays, Konva automatically doubles canvas size which causes lag at high zoom
// Limiting to 1.5 provides good balance between quality and performance
const OPTIMIZED_PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 1.5);
Konva.pixelRatio = OPTIMIZED_PIXEL_RATIO;

/**
 * Type definition for distance measurement visualization
 * Used when Alt key is pressed and hovering over boxes
 * Uses bracket notation (Figma-style) to show temporal distance
 */
interface DistanceMeasurement {
  distanceMs: number;
  leftBracket: { x: number; yTop: number; yBottom: number };
  rightBracket: { x: number; yTop: number; yBottom: number };
  horizontalLineY: number;
}

const { PLAYBACK_SPEEDS, MAX_HISTORY_SIZE } = ANNOTATION_CONSTANTS;

// Utility function to format timestamps
const formatTimestamp = (date: Date): string => {
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
};

const AnnotationEditor: React.FC = () => {
  const { recordingId } = useParams<{ recordingId: string }>();
  const navigate = useNavigate();

  const [recording, setRecording] = useState<Recording | null>(null);
  const [projectRecordings, setProjectRecordings] = useState<Recording[]>([]);
  const [totalProjectRecordings, setTotalProjectRecordings] =
    useState<number>(0);
  const [currentRecordingIndex, setCurrentRecordingIndex] = useState<number>(0);
  const [spectrogramUrl, setSpectrogramUrl] = useState<string>("");
  const [spectrogramStatus, setSpectrogramStatus] =
    useState<string>("not_started");
  const [spectrogramError, setSpectrogramError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [spectrogramAvailable, setSpectrogramAvailable] =
    useState<boolean>(false);
  const [isLoadingSpectrogram, setIsLoadingSpectrogram] =
    useState<boolean>(false);
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [selectedBox, setSelectedBox] = useState<BoundingBox | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [tempBox, setTempBox] = useState<BoundingBox | null>(null);
  const [spectrogramDimensions, setSpectrogramDimensions] = useState({
    width: 800,
    height: 400,
  });
  // Fixed base dimensions for spectrogram (won't change on window resize)
  const [baseSpectrogramDimensions, setBaseSpectrogramDimensions] = useState({
    width: 800,
    height: 400,
  });
  const [sortMode, setSortMode] = useState<"time" | "alphabetical">("time");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [verticalScrollOffset, setVerticalScrollOffset] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentSpeedIndex, setCurrentSpeedIndex] = useState(0);
  const [isRewindingLeft, setIsRewindingLeft] = useState(false);
  const [isRewindingRight, setIsRewindingRight] = useState(false);
  const [selectedBoxes, setSelectedBoxes] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    boxIndex?: number;
  } | null>(null);
  const [annotationModeContextMenu, setAnnotationModeContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [defaultLabel, setDefaultLabel] = useState<string | null>(null);
  const [lastUsedLabel, setLastUsedLabel] = useState<string | null>(null);
  const [defaultLabelInput, setDefaultLabelInput] = useState("");
  const [clipboardBox, setClipboardBox] = useState<
    BoundingBox | BoundingBox[] | null
  >(null);
  const [hoveredHandle, setHoveredHandle] = useState<{
    boxIndex: number;
    handle: string;
  } | null>(null);
  const [draggingBox, setDraggingBox] = useState<{
    index: number;
    initialBox: BoundingBox;
    dragOffset: { x: number; y: number };
    selectedIndices?: Set<number>;
    initialPositions?: Map<number, { x: number; y: number }>;
  } | null>(null);
  // Performance optimization: Use ref for mouse position to avoid re-renders
  // Only update state when needed for cursor changes (throttled)
  const mousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [resizingBox, setResizingBox] = useState<{
    index: number;
    handle: string;
  } | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isDuringDragOperation, setIsDuringDragOperation] =
    useState<boolean>(false);
  const [preOperationState, setPreOperationState] = useState<
    BoundingBox[] | null
  >(null);
  const [labelColorMap, setLabelColorMap] = useState<Map<string, number>>(
    new Map([["None", 0]]),
  );
  const [history, setHistory] = useState<BoundingBox[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [lastSavedState, setLastSavedState] = useState<BoundingBox[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [visibleBoundingBoxes, setVisibleBoundingBoxes] = useState<
    BoundingBox[]
  >([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [fps, setFps] = useState(0);
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [annotationId, setAnnotationId] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [zoomOffset, setZoomOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  // PERF: Track active zooming to hide labels during zoom for smoother rendering
  const [isActivelyZooming, setIsActivelyZooming] = useState<boolean>(false);
  const zoomDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const [zoomInputValue, setZoomInputValue] = useState<string>("");
  const [scrollOffset, setScrollOffset] = useState<number>(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [segmentDuration, setSegmentDuration] = useState<number | null>(null);
  const [timelineCursorPosition, setTimelineCursorPosition] =
    useState<number>(0);
  const [customLabelInput, setCustomLabelInput] = useState<string>("");
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const [lastClickedBox, setLastClickedBox] = useState<number | null>(null);
  const [panStartPos, setPanStartPos] = useState<{
    x: number;
    scrollX: number;
    y?: number;
    scrollY?: number;
  } | null>(null);
  const [contrast, setContrast] = useState<number>(1.0);
  const [isDraggingBottomLine, setIsDraggingBottomLine] = useState<boolean>(false);

  // Distance measurement state (Alt key feature)
  const [isAltKeyPressed, setIsAltKeyPressed] = useState<boolean>(false);
  const [hoveredBoxIndex, setHoveredBoxIndex] = useState<number | null>(null);

  const rewindIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wasPlayingRef = useRef<boolean>(false);

  // Performance: RAF for drag operations to limit update frequency
  const dragRAFRef = useRef<number | null>(null);
  const pendingDragUpdateRef = useRef<{
    boxes: BoundingBox[];
    selectedBox?: BoundingBox | null;
  } | null>(null);

  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const optimizedWaveformRef = useRef<OptimizedWaveformHandle>(null);
  const stageRef = useRef<any>(null);
  const spectrogramImgRef = useRef<HTMLImageElement>(null);
  const audioUrlRef = useRef<string | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const unifiedScrollRef = useRef<HTMLDivElement>(null);

  // PERF: Use optimized waveform rendering to avoid 4096px canvas limit
  const useOptimizedWaveform = true;
  const [viewportWidth, setViewportWidth] = useState(800);
  // State to track audio URL for OptimizedWaveform (ref doesn't trigger re-render)
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Viewport culling for performance optimization
  const calculateVisibleBounds = useCallback(() => {
    const container = unifiedScrollRef.current;
    if (!container) return { left: 0, right: 1000, top: 0, bottom: 1000 };

    // Get actual scroll position from the container
    const scrollLeft = container.scrollLeft;
    const containerWidth = container.clientWidth;

    // Convert to world coordinates (unzoomed space)
    const viewportLeft = scrollLeft / zoomLevel;
    const viewportRight = (scrollLeft + containerWidth) / zoomLevel;

    return {
      left: Math.max(0, viewportLeft - 50), // Add 50px buffer
      right: viewportRight + 50,
      top: 0,
      bottom: spectrogramDimensions.height,
    };
  }, [zoomLevel, spectrogramDimensions.height]);

  // Update visible boxes when viewport or boxes change
  // PERF: Now also updates during drag/resize for smoother rendering
  // The filtering is O(n) but faster than rendering all boxes
  useEffect(() => {
    const bounds = calculateVisibleBounds();
    const visible = boundingBoxes.filter((box) => {
      // Check if box intersects with viewport
      return (
        box.x < bounds.right &&
        box.x + box.width > bounds.left &&
        box.y < bounds.bottom &&
        box.y + box.height > bounds.top
      );
    });
    setVisibleBoundingBoxes(visible);
  }, [boundingBoxes, calculateVisibleBounds]);

  // Get Nyquist frequency (sample_rate / 2) or fallback to 22050 Hz
  const getNyquistFrequency = useCallback(() => {
    return recording?.sample_rate ? recording.sample_rate / 2 : 22050;
  }, [recording?.sample_rate]);

  // Calculate dynamic max zoom level based on recording duration
  // Longer recordings allow higher zoom for detailed annotation
  // Formula: maxZoom = max(MIN_MAX_ZOOM, duration / DIVISOR)
  const maxZoomLevel = useMemo(() => {
    const { DIVISOR, MIN_MAX_ZOOM, MAX_MAX_ZOOM, DEFAULT_MAX_ZOOM } =
      ANNOTATION_CONSTANTS.ZOOM;
    if (duration <= 0) return DEFAULT_MAX_ZOOM;
    const calculated = duration / DIVISOR;
    return Math.min(MAX_MAX_ZOOM, Math.max(MIN_MAX_ZOOM, calculated));
  }, [duration]);

  // Initialize custom hooks for coordinate transformations and time/frequency conversions
  const { transformMousePoint, clampSeekPosition, getMaxWorldX } =
    useMouseCoordinates(spectrogramDimensions, scrollOffset, zoomLevel);

  const {
    convertBoxToTimeFrequency,
    convertNormalizedBoxToTimeFrequency,
    getMaxSpectrogramY,
  } = useBoundingBoxTimeFrequency(
    baseSpectrogramDimensions,  // Use base dimensions for consistent time calculations
    duration,
    getNyquistFrequency,
  );

  // Bottom line (frequency boundary) management
  const {
    bottomLine,
    isSettingBottomLine,
    setIsSettingBottomLine,
    setBottomLineAtPixel,
    setBottomLineAtFrequency,
    clearBottomLine,
  } = useBottomLine();

  // Navigation guard - block navigation when conflicts exist
  const {
    showConflictModal,
    conflicts: navigationConflicts,
    proceedNavigation,
    cancelNavigation,
  } = useNavigationGuard({
    boundingBoxes,
    enabled: true,
  });

  // Centralized modal state management
  const modals = useModalManager();

  // Drawing mode state machine
  const drawingMode = useDrawingMode();

  // Conflict detection and resolution
  const conflictDetection = useConflictDetection();

  // Backward-compatible aliases for modal states
  const showLabelModal = modals.isOpen('label');
  const setShowLabelModal = useCallback((show: boolean) => show ? modals.open('label') : modals.close('label'), [modals]);
  const showSidebar = modals.isOpen('sidebar');
  const setShowSidebar = useCallback((show: boolean) => show ? modals.open('sidebar') : modals.close('sidebar'), [modals]);
  const showDefaultLabelInput = modals.isOpen('defaultLabelInput');
  const setShowDefaultLabelInput = useCallback((show: boolean) => show ? modals.open('defaultLabelInput') : modals.close('defaultLabelInput'), [modals]);
  const showCustomLabelInput = modals.isOpen('customLabelInput');
  const setShowCustomLabelInput = useCallback((show: boolean) => show ? modals.open('customLabelInput') : modals.close('customLabelInput'), [modals]);
  const showKeyboardShortcuts = modals.isOpen('keyboardShortcuts');
  const setShowKeyboardShortcuts = useCallback((show: boolean) => show ? modals.open('keyboardShortcuts') : modals.close('keyboardShortcuts'), [modals]);
  const showBottomLineModal = modals.isOpen('bottomLine');
  const setShowBottomLineModal = useCallback((show: boolean) => show ? modals.open('bottomLine') : modals.close('bottomLine'), [modals]);
  const showContrastModal = modals.isOpen('contrast');
  const setShowContrastModal = useCallback((show: boolean) => show ? modals.open('contrast') : modals.close('contrast'), [modals]);
  const isEditingZoom = modals.isOpen('zoomInput');
  const setIsEditingZoom = useCallback((editing: boolean) => editing ? modals.open('zoomInput') : modals.close('zoomInput'), [modals]);

  // Backward-compatible aliases for drawing mode states
  const isAnnotationMode = drawingMode.isAnnotationMode;
  const setIsAnnotationMode = useCallback((enabled: boolean) => {
    if (enabled) drawingMode.setMode('annotation');
    else if (drawingMode.mode === 'annotation') drawingMode.setMode('none');
  }, [drawingMode]);
  const isRoiSelectionMode = drawingMode.isRoiSelectionMode;
  const setIsRoiSelectionMode = useCallback((enabled: boolean) => {
    if (enabled) drawingMode.setMode('roi_selection');
    else if (drawingMode.mode === 'roi_selection') drawingMode.setMode('none');
  }, [drawingMode]);
  const isPanning = drawingMode.isPanning;
  const setIsPanning = useCallback((enabled: boolean) => {
    if (enabled) drawingMode.enablePanning();
    else drawingMode.disablePanning();
  }, [drawingMode]);
  const isDrawing = drawingMode.isDrawing;
  const drawingBox = drawingMode.drawingBox;
  const setIsDrawing = useCallback((drawing: boolean) => {
    if (!drawing) drawingMode.cancelDrawing();
  }, [drawingMode]);
  const setDrawingBox = useCallback((_box: { x: number; y: number; width: number; height: number } | null) => {
    // Drawing box is managed by startDrawing/updateDrawing/endDrawing
    // This setter is kept for compatibility but has limited use
  }, []);
  const isSelecting = drawingMode.isSelecting;
  const selectionRect = drawingMode.selectionRect;
  const setIsSelecting = useCallback((selecting: boolean) => {
    if (!selecting) drawingMode.cancelSelection();
  }, [drawingMode]);
  const setSelectionRect = useCallback((_rect: { x: number; y: number; width: number; height: number } | null) => {
    // Selection rect is managed by startSelection/updateSelection/endSelection
    // This setter is kept for compatibility but has limited use
  }, []);

  // Backward-compatible aliases for conflict detection states
  const conflicts = conflictDetection.conflicts;
  const setConflicts = conflictDetection.setConflicts;
  const highlightConflicts = conflictDetection.highlightConflicts;
  const setHighlightConflicts = conflictDetection.setHighlightConflicts;

  // Memoized sorted bounding boxes with original indices preserved
  const sortedBoundingBoxes = useMemo(() => {
    // First, add original index to each box
    const boxesWithIndex = boundingBoxes.map((box, index) => ({
      ...box,
      _originalIndex: index,
    }));

    if (sortMode === "alphabetical") {
      return boxesWithIndex.sort((a, b) => {
        const labelA = (a.label || "None").toLowerCase();
        const labelB = (b.label || "None").toLowerCase();
        return labelA.localeCompare(labelB);
      });
    } else {
      // Sort by time (start_time)
      return boxesWithIndex.sort((a, b) => {
        return (a.start_time || 0) - (b.start_time || 0);
      });
    }
  }, [boundingBoxes, sortMode]);

  // Memoize color calculations for performance
  const getLabelColorMemoized = useMemo(() => {
    const cache = new Map<string, { stroke: string; fill: string }>();
    return (label: string) => {
      if (!cache.has(label)) {
        const colorIndex = labelColorMap.get(label) || 0;
        cache.set(label, LABEL_COLORS[colorIndex % LABEL_COLORS.length]);
      }
      return cache.get(label)!;
    };
  }, [labelColorMap]);

  // PERF: Create index lookup map for O(1) instead of O(n) findIndex/indexOf
  const boxIndexMap = useMemo(() => {
    const map = new Map<BoundingBox, number>();
    boundingBoxes.forEach((box, index) => {
      map.set(box, index);
    });
    return map;
  }, [boundingBoxes]);

  // PERF: Create Set of conflicting box indices for O(1) lookup instead of O(n*m) per render
  const conflictingBoxIndices = useMemo(() => {
    if (!highlightConflicts || conflicts.length === 0) {
      return new Set<number>();
    }
    const indices = new Set<number>();
    conflicts.forEach((c) => {
      indices.add(c.box1Index);
      indices.add(c.box2Index);
    });
    return indices;
  }, [conflicts, highlightConflicts]);

  // Memoize coordinate transformations - horizontal zoom only
  const transformedBoxes = useMemo(
    () =>
      visibleBoundingBoxes.map((box) => {
        const screenCoords = CoordinateUtils.transformBoxToScreen(
          box,
          zoomLevel,
        );
        // PERF: Use O(1) map lookup instead of O(n) findIndex
        const originalIndex = boxIndexMap.get(box) ?? -1;
        // PERF: Pre-calculate label width to avoid computation in render loop
        const label = box.label || "None";
        const labelWidth = Math.max(45, label.length * 8 + 8);
        return {
          ...box,
          ...screenCoords,
          color: getLabelColorMemoized(label),
          originalIndex, // Store the original index for later use
          labelWidth, // Pre-calculated label width for performance
        };
      }),
    [visibleBoundingBoxes, boxIndexMap, zoomLevel, getLabelColorMemoized],
  );

  // Calculate distance measurement when Alt is pressed and hovering over a box
  const distanceMeasurement = useMemo<DistanceMeasurement | null>(() => {
    // Early exit if conditions not met
    if (
      !isAltKeyPressed ||
      isAnnotationMode ||
      hoveredBoxIndex === null ||
      selectedBoxes.size === 0
    ) {
      return null;
    }

    const hoveredBox = boundingBoxes[hoveredBoxIndex];
    if (!hoveredBox) return null;

    // Get selected boxes as array, excluding the hovered box itself
    const selectedBoxArray = Array.from(selectedBoxes)
      .filter((idx) => idx !== hoveredBoxIndex)
      .map((idx) => boundingBoxes[idx])
      .filter(Boolean);

    // If no other selected boxes (hoveredBox is the only selected one), don't show measurement
    if (selectedBoxArray.length === 0) return null;

    // Find nearest selected box (prioritizes temporal distance)
    const nearestBox = findNearestBox(hoveredBox, selectedBoxArray);
    if (!nearestBox) return null;

    // Calculate temporal distance
    const distanceMs = calculateTemporalDistance(nearestBox, hoveredBox);

    // If boxes overlap (null distance), don't show measurement
    if (distanceMs === null) return null;

    // Determine temporal order (which box comes first in time)
    const box1ComesFirst = nearestBox.end_time <= hoveredBox.start_time;
    const leftBox = box1ComesFirst ? nearestBox : hoveredBox;
    const rightBox = box1ComesFirst ? hoveredBox : nearestBox;

    // Calculate bracket positions at temporal edges
    // Left bracket: at the right edge of the left box
    const leftBracketX = leftBox.x + leftBox.width;
    // Right bracket: at the left edge of the right box
    const rightBracketX = rightBox.x;

    // Vertical lines extend from the top of the higher box to the bottom of the lower box
    // This ensures the lines visually connect both boxes completely
    const minY = Math.min(leftBox.y, rightBox.y);
    const maxY = Math.max(leftBox.y + leftBox.height, rightBox.y + rightBox.height);
    const bracketTop = minY;
    const bracketBottom = maxY;

    // Horizontal line at the middle of the extended range
    const horizontalLineY = (bracketTop + bracketBottom) / 2;

    return {
      distanceMs, // Already positive, no need for Math.abs()
      leftBracket: {
        x: leftBracketX,
        yTop: bracketTop,
        yBottom: bracketBottom,
      },
      rightBracket: {
        x: rightBracketX,
        yTop: bracketTop,
        yBottom: bracketBottom,
      },
      horizontalLineY,
    };
  }, [
    isAltKeyPressed,
    isAnnotationMode,
    hoveredBoxIndex,
    selectedBoxes,
    boundingBoxes,
  ]);

  // FPS monitoring for development
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    let frameCount = 0;
    let lastTime = performance.now();
    let animationId: number;

    const measureFPS = () => {
      frameCount++;
      const currentTime = performance.now();

      if (currentTime >= lastTime + 1000) {
        setFps(Math.round((frameCount * 1000) / (currentTime - lastTime)));
        frameCount = 0;
        lastTime = currentTime;
      }

      animationId = requestAnimationFrame(measureFPS);
    };

    animationId = requestAnimationFrame(measureFPS);

    return () => cancelAnimationFrame(animationId);
  }, []);

  // History management functions
  const addToHistory = useCallback(
    (newBoxes: BoundingBox[]) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push([...newBoxes]);

      // Keep history size limited
      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
      } else {
        setHistoryIndex(historyIndex + 1);
      }

      setHistory(newHistory);
    },
    [history, historyIndex],
  );

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setBoundingBoxes([...history[newIndex]]);
      setHistoryIndex(newIndex);
      setHasUnsavedChanges(true);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setBoundingBoxes([...history[newIndex]]);
      setHistoryIndex(newIndex);
      setHasUnsavedChanges(true);
    }
  }, [history, historyIndex]);

  // Enhanced save annotations with retry logic and better state management
  const saveAnnotations = useCallback(
    async (
      recordingIdToSave?: number,
      boxesToSave?: BoundingBox[],
      isAutoSave = false,
    ) => {
      const recId = recordingIdToSave || recording?.id;
      const boxes = boxesToSave || boundingBoxes;

      if (!recId || !recording) {
        console.error("Cannot save annotations: no recording ID or recording", {
          recId,
          recording,
        });
        return false;
      }

      try {
        if (isAutoSave) {
          setIsAutoSaving(true);
        } else {
          setIsSaving(true);
        }
        setSaveError(null);

        await annotationService.createOrUpdateAnnotation(recId, boxes);
        setLastSavedState([...boxes]);
        setHasUnsavedChanges(false);
        setLastSaveTime(new Date());

        return true;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("Failed to save annotations:", error);
        setSaveError(errorMessage);
        return false;
      } finally {
        if (isAutoSave) {
          setIsAutoSaving(false);
        } else {
          setIsSaving(false);
        }
      }
    },
    [recording, boundingBoxes],
  );

  // Create a wrapper function for saveAnnotations that works with useAutosave
  const autosaveWrapper = useCallback(async () => {
    return await saveAnnotations(recording?.id, boundingBoxes, true);
  }, [saveAnnotations, recording?.id, boundingBoxes]);

  // Integrate autosave functionality
  const { triggerSave: manualSave } = useAutosave({
    data: boundingBoxes,
    onSave: autosaveWrapper,
    hasUnsavedChanges,
    isSaving: isSaving || isAutoSaving,
    enabled: !!recording?.id,
  });

  // React Router navigation blocking (enhanced beforeunload)
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Always pause audio on page unload
      if (wavesurferRef.current && wavesurferRef.current.isPlaying()) {
        wavesurferRef.current.pause();
      }

      // Check for conflicts
      const detectedConflicts = detectAllConflicts(boundingBoxes);
      const hasConflicts = detectedConflicts.length > 0;

      if ((hasUnsavedChanges || hasConflicts) && !isAutoSaving && !isSaving) {
        // Enhanced beforeunload with save attempt
        if (hasUnsavedChanges) {
          manualSave().catch(() => {
            // Silent fail - we can't do much during beforeunload
          });
        }

        event.preventDefault();

        // Update message based on what's wrong
        if (hasConflicts && hasUnsavedChanges) {
          event.returnValue =
            `You have ${detectedConflicts.length} unresolved conflict${detectedConflicts.length > 1 ? "s" : ""} and unsaved changes. Are you sure you want to leave?`;
        } else if (hasConflicts) {
          event.returnValue =
            `You have ${detectedConflicts.length} unresolved bounding box conflict${detectedConflicts.length > 1 ? "s" : ""}. Are you sure you want to leave?`;
        } else {
          event.returnValue =
            "You have unsaved changes. Are you sure you want to leave?";
        }

        return event.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges, isAutoSaving, isSaving, manualSave, boundingBoxes]);

  useEffect(() => {
    if (recordingId) {
      // Save current annotations before switching
      if (recording && hasUnsavedChanges) {
        saveAnnotations(recording.id, boundingBoxes, false);
      }

      // Clean up previous spectrogram immediately when switching recordings
      if (spectrogramUrl && spectrogramUrl.startsWith("blob:")) {
        URL.revokeObjectURL(spectrogramUrl);
      }
      setSpectrogramUrl("");
      setSpectrogramError(null);
      setSpectrogramStatus("not_started");

      // Then fetch new recording data
      fetchRecordingData();
      fetchProjectRecordings();
    }

    // Clean up on unmount or when recordingId changes
    return () => {
      // Cleanup handled by useAutosave hook
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingId]);

  // Cleanup blob URLs when component unmounts
  // Note: Using refs to capture current values at cleanup time, not dependencies
  // This ensures cleanup only happens on unmount, not on every spectrogramUrl change
  const spectrogramUrlRef = useRef(spectrogramUrl);
  spectrogramUrlRef.current = spectrogramUrl;

  useEffect(() => {
    return () => {
      // Clean up blob URLs when component unmounts
      if (spectrogramUrlRef.current && spectrogramUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(spectrogramUrlRef.current);
      }
      if (audioUrlRef.current && audioUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []); // Empty deps = only run cleanup on unmount

  // Audio cleanup on component unmount only (beforeunload handled above)
  useEffect(() => {
    // Capture refs at effect time for cleanup
    const optimizedWaveform = optimizedWaveformRef.current;
    const wavesurfer = wavesurferRef.current;

    return () => {
      // Pause audio when component unmounts (route change)
      // Note: useOptimizedWaveform is a constant (true), so this is always the first branch
      if (optimizedWaveform?.isPlaying()) {
        optimizedWaveform.pause();
      } else if (wavesurfer?.isPlaying()) {
        wavesurfer.pause();
      }
    };
  }, []); // Empty dependency array means this effect runs once on mount and cleanup on unmount

  // Autosave functionality now handled by useAutosave hook

  // Update history when bounding boxes change
  useEffect(() => {
    // Skip history updates during drag/resize operations to prevent excessive undo/redo entries
    if (isDuringDragOperation) {
      return;
    }

    // Only add to history if this is a user action, not loading from backend
    // PERF: Use optimized boxArraysChanged instead of O(n) JSON.stringify
    if (boundingBoxes.length > 0 || history.length > 0) {
      const lastHistoryEntry = history[historyIndex] ?? null;

      if (
        boxArraysChanged(boundingBoxes, lastHistoryEntry) &&
        boxArraysChanged(boundingBoxes, lastSavedState)
      ) {
        addToHistory(boundingBoxes);
        setHasUnsavedChanges(boxArraysChanged(boundingBoxes, lastSavedState));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundingBoxes, isDuringDragOperation]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle keyboard shortcuts if modal or custom input is open
      if (showLabelModal || showCustomLabelInput) {
        return;
      }

      // Don't handle keyboard shortcuts if user is typing in an input field
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA")
      ) {
        // Only allow Escape key to work in input fields for canceling
        if (e.key !== "Escape") {
          return;
        }
      }

      // Track Alt key for distance measurement feature
      // Note: Don't check isAltKeyPressed here - it may be stale due to closure
      if (e.key === "Alt") {
        setIsAltKeyPressed(true);
      }

      // Handle '.' key for annotation mode toggle
      if (
        e.key === "." &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !showLabelModal &&
        !showCustomLabelInput
      ) {
        e.preventDefault();
        toggleAnnotationMode();
        return;
      }

      // Handle ',' key for ROI selection mode toggle
      if (
        e.key === "," &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !showLabelModal &&
        !showCustomLabelInput
      ) {
        e.preventDefault();
        toggleRoiSelectionMode();
        return;
      }

      // Handle ';' key for bottom line mode toggle
      if (
        e.key === ";" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !showLabelModal &&
        !showCustomLabelInput
      ) {
        e.preventDefault();
        // If bottom line is active, open modal to edit/remove it
        if (bottomLine.isActive) {
          setShowBottomLineModal(true);
        } else {
          // Toggle bottom line setting mode
          const newState = !isSettingBottomLine;
          setIsSettingBottomLine(newState);
          // Disable other modes when enabling bottom line mode
          if (newState) {
            setIsAnnotationMode(false);
            setIsRoiSelectionMode(false);
          }
        }
        return;
      }

      // Handle '?' key for showing keyboard shortcuts
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowKeyboardShortcuts(true);
        return;
      }

      // Handle A-Z quick labeling when boxes are selected (excluding '.', '?')
      if (
        selectedBoxes.size > 0 &&
        e.key.length === 1 &&
        /^[a-zA-Z]$/.test(e.key) &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        const label = e.key.toUpperCase();
        handleQuickLabel(label);
        return;
      }

      // Handle arrow keys for horizontal panning
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePanLeft();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handlePanRight();
      } else if (e.key === " ") {
        e.preventDefault();
        handlePlayPause();
      } else if (e.key === "Escape") {
        // Exit all modes and clear selections
        if (isAnnotationMode) {
          setIsAnnotationMode(false);
        }
        if (isRoiSelectionMode) {
          setIsRoiSelectionMode(false);
        }
        if (isSettingBottomLine) {
          setIsSettingBottomLine(false);
        }
        if (selectedBoxes.size > 0) {
          setSelectedBoxes(new Set());
        }
        if (showCustomLabelInput) {
          setShowCustomLabelInput(false);
        }
      } else if (
        (e.key === "Backspace" || e.key === "Delete") &&
        selectedBoxes.size > 0
      ) {
        e.preventDefault();
        handleDeleteSelectedBoxes();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "y" || (e.key === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        handleCopySelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "v" && clipboardBox) {
        e.preventDefault();
        handlePasteSelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSaveAnnotations();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "=") {
        e.preventDefault();
        handleZoomIn();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        handleZoomOut();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        handleZoomReset();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "1") {
        // Set annotation mode: No default label
        e.preventDefault();
        setDefaultLabel(null);
        notification.success(Messages.LABEL_MODE.NO_DEFAULT);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "2") {
        // Set annotation mode: Use last assigned label
        e.preventDefault();
        setDefaultLabel("USE_LAST");
        notification.success(Messages.LABEL_MODE.USE_LAST(lastUsedLabel));
      } else if ((e.ctrlKey || e.metaKey) && e.key === "3") {
        // Set annotation mode: Custom default label
        e.preventDefault();
        setShowDefaultLabelInput(true);
        setDefaultLabelInput(
          defaultLabel && defaultLabel !== "USE_LAST" ? defaultLabel : "",
        );
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Track Alt key release for distance measurement feature
      // Note: Don't check isAltKeyPressed here - it may be stale due to closure
      // Just always reset when Alt key is released
      if (e.key === "Alt") {
        setIsAltKeyPressed(false);
        setHoveredBoxIndex(null); // Clear hover state when Alt is released
      }
      // Arrow keys no longer need keyup handling since they're used for panning
    };

    // Handle window blur - reset Alt key state when window loses focus
    // This prevents "stuck" state if user releases Alt while focused elsewhere
    const handleWindowBlur = () => {
      setIsAltKeyPressed(false);
      setHoveredBoxIndex(null);
    };

    // Removed old handleWheel to prevent dual zoom system conflicts
    // Using only handleWheelZoom for consistent behavior

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    // Removed old wheel event listener - using React onWheel instead

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
      // Removed old wheel event cleanup
      if (rewindIntervalRef.current) {
        clearInterval(rewindIntervalRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isRewindingLeft,
    isRewindingRight,
    isAnnotationMode,
    selectedBoxes,
    selectedBox,
    clipboardBox,
    showLabelModal,
    showCustomLabelInput,
    undo,
    redo,
    zoomLevel,
    isPanning,
  ]);

  useEffect(() => {
    // Only initialize if we have recording data and the waveform container is ready
    if (
      recording &&
      waveformRef.current &&
      spectrogramDimensions.width > 0 &&
      !wavesurferRef.current
    ) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        initializeWavesurfer();
      });
    }
    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
      // Don't revoke URLs here - they might still be needed
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, spectrogramUrl]); // Removed spectrogramDimensions to prevent recreation on resize

  // Handle waveform resize separately without recreating WaveSurfer
  useEffect(() => {
    if (
      wavesurferRef.current &&
      waveformRef.current &&
      spectrogramDimensions.width > 0
    ) {
      // Debounce resize to prevent excessive redraws
      const resizeTimeout = setTimeout(() => {
        try {
          // Update the container dimensions
          const waveformHeight = Math.max(
            50,
            baseSpectrogramDimensions.height * 0.23,
          );
          // Update waveform container height
          if (waveformRef.current) {
            waveformRef.current.style.height = `${waveformHeight}px`;
          }

          // Recalculate and apply zoom for new dimensions
          if (wavesurferRef.current && wavesurferRef.current.getDuration() > 0) {
            const spectrogramContentWidth = baseSpectrogramDimensions.width - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
            const basePxPerSec = spectrogramContentWidth / wavesurferRef.current.getDuration();
            const zoomedPxPerSec = basePxPerSec * zoomLevel;

            // Apply the zoom
            (wavesurferRef.current as any).zoom?.(zoomedPxPerSec);

            // Update height if the method exists
            (wavesurferRef.current as any).setHeight?.(waveformHeight);

            // Force WaveSurfer to redraw with new dimensions
            (wavesurferRef.current as any).drawer?.redraw?.();
          }
        } catch (error) {
          console.warn("Failed to resize waveform:", error);
        }
      }, 150); // 150ms debounce

      return () => clearTimeout(resizeTimeout);
    }
  }, [spectrogramDimensions, zoomLevel, baseSpectrogramDimensions]);

  // Handle zoom changes for waveform - use WaveSurfer's zoom method
  useEffect(() => {
    if (wavesurferRef.current && waveformRef.current) {
      try {
        if (wavesurferRef.current && wavesurferRef.current.getDuration() > 0) {
          // Calculate the base pixels per second from fixed base dimensions
          const spectrogramContentWidth = baseSpectrogramDimensions.width - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
          const basePxPerSec = spectrogramContentWidth / wavesurferRef.current.getDuration();

          // Apply zoom by setting the zoomed pixels per second
          // This makes WaveSurfer render at the correct scale
          const zoomedPxPerSec = basePxPerSec * zoomLevel;

          // Use WaveSurfer's zoom method to set the pixels per second
          (wavesurferRef.current as any).zoom?.(zoomedPxPerSec);

          // Force WaveSurfer to redraw with the new zoom
          (wavesurferRef.current as any).drawer?.redraw?.();
        }
      } catch (e) {
        // Audio not loaded yet, ignore
      }
    }
  }, [zoomLevel, baseSpectrogramDimensions.width]);

  // Set initial base dimensions only once when spectrogram loads
  useEffect(() => {
    if (spectrogramUrl && unifiedScrollRef.current) {
      const containerWidth = unifiedScrollRef.current.clientWidth;
      const containerHeight = unifiedScrollRef.current.clientHeight;

      // Set base dimensions only if not already set properly
      if (!baseSpectrogramDimensions.width || baseSpectrogramDimensions.width === 800) {
        setBaseSpectrogramDimensions({
          width: containerWidth,
          height: containerHeight,
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spectrogramUrl]);

  // Handle window resize for viewport only (not content dimensions)
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout;

    const updateViewportDimensions = () => {
      clearTimeout(resizeTimeout);

      resizeTimeout = setTimeout(() => {
        if (unifiedScrollRef.current) {
          const containerWidth = unifiedScrollRef.current.clientWidth;
          const containerHeight = unifiedScrollRef.current.clientHeight;

          // Always update viewport dimensions
          setSpectrogramDimensions({
            width: containerWidth,
            height: containerHeight,
          });

          // PERF: Update viewport width for OptimizedWaveform
          setViewportWidth(containerWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH);

          // Update base dimensions if container grew significantly (e.g., console closed)
          // This allows expansion but prevents unwanted shrinking of coordinate space
          const RESIZE_THRESHOLD = 50; // pixels
          const heightGrowth = containerHeight - baseSpectrogramDimensions.height;
          const widthGrowth = containerWidth - baseSpectrogramDimensions.width;

          if (heightGrowth > RESIZE_THRESHOLD || widthGrowth > RESIZE_THRESHOLD) {
            console.log(
              `📐 Container significantly expanded (height: +${heightGrowth}px, width: +${widthGrowth}px), updating base dimensions`
            );
            setBaseSpectrogramDimensions({
              width: containerWidth,
              height: containerHeight,
            });
          }
        }
      }, 100);
    };

    // Set initial viewport dimensions
    updateViewportDimensions();

    // Listen to resize for viewport updates only
    window.addEventListener("resize", updateViewportDimensions);

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", updateViewportDimensions);
    };
  }, [baseSpectrogramDimensions.height, baseSpectrogramDimensions.width]); // Add deps to compare against current base dimensions

  // Track previous duration to avoid unnecessary recalculations
  const prevDurationRef = useRef<number>(0);
  const prevWidthRef = useRef<number>(0);

  // Synchronize time coordinates when duration and dimensions become available
  // This ensures mirrors align with bounding boxes regardless of load order
  // IMPORTANT: Always recalculate when duration changes to fix stale coordinates
  // from previous recordings or initial load with duration=0
  useEffect(() => {
    // Only recalculate if duration or width actually changed
    const durationChanged = duration !== prevDurationRef.current;
    const widthChanged = baseSpectrogramDimensions.width !== prevWidthRef.current;

    if (
      duration > 0 &&
      baseSpectrogramDimensions.width > 0 &&
      boundingBoxes.length > 0 &&
      (durationChanged || widthChanged)
    ) {
      // Performance monitoring: Log warning if too many boxes
      if (boundingBoxes.length > 100) {
        console.warn(
          `Performance warning: Recalculating time coordinates for ${boundingBoxes.length} bounding boxes. ` +
          `This operation may be slow. Consider optimizing for large datasets.`
        );
      }

      // Always recalculate time coordinates when duration changes
      // This fixes the issue where waveform mirrors are misaligned after
      // switching recordings because boxes have stale time coordinates
      setBoundingBoxes((currentBoxes) =>
        currentBoxes.map((box) => {
          const timeFrequency = convertBoxToTimeFrequency(box);
          return {
            ...box,
            ...timeFrequency,
          };
        })
      );

      // Update refs
      prevDurationRef.current = duration;
      prevWidthRef.current = baseSpectrogramDimensions.width;
    }
  }, [duration, baseSpectrogramDimensions.width, convertBoxToTimeFrequency, boundingBoxes.length]); // Use base dimensions for consistency

  const loadSpectrogram = async (recordingId: number) => {
    setIsLoadingSpectrogram(true);
    setSpectrogramError(null);

    try {
      // Check current status
      const status = await recordingService.getSpectrogramStatus(recordingId);
      setSpectrogramStatus(status.status);
      setSpectrogramAvailable(status.available);

      if (status.error_message) {
        setSpectrogramError(status.error_message);
      }

      if (status.status === "completed" && status.available) {
        await loadSpectrogramImage(recordingId);
      } else if (
        status.status === "processing" ||
        status.status === "pending"
      ) {
        // Start polling for completion
        pollSpectrogramStatus(recordingId);
      } else if (status.status === "failed") {
        toast.error(
          `Spectrogram generation failed: ${status.error_message || "Unknown error"}`,
        );
      } else if (status.status === "not_started") {
        toast("Spectrogram generation will start shortly...", {
          duration: 4000, // Show for 4 seconds
          icon: "⏳",
        });
        // Start polling for when generation begins
        pollSpectrogramStatus(recordingId);
      }
    } catch (error) {
      console.error("Failed to load spectrogram:", error);
      setSpectrogramError("Failed to load spectrogram");
      toast.error("Failed to load spectrogram");
    } finally {
      setIsLoadingSpectrogram(false);
    }
  };

  const loadSpectrogramImage = async (recordingId: number) => {
    try {
      console.log(`Loading spectrogram for recording ${recordingId}`);

      const blob = await recordingService.getSpectrogramBlob(recordingId);
      if (blob) {
        // Clean up previous URL
        if (spectrogramUrl && spectrogramUrl.startsWith("blob:")) {
          URL.revokeObjectURL(spectrogramUrl);
        }

        const objectUrl = URL.createObjectURL(blob);
        console.log(
          `Created blob URL for recording ${recordingId}:`,
          objectUrl,
        );
        setSpectrogramUrl(objectUrl);
        setSpectrogramError(null);
      }
    } catch (error) {
      console.error(
        `Failed to load spectrogram image for recording ${recordingId}:`,
        error,
      );
      setSpectrogramError(
        `Failed to load spectrogram for recording ${recordingId}`,
      );
      throw error;
    }
  };

  // Better status messages
  const getSpectrogramStatusMessage = useCallback(() => {
    switch (spectrogramStatus) {
      case "not_started":
        return "Spectrogram not generated yet";
      case "processing":
        return "Generating spectrogram... This may take a few moments";
      case "completed":
        return null; // Don't show message when completed
      case "failed":
        return "Spectrogram generation failed. Click to retry.";
      case "timeout":
        return "Generation timed out. Please refresh the page.";
      default:
        return "Checking spectrogram status...";
    }
  }, [spectrogramStatus]);

  const pollSpectrogramStatus = useCallback(
    async (recordingId: number) => {
      if (!recording?.id) return;

      // Add retry configuration
      const MAX_POLLING_ATTEMPTS = 60; // 5 minutes at 5-second intervals
      const POLLING_INTERVAL = 5000;
      let pollingAttempts = 0;
      let pollingErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 3;

      const pollInterval = setInterval(async () => {
        try {
          const status =
            await recordingService.getSpectrogramStatus(recordingId);

          // Reset error counter on success
          pollingErrors = 0;

          setSpectrogramStatus(status.status);
          setSpectrogramAvailable(status.available);

          if (status.status === "completed" && status.available) {
            clearInterval(pollInterval);
            setSpectrogramStatus("completed");
            await loadSpectrogramImage(recordingId);
            toast.success("Spectrogram ready!");
          } else if (status.status === "failed") {
            setSpectrogramStatus("failed");
            setSpectrogramError("Spectrogram generation failed");
            clearInterval(pollInterval);
            toast.error("Spectrogram generation failed. Please try again.");
          } else if (status.status === "processing") {
            setSpectrogramStatus("processing");
            pollingAttempts++;

            // Show progress message
            if (pollingAttempts % 6 === 0) {
              // Every 30 seconds
              toast(
                `Still generating spectrogram... (${Math.floor((pollingAttempts * 5) / 60)} minutes)`,
                {
                  id: "spectrogram-progress",
                  duration: 4000,
                  icon: "⏳",
                },
              );
            }

            // Timeout after MAX_POLLING_ATTEMPTS
            if (pollingAttempts >= MAX_POLLING_ATTEMPTS) {
              clearInterval(pollInterval);
              setSpectrogramStatus("timeout");
              setSpectrogramError(
                "Spectrogram generation timed out. Please refresh the page.",
              );
              toast.error(
                "Spectrogram generation timed out. The process may still be running in the background.",
              );
            }
          }
        } catch (error: any) {
          pollingErrors++;
          console.error("Error polling spectrogram status:", error);

          // Only stop polling after consecutive errors
          if (pollingErrors >= MAX_CONSECUTIVE_ERRORS) {
            clearInterval(pollInterval);

            // Check if it's an auth error
            if (
              error.response?.status === 401 ||
              error.response?.status === 403
            ) {
              setSpectrogramError("Authentication error. Please log in again.");
              toast.error("Session expired. Please log in again.");
            } else {
              // Network or other error - might be temporary
              setSpectrogramError(
                "Failed to check spectrogram status. Please refresh the page.",
              );
              toast.error(
                "Connection error. Please check your internet connection.",
              );
            }
          }
          // Continue polling if under error threshold
        }
      }, POLLING_INTERVAL);

      // Store interval reference for cleanup
      return pollInterval;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recording?.id],
  );
    // eslint-disable-next-line react-hooks/exhaustive-deps

  const fetchProjectRecordings = async () => {
    if (!recordingId) return;
    try {
      const currentRec = await recordingService.getRecording(
        parseInt(recordingId),
      );
      const recordingsResponse = await recordingService.getRecordings(
        currentRec.project_id,
      );
      const recordings = recordingsResponse.items || recordingsResponse;
      setProjectRecordings(recordings);
      // Set total count from pagination metadata if available
      if (recordingsResponse.pagination) {
        setTotalProjectRecordings(recordingsResponse.pagination.total);
      } else {
        setTotalProjectRecordings(recordings.length);
      }
      const index = recordings.findIndex((r) => r.id === parseInt(recordingId));
      setCurrentRecordingIndex(index);
    } catch (error) {
      console.error("Failed to fetch project recordings:", error);
    }
  };

  const fetchRecordingData = async () => {
    if (!recordingId) return;
    try {
      const recordingData = await recordingService.getRecording(
        parseInt(recordingId),
      );
      setRecording(recordingData);

      const annotationsData = await annotationService.getAnnotations(
        parseInt(recordingId),
      );
      if (annotationsData.length > 0) {
        // Take the LATEST annotation (last in array), not the first one
        const latestAnnotation = annotationsData[annotationsData.length - 1];
        const rawBoxes = latestAnnotation.bounding_boxes || [];
        // Round coordinates when loading to ensure consistency
        // AND recalculate time coordinates to sync with current viewport
        const boxes = rawBoxes.map((box) => {
          const roundedBox = {
            ...box,
            x: Math.round(box.x || 0),
            y: Math.round(box.y || 0),
            width: Math.round(box.width || 0),
            height: Math.round(box.height || 0),
          };

          // Recalculate time coordinates from pixel coordinates
          // This ensures mirrors align correctly regardless of monitor resolution
          if (duration > 0 && baseSpectrogramDimensions.width > 0) {
            const timeFrequency = convertBoxToTimeFrequency(roundedBox);
            return {
              ...roundedBox,
              ...timeFrequency,
            };
          }

          return roundedBox;
        });
        setBoundingBoxes(boxes);
        setLastSavedState([...boxes]);
        setAnnotationId(latestAnnotation.id || null);

        // Reset history for new recording
        setHistory([boxes]);
        setHistoryIndex(0);
        setHasUnsavedChanges(false);

        // Initialize color map for existing labels
        const uniqueLabels = new Set(boxes.map((box) => box.label || "None"));
        const newColorMap = new Map([["None", 0]]);
        let colorIndex = 1;

        uniqueLabels.forEach((label) => {
          if (label !== "None" && !newColorMap.has(label)) {
            newColorMap.set(label, colorIndex);
            colorIndex = (colorIndex + 1) % LABEL_COLORS.length;
            if (colorIndex === 0) colorIndex = 1; // Skip "None" color
          }
        });

        setLabelColorMap(newColorMap);
      } else {
        // No annotations yet
        setBoundingBoxes([]);
        setLastSavedState([]);
        setHistory([[]]);
        setHistoryIndex(0);
        setHasUnsavedChanges(false);
        setAnnotationId(null);
      }

      // Start loading spectrogram asynchronously
      loadSpectrogram(parseInt(recordingId));
    } catch (error) {
      console.error("Failed to fetch recording data:", error);
      toast.error("Failed to fetch recording data");
    }
  };

  const initializeWavesurfer = async () => {
    if (!recording) return;

    // For OptimizedWaveform, we only need to fetch the audio URL
    // and let the OptimizedWaveform component handle WaveSurfer internally
    if (useOptimizedWaveform) {
      // Cleanup old blob URL
      if (audioUrlRef.current && audioUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
        setAudioUrl(null);
      }

      const baseUrl = process.env.REACT_APP_API_URL || "";
      const token = localStorage.getItem("token");

      try {
        const response = await fetch(
          `${baseUrl}/recordings/${recording.id}/audio`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          audioUrlRef.current = url;
          setAudioUrl(url); // Trigger re-render
        } else {
          console.error("Failed to fetch audio");
          toast.error("Failed to load audio");
        }
      } catch (error) {
        console.error("Failed to fetch audio:", error);
        toast.error("Failed to load audio");
      }
      return;
    }

    // Legacy WaveSurfer path (when useOptimizedWaveform is false)
    if (!waveformRef.current) return;

    // Destroy existing instance if any
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
    }

    // Get actual container dimensions if available, otherwise use defaults
    let containerWidth = baseSpectrogramDimensions.width;
    let containerHeight = baseSpectrogramDimensions.height;

    // If we have the actual container, measure it directly
    if (unifiedScrollRef.current) {
      const actualWidth = unifiedScrollRef.current.clientWidth;
      const actualHeight = unifiedScrollRef.current.clientHeight;

      // Use actual dimensions if they're valid
      if (actualWidth > 0 && actualHeight > 0) {
        containerWidth = actualWidth;
        containerHeight = actualHeight;

        // Update base dimensions if they're still defaults
        if (baseSpectrogramDimensions.width === 800) {
          setBaseSpectrogramDimensions({
            width: actualWidth,
            height: actualHeight,
          });
        }
      }
    }

    // Ensure container has proper dimensions
    const waveformHeight = Math.max(50, containerHeight * 0.23);

    // Calculate minPxPerSec to maintain consistent scale
    // This should match the spectrogram's scale calculation
    const spectrogramContentWidth = containerWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
    const defaultMinPxPerSec = spectrogramContentWidth / 10; // Assuming 10 seconds default view

    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "#3B82F6", // Modern blue gradient
      progressColor: "#1E40AF", // Deep blue for progress
      cursorColor: "transparent", // Hide wavesurfer cursor since we have unified cursor
      barWidth: 3,
      barRadius: 3,
      cursorWidth: 0, // Hide cursor
      height: waveformHeight, // 23% of total height
      barGap: 2,
      barHeight: 1, // Full height bars for better visibility
      normalize: true,
      interact: true,
      fillParent: false, // Set to false to maintain fixed scale
      backend: "WebAudio",
      mediaControls: false,
      minPxPerSec: defaultMinPxPerSec, // Fixed pixels per second for consistent scale
      hideScrollbar: true, // Hide WaveSurfer's own scrollbar
      autoScroll: false, // Disable auto-scroll
      // Remove unsupported options
    });

    wavesurferRef.current = wavesurfer;

    const baseUrl = process.env.REACT_APP_API_URL || "";
    const token = localStorage.getItem("token");

    try {
      const response = await fetch(
        `${baseUrl}/recordings/${recording.id}/audio`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.ok) {
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        audioUrlRef.current = audioUrl;
        wavesurfer.load(audioUrl);
      } else {
        console.error("Failed to fetch audio");
        toast.error("Failed to load audio");
      }
    } catch (error) {
      console.error("Failed to fetch audio:", error);
      toast.error("Failed to load audio");
    }

    wavesurfer.on("ready", () => {
      setDuration(wavesurfer.getDuration());

      // Apply correct zoom immediately after waveform loads
      // This fixes the initial display issue where waveform appears shrunken
      if (containerWidth > 0) {
        const actualContentWidth = containerWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
        const basePxPerSec = actualContentWidth / wavesurfer.getDuration();
        const zoomedPxPerSec = basePxPerSec * zoomLevel;

        // Apply zoom to fix initial display
        if ((wavesurfer as any).zoom) {
          (wavesurfer as any).zoom(zoomedPxPerSec);
        }
      }
    });

    wavesurfer.on("audioprocess", () => {
      const time = wavesurfer.getCurrentTime();
      setCurrentTime(time);
      // Update timeline cursor position during playback using WaveSurfer's exact coordinate system
      const relativePosition = time / wavesurfer.getDuration();
      // Use the exact same width calculation as WaveSurfer container for perfect alignment
      const waveformContainer = waveformRef.current;
      if (waveformContainer) {
        const containerWidth = waveformContainer.offsetWidth;
        const position = relativePosition * containerWidth;
        setTimelineCursorPosition(position);
      }
    });

    // Add timeupdate event for smoother cursor updates during playback
    wavesurfer.on("timeupdate", (currentTime: number) => {
      setCurrentTime(currentTime);
      // Update timeline cursor position using WaveSurfer's exact coordinate system
      const relativePosition = currentTime / wavesurfer.getDuration();
      // Use the exact same width calculation as WaveSurfer container for perfect alignment
      const waveformContainer = waveformRef.current;
      if (waveformContainer) {
        const containerWidth = waveformContainer.offsetWidth;
        const position = relativePosition * containerWidth;
        setTimelineCursorPosition(position);
      }
    });

    wavesurfer.on("interaction", () => {
      const time = wavesurfer.getCurrentTime();
      setCurrentTime(time);
      // Update timeline cursor position using WaveSurfer's exact coordinate system
      const relativePosition = time / wavesurfer.getDuration();
      // Use the exact same width calculation as WaveSurfer container for perfect alignment
      const waveformContainer = waveformRef.current;
      if (waveformContainer) {
        const containerWidth = waveformContainer.offsetWidth;
        const position = relativePosition * containerWidth;
        setTimelineCursorPosition(position);
      }
    });

    wavesurfer.on("play", () => {
      setIsPlaying(true);
      // Update timeline cursor position using WaveSurfer's exact coordinate system
      const time = wavesurfer.getCurrentTime();
      const relativePosition = time / wavesurfer.getDuration();
      const waveformContainer = waveformRef.current;
      if (waveformContainer) {
        const containerWidth = waveformContainer.offsetWidth;
        const position = relativePosition * containerWidth;
        setTimelineCursorPosition(position);
      }
    });

    wavesurfer.on("pause", () => {
      setIsPlaying(false);
      // Update timeline cursor position using WaveSurfer's exact coordinate system
      const time = wavesurfer.getCurrentTime();
      const relativePosition = time / wavesurfer.getDuration();
      const waveformContainer = waveformRef.current;
      if (waveformContainer) {
        const containerWidth = waveformContainer.offsetWidth;
        const position = relativePosition * containerWidth;
        setTimelineCursorPosition(position);
      }
    });

    wavesurfer.on("finish", () => {
      setIsPlaying(false);
      // Set cursor to end position using WaveSurfer's exact coordinate system
      const waveformContainer = waveformRef.current;
      if (waveformContainer) {
        const containerWidth = waveformContainer.offsetWidth;
        const position = containerWidth; // Full width for finished playback
        setTimelineCursorPosition(position);
      }
    });

    // The 'seeking' event is already handled in 'interaction' above
    // No need for a separate seek handler

    wavesurfer.on("error", (error) => {
      console.error("WaveSurfer error:", error);
      toast.error("Failed to load waveform");
    });
  };

  const handlePlayPause = () => {
    // Use OptimizedWaveform if enabled, otherwise fall back to WaveSurfer
    if (useOptimizedWaveform && optimizedWaveformRef.current) {
      if (optimizedWaveformRef.current.isPlaying()) {
        optimizedWaveformRef.current.pause();
      } else {
        optimizedWaveformRef.current.play();
      }
    } else if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const startRewind = (direction: "forward" | "backward") => {
    if (!wavesurferRef.current || !duration) return;

    // Don't start if already rewinding
    if (isRewindingLeft || isRewindingRight) return;

    // Store current playback state and pause if playing
    wasPlayingRef.current = wavesurferRef.current.isPlaying();
    if (wasPlayingRef.current) {
      wavesurferRef.current.pause();
    }

    if (direction === "backward") {
      setIsRewindingLeft(true);
    } else {
      setIsRewindingRight(true);
    }

    // Start continuous seeking
    const seek = () => {
      if (wavesurferRef.current) {
        const currentTime = wavesurferRef.current.getCurrentTime();
        const seekSpeed = direction === "backward" ? -0.5 : 0.5; // Seek by 0.5 second increments
        const newTime = Math.max(
          0,
          Math.min(duration, currentTime + seekSpeed),
        );
        wavesurferRef.current.seekTo(newTime / duration);
        // Don't set currentTime manually - let WaveSurfer's 'seek' event handle it
      }
    };

    // Execute first seek immediately
    seek();

    // Then continue at interval
    if (!rewindIntervalRef.current) {
      rewindIntervalRef.current = setInterval(seek, 50); // Update every 50ms for smooth scrubbing
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const stopRewind = () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
    if (rewindIntervalRef.current) {
      clearInterval(rewindIntervalRef.current);
      rewindIntervalRef.current = null;
    }

    const wasRewinding = isRewindingLeft || isRewindingRight;
    setIsRewindingLeft(false);
    setIsRewindingRight(false);

    // Resume playback if it was playing before rewinding
    if (wasRewinding && wasPlayingRef.current && wavesurferRef.current) {
      wavesurferRef.current.play();
    }
  };

  const toggleAnnotationMode = () => {
    drawingMode.toggleAnnotationMode();
    // Also disable bottom line mode
    if (!isAnnotationMode) {
      setIsSettingBottomLine(false);
    }
  };

  const toggleRoiSelectionMode = () => {
    drawingMode.toggleRoiSelectionMode();
    // Also disable bottom line mode
    if (!isRoiSelectionMode) {
      setIsSettingBottomLine(false);
    }
  };

  // Handle horizontal panning with arrow keys
  const handlePanLeft = () => {
    if (unifiedScrollRef.current) {
      const scrollAmount = 100; // Pixels to scroll
      const newScrollLeft = Math.max(
        0,
        unifiedScrollRef.current.scrollLeft - scrollAmount,
      );
      unifiedScrollRef.current.scrollLeft = newScrollLeft;
    }
  };

  const handlePanRight = () => {
    if (unifiedScrollRef.current) {
      const scrollAmount = 100; // Pixels to scroll
      const maxScroll =
        unifiedScrollRef.current.scrollWidth -
        unifiedScrollRef.current.clientWidth;
      const newScrollLeft = Math.min(
        maxScroll,
        unifiedScrollRef.current.scrollLeft + scrollAmount,
      );
      unifiedScrollRef.current.scrollLeft = newScrollLeft;
    }
  };

  // Helper function to constrain box within boundaries
  const constrainBox = (box: BoundingBox): BoundingBox => {
    // Use centralized coordinate utilities for consistent constraint handling
    // NOTE: coordinates here are in world space (unzoomed), so use zoom level 1
    let constrained = CoordinateUtils.constrainBoundingBox(
      box,
      baseSpectrogramDimensions.width,  // Use base dimensions for consistency
      baseSpectrogramDimensions.height,
      true, // Account for frequency scale
      1, // World coordinates are unzoomed, so zoom level is 1
    );

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

    // Use centralized conversion hook for time/frequency
    const timeFrequency = convertBoxToTimeFrequency(constrained);

    return {
      ...box,
      x: constrained.x,
      y: constrained.y,
      width: constrained.width,
      height: constrained.height,
      ...timeFrequency,
    };
  };

  const cyclePlaybackSpeed = () => {
    const nextIndex = (currentSpeedIndex + 1) % PLAYBACK_SPEEDS.length;
    const nextSpeed = PLAYBACK_SPEEDS[nextIndex];

    // Use OptimizedWaveform if enabled
    if (useOptimizedWaveform && optimizedWaveformRef.current) {
      const wasPlaying = optimizedWaveformRef.current.isPlaying();
      if (wasPlaying) {
        optimizedWaveformRef.current.pause();
      }
      optimizedWaveformRef.current.setPlaybackRate(nextSpeed);
      if (wasPlaying) {
        setTimeout(() => {
          optimizedWaveformRef.current?.play();
        }, 50);
      }
    } else if (wavesurferRef.current) {
      // Preserve current playback position and state
      const currentTime = wavesurferRef.current.getCurrentTime();
      const dur = wavesurferRef.current.getDuration();
      const wasPlaying = wavesurferRef.current.isPlaying();

      // Pause if playing to prevent jump
      if (wasPlaying) {
        wavesurferRef.current.pause();
      }

      // Set new playback rate
      wavesurferRef.current.setPlaybackRate(nextSpeed);

      // Restore position using relative position (prevents drift)
      if (dur > 0) {
        const relativePosition = currentTime / dur;
        wavesurferRef.current.seekTo(relativePosition);
      }

      // Resume playing if it was playing before
      if (wasPlaying) {
        // Small delay to ensure seekTo completes
        setTimeout(() => {
          if (wavesurferRef.current && wasPlaying) {
            wavesurferRef.current.play();
          }
        }, 50); // Increased delay for more reliable restoration
      }
    }

    setCurrentSpeedIndex(nextIndex);
    setPlaybackSpeed(nextSpeed);
  };

  const pauseAndNavigate = (path: string) => {
    // Pause audio before navigating
    // Note: Conflict detection is handled by useNavigationGuard hook which shows the modal
    if (useOptimizedWaveform && optimizedWaveformRef.current?.isPlaying()) {
      optimizedWaveformRef.current.pause();
    } else if (wavesurferRef.current && wavesurferRef.current.isPlaying()) {
      wavesurferRef.current.pause();
    }
    navigate(path);
  };

  const navigateToRecording = async (index: number) => {
    if (index >= 0 && index < projectRecordings.length) {
      // Pause audio before navigating
      // Note: Conflict detection is handled by useNavigationGuard hook which shows the modal
      if (wavesurferRef.current && wavesurferRef.current.isPlaying()) {
        wavesurferRef.current.pause();
      }

      // Save current annotations before navigating (if no conflicts, navigation will proceed)
      if (hasUnsavedChanges && recording) {
        await saveAnnotations(recording.id, boundingBoxes, false);
      }

      const nextRecording = projectRecordings[index];
      navigate(`/recordings/${nextRecording.id}/annotate`);
    }
  };

  const handleCopySelection = useCallback(() => {
    if (selectedBoxes.size > 0) {
      const copiedBoxes = boundingBoxes.filter((_, index) =>
        selectedBoxes.has(index),
      );
      setClipboardBox(copiedBoxes.length === 1 ? copiedBoxes[0] : copiedBoxes);
      toast.success(
        `${copiedBoxes.length} bounding box${copiedBoxes.length > 1 ? "es" : ""} copied`,
      );
    } else if (selectedBox) {
      setClipboardBox({ ...selectedBox });
      toast.success("Bounding box copied");
    }
  }, [selectedBox, selectedBoxes, boundingBoxes]);

  const handlePasteSelection = useCallback(() => {
    if (!clipboardBox) return;

    // Use mouse position that was stored during right-click
    if (!mousePosition) {
      toast.error("Click position not available");
      return;
    }

    // Use the stored mouse position directly (already in spectrogram coordinates)
    const adjustedPasteX = mousePosition.x;
    const adjustedPasteY = mousePosition.y;

    if (Array.isArray(clipboardBox)) {
      // Multiple boxes - maintain relative positions
      const centerX =
        clipboardBox.reduce((sum, box) => sum + box.x + box.width / 2, 0) /
        clipboardBox.length;
      const centerY =
        clipboardBox.reduce((sum, box) => sum + box.y + box.height / 2, 0) /
        clipboardBox.length;

      // Calculate offset from original center to paste position
      const offsetX = adjustedPasteX - centerX;
      const offsetY = adjustedPasteY - centerY;

      const newBoxes = clipboardBox.map((box) => {
        const pastedBox = {
          ...box,
          x: box.x + offsetX,
          y: box.y + offsetY,
          start_time: 0, // Will be recalculated
          end_time: 0,
          max_frequency: 0,
          min_frequency: 0,
        };
        return constrainBox(pastedBox);
      });

      const updatedBoxes = [...boundingBoxes, ...newBoxes];
      setBoundingBoxes(updatedBoxes);

      // Auto-select the newly pasted boxes
      const startIndex = boundingBoxes.length;
      const newIndices = new Set(
        Array.from({ length: newBoxes.length }, (_, i) => startIndex + i)
      );
      setSelectedBoxes(newIndices);
      setSelectedBox(null);

      setHasUnsavedChanges(true);
      toast.success(`${newBoxes.length} bounding boxes pasted`);
    } else {
      // Single box - center at cursor
      const pastedBox = {
        ...clipboardBox,
        x: adjustedPasteX - clipboardBox.width / 2,
        y: adjustedPasteY - clipboardBox.height / 2,
        start_time: 0, // Will be recalculated
        end_time: 0,
        max_frequency: 0,
        min_frequency: 0,
      };

      const newBox = constrainBox(pastedBox);
      const updatedBoxes = [...boundingBoxes, newBox];
      setBoundingBoxes(updatedBoxes);

      // Auto-select the newly pasted box
      setSelectedBox(newBox);
      setSelectedBoxes(new Set([boundingBoxes.length]));

      setHasUnsavedChanges(true);
      toast.success("Bounding box pasted");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    clipboardBox,
    contextMenu,
    boundingBoxes,
    spectrogramDimensions,
    duration,
    mousePosition,
    zoomLevel,
  ]);

  const handleDeleteSelectedBoxes = useCallback(() => {
    if (selectedBoxes.size > 0) {
      setBoundingBoxes((prev) =>
        prev.filter((_, index) => !selectedBoxes.has(index)),
      );
      setSelectedBoxes(new Set());
      setSelectedBox(null);
      setHasUnsavedChanges(true);
      toast.success(`Deleted ${selectedBoxes.size} annotation(s)`);
    }
  }, [selectedBoxes]);

  const handleEditLabel = useCallback(
    (boxIndex: number) => {
      const box = boundingBoxes[boxIndex];
      if (box) {
        setTempBox(box);
        setShowLabelModal(true);
      }
    },
    [boundingBoxes, setShowLabelModal],
  );

  const getResizeHandle = (box: BoundingBox, x: number, y: number) => {
    const handleSize = 8;
    const handles = [
      { name: "nw", x: box.x, y: box.y },
      { name: "ne", x: box.x + box.width, y: box.y },
      { name: "sw", x: box.x, y: box.y + box.height },
      { name: "se", x: box.x + box.width, y: box.y + box.height },
    ];

    for (const handle of handles) {
      if (
        x >= handle.x - handleSize / 2 &&
        x <= handle.x + handleSize / 2 &&
        y >= handle.y - handleSize / 2 &&
        y <= handle.y + handleSize / 2
      ) {
        return handle.name;
      }
    }
    return null;
  };

  const handleMouseDown = (e: any) => {
    if (!canvasContainerRef.current) return;

    const stage = e.target.getStage();
    // Use getRelativePointerPosition to get world-space coordinates (auto-inverts Stage scaleY)
    const point = stage.getRelativePointerPosition();
    const containerHeight = Math.max(baseSpectrogramDimensions.height, 600);
    const spectrogramHeight = containerHeight * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO;

    // Use centralized coordinate transformation hook
    const { seekPosition, pos } = transformMousePoint(point);

    // Handle bottom line setting mode
    if (isSettingBottomLine && point.y <= spectrogramHeight) {
      // Calculate frequency from pixel position
      const nyquistFreq = getNyquistFrequency();
      const minFreq = 0;
      const maxFreq = nyquistFreq;

      // Convert pixel Y to frequency (Y=0 is top/max freq, Y=height is bottom/min freq)
      const normalizedY = pos.y / spectrogramHeight;
      const frequency = maxFreq - (normalizedY * (maxFreq - minFreq));

      setBottomLineAtPixel(pos.y, frequency);
      toast.success(`Bottom line set at ${Math.round(frequency)} Hz`);
      return; // Prevent other interactions
    }

    // Check if clicking on a bounding box first (before handling right-click)
    // Find all boxes under the cursor - OPTIMIZED: use visibleBoundingBoxes instead of all boxes
    const boxesUnderCursor: number[] = [];
    visibleBoundingBoxes.forEach((box) => {
      if (
        pos.x >= box.x &&
        pos.x <= box.x + box.width &&
        pos.y >= box.y &&
        pos.y <= box.y + box.height
      ) {
        const originalIndex = boxIndexMap.get(box) ?? -1;
        if (originalIndex >= 0) {
          boxesUnderCursor.push(originalIndex);
        }
      }
    });

    // Prefer selected boxes when multiple boxes overlap (fixes paste-then-drag bug)
    // This ensures that after paste, clicking on the newly selected box will drag it,
    // not an overlapping box that happens to be earlier in the array
    let clickedBoxIndex = -1;
    if (boxesUnderCursor.length > 0) {
      // First, try to find a box that is already selected
      const selectedUnderCursor = boxesUnderCursor.find((idx) =>
        selectedBoxes.has(idx)
      );
      if (selectedUnderCursor !== undefined) {
        clickedBoxIndex = selectedUnderCursor;
      } else {
        // Fall back to the last box (top-most in rendering order)
        clickedBoxIndex = boxesUnderCursor[boxesUnderCursor.length - 1];
      }
    }

    // Handle right-click for panning
    if (e.evt.button === 2) {
      // Enable panning only if NOT clicking on any box
      // If clicking on a box, let the context menu handler take over
      if (clickedBoxIndex === -1) {
        e.evt.preventDefault();
        setIsPanning(true);
        setPanStartPos({
          x: e.evt.clientX,
          y: e.evt.clientY,
          scrollX: unifiedScrollRef.current?.scrollLeft || 0,
          scrollY: unifiedScrollRef.current?.scrollTop || 0,
        });
      }
      // Always return on right-click to prevent other mouse down handling
      // Context menu will be handled by onContextMenu event
      return;
    }

    // Update timeline cursor position ONLY when:
    // 1. NOT in annotation mode
    // 2. NOT clicking on a bounding box
    // This prevents cursor jumping when selecting/manipulating boxes
    if (!isAnnotationMode && clickedBoxIndex === -1) {
      const waveformContainer = waveformRef.current;
      if (waveformContainer) {
        const containerWidth = waveformContainer.offsetWidth;
        const cursorPosition = seekPosition * containerWidth;
        setTimelineCursorPosition(cursorPosition);
      }
    }

    // Perform audio seeking when not in annotation mode and clicking with left mouse button
    // This ensures audio seeks regardless of whether clicking on empty space or near bounding boxes
    if (
      !isAnnotationMode &&
      !isSettingBottomLine &&
      e.evt.button === 0 &&
      duration > 0 &&
      !e.evt.shiftKey &&
      !e.evt.ctrlKey &&
      !e.evt.metaKey
    ) {
      const clampedSeekPosition = clampSeekPosition(seekPosition);
      // Use OptimizedWaveform if enabled
      if (useOptimizedWaveform && optimizedWaveformRef.current) {
        optimizedWaveformRef.current.seekTo(clampedSeekPosition);
      } else if (wavesurferRef.current) {
        wavesurferRef.current.seekTo(clampedSeekPosition);
      }
    }

    // Check if clicking in waveform area (starts after spectrogram at 65%)
    const timelineHeight = containerHeight * 0.65; // Timeline starts at 65%
    if (point.y > timelineHeight) {
      // Enable panning in waveform area with multiple options:
      // - Middle mouse button (button === 1)
      // - Right mouse button (button === 2) - already handled above
      // - Left mouse button with Shift/Ctrl modifiers
      if (
        e.evt.button === 1 ||
        (e.evt.button === 0 && (e.evt.shiftKey || e.evt.ctrlKey))
      ) {
        setIsPanning(true);
        setPanStartPos({
          x: e.evt.clientX,
          y: e.evt.clientY,
          scrollX: unifiedScrollRef.current?.scrollLeft || 0,
          scrollY: unifiedScrollRef.current?.scrollTop || 0,
        });
        return;
      }
      return; // Return after handling waveform interactions
    }

    // Close context menu if open
    if (contextMenu) {
      setContextMenu(null);
    }

    // Check for double-click to play segment
    const currentTime = Date.now();
    // Note: clickedBoxIndex is already calculated above before cursor update logic

    if (
      clickedBoxIndex !== -1 &&
      clickedBoxIndex === lastClickedBox &&
      currentTime - lastClickTime < 500
    ) {
      // Double-click detected - play the segment
      const box = boundingBoxes[clickedBoxIndex];
      playSegment(box);
      setLastClickTime(0);
      setLastClickedBox(null);
      return;
    }

    setLastClickTime(currentTime);
    setLastClickedBox(clickedBoxIndex);

    // Check if clicking on a resize handle
    if (!isAnnotationMode && !showLabelModal) {
      for (let i = 0; i < boundingBoxes.length; i++) {
        const box = boundingBoxes[i];
        const handle = getResizeHandle(box, pos.x, pos.y);
        if (handle) {
          // Start resize operation - capture initial state and prevent history updates during resize
          setPreOperationState([...boundingBoxes]);
          setIsDuringDragOperation(true);
          setResizingBox({ index: i, handle });
          setDragStartPos(pos);
          setSelectedBox(box);
          return;
        }
      }
    }

    // Check if clicking on a box (in non-annotation mode)
    if (!isAnnotationMode) {
      if (clickedBoxIndex !== -1) {
        const clickedBox = boundingBoxes[clickedBoxIndex];

        // Check if clicking on resize handle first
        const handle = getResizeHandle(clickedBox, pos.x, point.y); // Use raw point.y for handle detection
        if (!handle) {
          // Not on a handle, start dragging the box
          if (e.evt.shiftKey && !showLabelModal) {
            // Add to selection (only if modal is not open)
            const newSelection = new Set(selectedBoxes);
            newSelection.add(clickedBoxIndex);
            setSelectedBoxes(newSelection);
          } else if (e.evt.ctrlKey || e.evt.metaKey) {
            // Toggle selection
            const newSelection = new Set(selectedBoxes);
            if (newSelection.has(clickedBoxIndex)) {
              newSelection.delete(clickedBoxIndex);
            } else {
              newSelection.add(clickedBoxIndex);
            }
            setSelectedBoxes(newSelection);
          } else {
            // Check if clicking on an already selected box
            if (selectedBoxes.has(clickedBoxIndex)) {
              // Box is already selected, start dragging all selected boxes
              const initialPositions = new Map<
                number,
                { x: number; y: number }
              >();
              selectedBoxes.forEach((idx) => {
                const box = boundingBoxes[idx];
                if (box) {
                  initialPositions.set(idx, { x: box.x, y: box.y });
                }
              });

              // Start drag operation - capture initial state and prevent history updates during drag
              setPreOperationState([...boundingBoxes]);
              setIsDuringDragOperation(true);
              setDraggingBox({
                index: clickedBoxIndex,
                initialBox: { ...clickedBox },
                dragOffset: {
                  x: pos.x - clickedBox.x,
                  y: pos.y - clickedBox.y,
                },
                selectedIndices: new Set(selectedBoxes),
                initialPositions: initialPositions,
              });
            } else {
              // Box is not selected, select only this one and start dragging
              setSelectedBoxes(new Set([clickedBoxIndex]));
              setSelectedBox(clickedBox);

              // Start drag operation - capture initial state and prevent history updates during drag
              setPreOperationState([...boundingBoxes]);
              setIsDuringDragOperation(true);
              setDraggingBox({
                index: clickedBoxIndex,
                initialBox: { ...clickedBox },
                dragOffset: {
                  x: pos.x - clickedBox.x,
                  y: pos.y - clickedBox.y,
                },
              });
            }
          }
        }
        return;
      }

      // If in ROI selection mode or shift/ctrl clicking, start selection rectangle
      if (isRoiSelectionMode || e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey) {
        // Start selection rectangle for ROI mode or shift/ctrl
        setIsSelecting(true);
        setSelectionRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
        setSelectedBoxes(new Set());
        setSelectedBox(null);
      } else {
        // Deselect all bounding boxes when clicking outside
        if (selectedBoxes.size > 0 || selectedBox) {
          setSelectedBoxes(new Set());
          setSelectedBox(null);
        }

        // Start panning for middle mouse button, right mouse button (handled above), or left button
        // Note: Right-click panning is already handled at the top of handleMouseDown
        if (e.evt.button === 1 || e.evt.button === 0) {
          if (unifiedScrollRef.current) {
            setIsPanning(true);
            setPanStartPos({
              x: e.evt.clientX,
              scrollX: unifiedScrollRef.current.scrollLeft,
              y: e.evt.clientY,
              scrollY: unifiedScrollRef.current.scrollTop,
            });
            e.evt.preventDefault();
          }
        }
      }
    } else {
      // Annotation mode - start drawing (only in spectrogram area)
      if (point.y <= spectrogramHeight) {
        setIsDrawing(true);
        setDrawingBox({ x: pos.x, y: pos.y, width: 0, height: 0 });
      }
    }
  };

  // Throttled mouse position update for cursor styling (performance optimization)
  const throttledSetMousePosition = useMemo(
    () =>
      throttle((pos: { x: number; y: number }) => {
        setMousePosition(pos);
      }, 50), // 20 FPS is enough for cursor updates
    [],
  );

  // Memoized cursor calculation - avoids expensive computation on every render
  const stageCursor = useMemo(() => {
    if (isAnnotationMode) return "crosshair";
    if (isRoiSelectionMode) return "crosshair";
    if (isPanning) return "grabbing";
    if (hoveredHandle) {
      const isNWSE =
        (hoveredHandle.handle.includes("n") && hoveredHandle.handle.includes("w")) ||
        (hoveredHandle.handle.includes("s") && hoveredHandle.handle.includes("e"));
      return isNWSE ? "nwse-resize" : "nesw-resize";
    }
    if (draggingBox) return "grabbing";
    if (resizingBox) return "grabbing";
    if (isSelecting) return "crosshair";

    // Check if mouse is over a bounding box
    const isOverBox = boundingBoxes.some(
      (box) =>
        mousePosition.x >= box.x &&
        mousePosition.x <= box.x + box.width &&
        mousePosition.y >= box.y &&
        mousePosition.y <= box.y + box.height,
    );
    if (isOverBox) return "move";

    // Check if mouse is in waveform area
    const containerHeight = Math.max(spectrogramDimensions.height, 600);
    if (mousePosition.y > containerHeight * 0.8) return "pointer";

    return "default";
  }, [
    isAnnotationMode,
    isRoiSelectionMode,
    isPanning,
    hoveredHandle,
    draggingBox,
    resizingBox,
    isSelecting,
    boundingBoxes,
    mousePosition,
    spectrogramDimensions.height,
  ]);

  // Cleanup throttled function and RAF on unmount
  useEffect(() => {
    return () => {
      throttledSetMousePosition.cancel?.();
      // Cancel any pending RAF updates
      if (dragRAFRef.current) {
        cancelAnimationFrame(dragRAFRef.current);
        dragRAFRef.current = null;
      }
    };
  }, [throttledSetMousePosition]);

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    // Use getRelativePointerPosition to get world-space coordinates (auto-inverts Stage scaleY)
    const point = stage.getRelativePointerPosition();
    const containerHeight = Math.max(baseSpectrogramDimensions.height, 600);
    const spectrogramHeight = containerHeight * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO;

    // Use centralized coordinate transformation hook (same as handleMouseDown)
    const { seekPosition, pos } = transformMousePoint(point);

    // Performance optimization: Store in ref for immediate access, throttle state updates
    mousePositionRef.current = pos;

    // Only update state (for cursor) when not doing intensive operations
    if (!draggingBox && !resizingBox && !isDrawing && !isSelecting) {
      throttledSetMousePosition(pos);
    }

    // Don't update timeline cursor on mouse move - only on click
    // This prevents the cursor from following the mouse without clicking

    // Handle panning for both horizontal and vertical
    if (isPanning && panStartPos && unifiedScrollRef.current) {
      const deltaX = panStartPos.x - e.evt.clientX;
      unifiedScrollRef.current.scrollLeft = panStartPos.scrollX + deltaX;

      if (panStartPos.y !== undefined && panStartPos.scrollY !== undefined) {
        const deltaY = panStartPos.y - e.evt.clientY;
        unifiedScrollRef.current.scrollTop = panStartPos.scrollY + deltaY;
      }
      return;
    }

    // Handle waveform drag to seek (continuous dragging)
    if (
      point.y > spectrogramHeight &&
      e.evt.buttons === 1 &&
      !isAnnotationMode &&
      !isSettingBottomLine &&
      !isPanning &&
      !draggingBox &&
      !resizingBox
    ) {
      if (wavesurferRef.current && duration > 0) {
        // Use the pre-calculated seekPosition which is invariant to zoom and scroll
        const clampedSeekPosition = clampSeekPosition(seekPosition);
        wavesurferRef.current.seekTo(clampedSeekPosition);
        // Don't set currentTime manually - let WaveSurfer's 'interaction' event handle it
      }
      return;
    }

    // Handle dragging entire box (with multi-selection support)
    // Performance: Use RAF to limit state updates to once per frame
    if (draggingBox) {
      const deltaX =
        pos.x - draggingBox.dragOffset.x - draggingBox.initialBox.x;
      const deltaY =
        pos.y - draggingBox.dragOffset.y - draggingBox.initialBox.y;

      const updatedBoxes = [...boundingBoxes];
      let newSelectedBox: BoundingBox | null = null;

      // If we have multiple selected boxes, move them all
      if (
        draggingBox.selectedIndices &&
        draggingBox.selectedIndices.size > 1 &&
        draggingBox.initialPositions
      ) {
        draggingBox.selectedIndices.forEach((index) => {
          const initialPos = draggingBox.initialPositions!.get(index);
          if (initialPos) {
            const box = boundingBoxes[index];
            const unconstrained = {
              ...box,
              x: initialPos.x + deltaX,
              y: initialPos.y + deltaY,
            };
            updatedBoxes[index] = constrainBox(unconstrained);
          }
        });
      } else {
        // Single box drag
        const newX = pos.x - draggingBox.dragOffset.x;
        const newY = pos.y - draggingBox.dragOffset.y;

        const unconstrained = {
          ...boundingBoxes[draggingBox.index],
          x: newX,
          y: newY,
        };
        updatedBoxes[draggingBox.index] = constrainBox(unconstrained);
        newSelectedBox = updatedBoxes[draggingBox.index];
      }

      // Store pending update
      pendingDragUpdateRef.current = {
        boxes: updatedBoxes,
        selectedBox: newSelectedBox,
      };

      // Schedule RAF update if not already scheduled
      if (!dragRAFRef.current) {
        dragRAFRef.current = requestAnimationFrame(() => {
          const pending = pendingDragUpdateRef.current;
          if (pending) {
            setBoundingBoxes(pending.boxes);
            if (pending.selectedBox !== undefined) {
              setSelectedBox(pending.selectedBox);
            }
            setHasUnsavedChanges(true);

            // Clear conflict highlighting when box is moved
            if (highlightConflicts) {
              setHighlightConflicts(false);
              setConflicts([]);
              toast.dismiss();
            }
          }
          pendingDragUpdateRef.current = null;
          dragRAFRef.current = null;
        });
      }

      return;
    }

    // Handle resizing - Performance: Use RAF to limit state updates
    if (resizingBox && dragStartPos) {
      const box = boundingBoxes[resizingBox.index];
      const newBox = { ...box };
      const minSize = 2;

      // Use centralized hooks for boundary constraints
      const maxY = getMaxSpectrogramY();
      const constrainedY = Math.min(pos.y, maxY);

      // Additional constraint for x position
      const maxWorldX = getMaxWorldX();
      const constrainedX = Math.min(pos.x, maxWorldX);

      switch (resizingBox.handle) {
        case "nw":
          newBox.width = Math.max(minSize, box.x + box.width - constrainedX);
          newBox.height = Math.max(minSize, box.y + box.height - constrainedY);
          newBox.x = Math.min(constrainedX, box.x + box.width - minSize);
          newBox.y = Math.min(constrainedY, box.y + box.height - minSize);
          break;
        case "ne":
          newBox.width = Math.max(minSize, constrainedX - box.x);
          newBox.height = Math.max(minSize, box.y + box.height - constrainedY);
          newBox.y = Math.min(constrainedY, box.y + box.height - minSize);
          break;
        case "sw":
          newBox.width = Math.max(minSize, box.x + box.width - constrainedX);
          newBox.height = Math.max(minSize, constrainedY - box.y);
          newBox.x = Math.min(constrainedX, box.x + box.width - minSize);
          break;
        case "se":
          newBox.width = Math.max(minSize, constrainedX - box.x);
          newBox.height = Math.max(minSize, constrainedY - box.y);
          break;
      }

      // Update time and frequency using centralized conversion hook
      const timeFrequency = convertBoxToTimeFrequency(newBox);
      Object.assign(newBox, timeFrequency);

      const updatedBoxes = [...boundingBoxes];
      updatedBoxes[resizingBox.index] = newBox;

      // Store pending update for RAF
      pendingDragUpdateRef.current = {
        boxes: updatedBoxes,
        selectedBox: newBox,
      };

      // Schedule RAF update if not already scheduled
      if (!dragRAFRef.current) {
        dragRAFRef.current = requestAnimationFrame(() => {
          const pending = pendingDragUpdateRef.current;
          if (pending) {
            setBoundingBoxes(pending.boxes);
            if (pending.selectedBox) {
              setSelectedBox(pending.selectedBox);
            }
            setHasUnsavedChanges(true);

            if (highlightConflicts) {
              setHighlightConflicts(false);
              setConflicts([]);
              toast.dismiss();
            }
          }
          pendingDragUpdateRef.current = null;
          dragRAFRef.current = null;
        });
      }

      return;
    }

    // Handle selection rectangle
    if (isSelecting && selectionRect) {
      setSelectionRect({
        ...selectionRect,
        width: pos.x - selectionRect.x,
        height: pos.y - selectionRect.y,
      });

      // Update selected boxes based on selection rectangle
      const rect = {
        x: Math.min(selectionRect.x, pos.x),
        y: Math.min(selectionRect.y, pos.y),
        width: Math.abs(pos.x - selectionRect.x),
        height: Math.abs(pos.y - selectionRect.y),
      };

      const newSelection = new Set<number>();
      boundingBoxes.forEach((box, index) => {
        if (
          box.x < rect.x + rect.width &&
          box.x + box.width > rect.x &&
          box.y < rect.y + rect.height &&
          box.y + box.height > rect.y
        ) {
          newSelection.add(index);
        }
      });
      setSelectedBoxes(newSelection);
      return;
    }

    // Handle drawing new box (constrain to spectrogram area)
    if (isDrawing && drawingBox) {
      const maxY = getMaxSpectrogramY();
      const constrainedY = Math.min(pos.y, maxY);

      // Ensure drawing width is constrained to max boundary (pos.x is already constrained but ensure drawing box width doesn't exceed)
      const maxWorldX = getMaxWorldX();
      const constrainedWidth = Math.min(
        pos.x - drawingBox.x,
        maxWorldX - drawingBox.x,
      );

      setDrawingBox({
        ...drawingBox,
        width: constrainedWidth,
        height: constrainedY - drawingBox.y,
      });
      return;
    }

    // Update cursor and hover state for resize handles
    // PERF: Only check visible boxes instead of all boxes (O(visible) vs O(all))
    if (!isAnnotationMode && !isDrawing && !isSelecting) {
      let foundHandle = false;
      for (const box of visibleBoundingBoxes) {
        const handle = getResizeHandle(box, pos.x, pos.y);
        if (handle) {
          const originalIndex = boxIndexMap.get(box) ?? -1;
          setHoveredHandle({ boxIndex: originalIndex, handle });
          foundHandle = true;
          break;
        }
      }
      if (!foundHandle) {
        setHoveredHandle(null);
      }
    }

    // Distance measurement: Track hovered box when Alt is pressed
    // PERF: Only check visible boxes instead of all boxes
    if (isAltKeyPressed && !isAnnotationMode && selectedBoxes.size > 0) {
      let newHoveredIndex: number | null = null;

      // Find which box the mouse is hovering over (reverse order for z-index)
      for (let i = visibleBoundingBoxes.length - 1; i >= 0; i--) {
        const box = visibleBoundingBoxes[i];
        if (isPointInBox(pos, box)) {
          newHoveredIndex = boxIndexMap.get(box) ?? null;
          break;
        }
      }

      setHoveredBoxIndex(newHoveredIndex);
    } else {
      // Clear hovered box if Alt is not pressed
      if (hoveredBoxIndex !== null) {
        setHoveredBoxIndex(null);
      }
    }
  };

  const handleMouseUp = () => {
    // Handle panning end
    if (isPanning) {
      setIsPanning(false);
      setPanStartPos(null);
      return;
    }

    // Handle drag end
    if (draggingBox) {
      // End drag operation - re-enable history updates and add single history entry
      setIsDuringDragOperation(false);
      setDraggingBox(null);

      // Add single history entry for the entire drag operation
      // PERF: Use optimized boxArraysChanged instead of O(n) JSON.stringify
      if (preOperationState) {
        if (boxArraysChanged(boundingBoxes, preOperationState)) {
          addToHistory(boundingBoxes);
          setHasUnsavedChanges(true);
        }
        setPreOperationState(null);
      }
      return;
    }

    // Handle resize end
    if (resizingBox) {
      // End resize operation - re-enable history updates and add single history entry
      setIsDuringDragOperation(false);
      setResizingBox(null);
      setDragStartPos(null);

      // Add single history entry for the entire resize operation
      // PERF: Use optimized boxArraysChanged instead of O(n) JSON.stringify
      if (preOperationState) {
        if (boxArraysChanged(boundingBoxes, preOperationState)) {
          addToHistory(boundingBoxes);
          setHasUnsavedChanges(true);
        }
        setPreOperationState(null);
      }
      return;
    }

    // Handle selection rectangle end
    if (isSelecting) {
      setIsSelecting(false);
      setSelectionRect(null);
      // Auto-deactivate ROI selection mode after completing selection
      if (isRoiSelectionMode) {
        setIsRoiSelectionMode(false);
      }
      return;
    }

    // Handle drawing end
    if (isDrawing && drawingBox) {
      setIsDrawing(false);

      // Allow creating bounding boxes of any size (removed minimum area restriction)
      if (drawingBox.width !== 0 || drawingBox.height !== 0) {
        // Normalize the drawing box - store in display coordinates (spectrogram area)
        const normalizedBox = {
          x:
            drawingBox.width < 0
              ? drawingBox.x + drawingBox.width
              : drawingBox.x,
          y:
            drawingBox.height < 0
              ? drawingBox.y + drawingBox.height
              : drawingBox.y, // Store in display coordinates
          width: Math.abs(drawingBox.width),
          height: Math.abs(drawingBox.height), // Store in display coordinates
        };

        // Use centralized conversion hook for time/frequency
        // const timeFrequency =
          convertNormalizedBoxToTimeFrequency(normalizedBox);

        // Determine label based on defaultLabel setting
        let assignedLabel = "None";
        if (defaultLabel === "USE_LAST" && lastUsedLabel) {
          assignedLabel = lastUsedLabel;
        } else if (defaultLabel && defaultLabel !== "USE_LAST") {
          assignedLabel = defaultLabel;
        }

        // Apply bottom line clipping if active
        let clippedBox = { ...normalizedBox };
        if (bottomLine.isActive && bottomLine.pixelY !== null) {
          const bottomY = bottomLine.pixelY;

          // If box extends below the bottom line, clip its height
          if (clippedBox.y + clippedBox.height > bottomY) {
            const newHeight = bottomY - clippedBox.y;
            // Only clip if there's still visible height remaining
            if (newHeight > 0) {
              clippedBox.height = newHeight;
            } else {
              // Box is entirely below the line, don't create it
              setDrawingBox(null);
              notification.error(Messages.ANNOTATION.BELOW_BOTTOM_LINE);
              return;
            }
          }
        }

        // Recalculate time/frequency for clipped box
        const finalTimeFrequency = convertNormalizedBoxToTimeFrequency(clippedBox);

        const newBox: BoundingBox = {
          ...clippedBox,
          label: assignedLabel,
          ...finalTimeFrequency,
        };

        // Track the last used label (excluding "None") for consistency with manual label assignment
        if (assignedLabel && assignedLabel !== "None") {
          setLastUsedLabel(assignedLabel);
        }

        // Add the box directly without showing the label modal
        setBoundingBoxes([...boundingBoxes, newBox]);
        setHasUnsavedChanges(true);

        // Notify user if box was clipped
        if (clippedBox.height !== normalizedBox.height) {
          notification.success(Messages.ANNOTATION.ADDED_CLIPPED(assignedLabel));
        } else {
          notification.success(Messages.ANNOTATION.ADDED(assignedLabel));
        }
      }

      setDrawingBox(null);
    }
  };

  const handleContextMenu = (e: any) => {
    e.evt.preventDefault();

    const stage = e.target.getStage();
    // Use getRelativePointerPosition to get world-space coordinates (auto-inverts Stage scaleY)
    const point = stage.getRelativePointerPosition();

    // Use centralized coordinate transformation hook
    const { pos } = transformMousePoint(point);
    const adjustedX = pos.x;
    const adjustedY = pos.y;

    // Store mouse position for paste operation
    setMousePosition({ x: adjustedX, y: adjustedY });

    // Check if right-clicking on a box
    // Find all boxes under the cursor - OPTIMIZED: use visibleBoundingBoxes instead of all boxes
    const boxesUnderCursor: number[] = [];
    visibleBoundingBoxes.forEach((box) => {
      if (
        adjustedX >= box.x &&
        adjustedX <= box.x + box.width &&
        adjustedY >= box.y &&
        adjustedY <= box.y + box.height
      ) {
        const originalIndex = boxIndexMap.get(box) ?? -1;
        if (originalIndex >= 0) {
          boxesUnderCursor.push(originalIndex);
        }
      }
    });

    // Prefer selected boxes when multiple boxes overlap
    let clickedBoxIndex = -1;
    if (boxesUnderCursor.length > 0) {
      const selectedUnderCursor = boxesUnderCursor.find((idx) =>
        selectedBoxes.has(idx)
      );
      if (selectedUnderCursor !== undefined) {
        clickedBoxIndex = selectedUnderCursor;
      } else {
        clickedBoxIndex = boxesUnderCursor[boxesUnderCursor.length - 1];
      }
    }

    if (clickedBoxIndex !== -1) {
      // Show context menu without selecting the box
      // The context menu will operate on the clicked box directly
      setContextMenu({
        x: e.evt.clientX,
        y: e.evt.clientY,
        boxIndex: clickedBoxIndex,
      });
      return; // Prevent panning when showing context menu
    } else {
      // Right-click on empty space - show paste option if clipboard has content
      if (clipboardBox) {
        setContextMenu({
          x: e.evt.clientX,
          y: e.evt.clientY,
          boxIndex: undefined,
        });
      }
    }
  };

  const handleLabelSubmit = (label: string) => {
    // Track the last used label (excluding "None")
    if (label && label !== "None") {
      setLastUsedLabel(label);
    }

    if (tempBox) {
      // Check if we're editing an existing box
      const existingIndex = boundingBoxes.findIndex(
        (box) =>
          box.x === tempBox.x &&
          box.y === tempBox.y &&
          box.width === tempBox.width &&
          box.height === tempBox.height,
      );

      if (existingIndex !== -1) {
        // Update existing box
        const updatedBoxes = [...boundingBoxes];
        updatedBoxes[existingIndex] = { ...tempBox, label };
        setBoundingBoxes(updatedBoxes);
        setHasUnsavedChanges(true);
      } else {
        // Add new box
        setBoundingBoxes([...boundingBoxes, { ...tempBox, label }]);
        setHasUnsavedChanges(true);
      }
      setTempBox(null);
    }
    setShowLabelModal(false);
  };

  const handleDeleteBox = (index: number) => {
    setBoundingBoxes(boundingBoxes.filter((_, i) => i !== index));
    setSelectedBox(null);
    setHasUnsavedChanges(true);
  };

  const handleUpdateLabel = (index: number, newLabel: string) => {
    // Track the last used label (excluding "None")
    if (newLabel && newLabel !== "None") {
      setLastUsedLabel(newLabel);
    }

    setBoundingBoxes((prev) =>
      prev.map((box, i) => (i === index ? { ...box, label: newLabel } : box)),
    );
    setHasUnsavedChanges(true);
  };

  const handleSelectMultiple = (indices: Set<number>) => {
    setSelectedBoxes(indices);
  };

  const handleSaveAnnotations = async () => {
    if (!recording) return;

    const success = await saveAnnotations(recording.id, boundingBoxes, false);
    if (success) {
      toast.success("Annotations saved successfully");
    } else {
      toast.error("Failed to save annotations. Please try again.");
    }
  };

  // Zoom handlers
  const handleZoomIn = () => {
    const newZoom = Math.min(zoomLevel * 1.5, maxZoomLevel);
    setZoomLevel(newZoom);
    // No need to sync WaveSurfer zoom - container width handles it
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoomLevel / 1.5, 1);
    setZoomLevel(newZoom);
    // No need to sync WaveSurfer zoom - container width handles it
  };

  const handleZoomReset = () => {
    setZoomLevel(1);
    setScrollOffset(0);
    setZoomOffset({ x: 0, y: 0 });
    // No need to reset WaveSurfer zoom - container width handles it
    // Reset scroll position
    if (unifiedScrollRef.current) {
      unifiedScrollRef.current.scrollLeft = 0;
      unifiedScrollRef.current.scrollTop = 0;
    }
    setZoomOffset({ x: 0, y: 0 });
  };

  // Manual zoom input handlers
  const handleZoomInputStart = () => {
    setIsEditingZoom(true);
    setZoomInputValue(Math.round(zoomLevel * 100).toString());
  };

  const handleZoomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only digits
    const value = e.target.value.replace(/[^\d]/g, "");
    setZoomInputValue(value);
  };

  const handleZoomInputConfirm = () => {
    const numValue = parseInt(zoomInputValue, 10);
    const maxPercent = Math.round(maxZoomLevel * 100);
    if (!isNaN(numValue) && numValue >= 100 && numValue <= maxPercent) {
      setZoomLevel(numValue / 100);
    }
    setIsEditingZoom(false);
    setZoomInputValue("");
  };

  const handleZoomInputCancel = () => {
    setIsEditingZoom(false);
    setZoomInputValue("");
  };

  const handleZoomInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleZoomInputConfirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleZoomInputCancel();
    }
  };

  // Conflict detection and resolution handlers
  const handleDetectConflicts = () => {
    const detectedConflicts = detectAllConflicts(boundingBoxes);
    setConflicts(detectedConflicts);
    setHighlightConflicts(true);

    if (detectedConflicts.length === 0) {
      toast.success("No conflicts detected! All bounding boxes have proper spacing and no nesting.");
    } else {
      // Count nesting and gap conflicts
      const nestingConflicts = detectedConflicts.filter(c => c.type === 'nesting');
      const gapConflicts = detectedConflicts.filter(c => c.type === 'gap');

      // Show toast with custom JSX for the "Resolve Conflicts" button
      // Capture detectedConflicts in closure to avoid state timing issues
      toast(
        (t) => (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="font-medium text-gray-900">
                {detectedConflicts.length} conflict{detectedConflicts.length > 1 ? "s" : ""} detected
              </p>
              <p className="text-sm text-gray-600">
                {nestingConflicts.length > 0 && `${nestingConflicts.length} nested box${nestingConflicts.length > 1 ? 'es' : ''}`}
                {nestingConflicts.length > 0 && gapConflicts.length > 0 && ', '}
                {gapConflicts.length > 0 && `${gapConflicts.length} gap issue${gapConflicts.length > 1 ? 's' : ''}`}
              </p>
            </div>
            <button
              onClick={() => {
                handleResolveConflicts(detectedConflicts);
                toast.dismiss(t.id);
              }}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
            >
              Resolve Automatically
            </button>
          </div>
        ),
        {
          duration: 8000,
          icon: "⚠️",
        }
      );
    }
  };

  const handleResolveConflicts = (conflictsToResolve?: UnifiedConflict[]) => {
    // Use provided conflicts or fall back to state
    const activeConflicts = conflictsToResolve || conflicts;

    if (activeConflicts.length === 0) {
      toast.error("No conflicts to resolve");
      return;
    }

    // Count nesting and gap conflicts for feedback
    const nestingConflicts = activeConflicts.filter(c => c.type === 'nesting');
    const gapConflicts = activeConflicts.filter(c => c.type === 'gap');

    const resolvedBoxes = resolveAllConflicts(boundingBoxes, activeConflicts);

    // CRITICAL FIX: Recalculate pixel coordinates (x, width) from time coordinates
    // because resolveAllConflicts only modifies start_time and end_time
    const resolvedBoxesWithPixelCoords = resolvedBoxes.map((box) => {
      const newX = CoordinateUtils.timeToPixel(
        box.start_time,
        duration,
        baseSpectrogramDimensions.width,
        1, // No zoom for stored coordinates
        false,
      );
      const endX = CoordinateUtils.timeToPixel(
        box.end_time,
        duration,
        baseSpectrogramDimensions.width,
        1, // No zoom for stored coordinates
        false,
      );
      const newWidth = endX - newX;

      return {
        ...box,
        x: newX,
        width: newWidth,
      };
    });

    setBoundingBoxes(resolvedBoxesWithPixelCoords);

    // Add to history for undo
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(resolvedBoxesWithPixelCoords);
    if (newHistory.length > MAX_HISTORY_SIZE) {
      newHistory.shift();
    }
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);

    // Clear conflicts and highlighting
    setConflicts([]);
    setHighlightConflicts(false);

    // Detailed success message
    const messages = [];
    if (nestingConflicts.length > 0) {
      messages.push(`Removed ${nestingConflicts.length} nested box${nestingConflicts.length > 1 ? 'es' : ''}`);
    }
    if (gapConflicts.length > 0) {
      messages.push(`Adjusted ${gapConflicts.length} gap${gapConflicts.length > 1 ? 's' : ''}`);
    }

    toast.success(messages.join(', ') + '!');
  };

  const handleToggleHighlightConflicts = () => {
    // Always detect conflicts when clicked (not a toggle)
    handleDetectConflicts();
  };

  // Navigation guard conflict handlers
  const handleResolveAndContinue = async () => {
    // Use provided conflicts or fall back to state
    const activeConflicts = navigationConflicts;

    if (activeConflicts.length === 0) {
      toast.error("No conflicts to resolve");
      proceedNavigation();
      return;
    }

    try {
      // Resolve conflicts and get the modified boxes (includes nesting + gap resolution)
      const resolvedBoxes = resolveAllConflicts(boundingBoxes, activeConflicts);

      // CRITICAL FIX: Recalculate pixel coordinates (x, width) from time coordinates
      const resolvedBoxesWithPixelCoords = resolvedBoxes.map((box) => {
        const newX = CoordinateUtils.timeToPixel(
          box.start_time,
          duration,
          baseSpectrogramDimensions.width,
          1,
          false,
        );
        const endX = CoordinateUtils.timeToPixel(
          box.end_time,
          duration,
          baseSpectrogramDimensions.width,
          1,
          false,
        );
        return {
          ...box,
          x: newX,
          width: endX - newX,
        };
      });

      // Update local state
      setBoundingBoxes(resolvedBoxesWithPixelCoords);

      // Add to history for undo
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(resolvedBoxesWithPixelCoords);
      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
      }
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);

      // Clear conflicts and highlighting
      setConflicts([]);
      setHighlightConflicts(false);

      // CRITICAL FIX: Save the resolved boxes to the backend before navigating
      const loadingToastId = toast.loading(`Saving ${activeConflicts.length} resolved conflict${activeConflicts.length > 1 ? "s" : ""}...`);

      const saved = await saveAnnotations(recording?.id, resolvedBoxesWithPixelCoords, false);

      if (saved) {
        toast.success(`Resolved and saved ${activeConflicts.length} conflict${activeConflicts.length > 1 ? "s" : ""}!`, { id: loadingToastId });
        // Proceed with navigation after successfully saving
        proceedNavigation();
      } else {
        toast.error("Failed to save resolved conflicts. Please try again.", { id: loadingToastId });
        // Don't navigate if save failed
        cancelNavigation();
      }
    } catch (error) {
      console.error("Error resolving conflicts:", error);
      toast.error("Failed to resolve conflicts. Please try again.");
      cancelNavigation();
    }
  };

  const handleStayAndFix = () => {
    // Cancel navigation and stay on page
    cancelNavigation();

    // Highlight the conflicts for manual fixing
    setConflicts(navigationConflicts);
    setHighlightConflicts(true);

    toast.error(
      `${navigationConflicts.length} conflict${navigationConflicts.length > 1 ? "s" : ""} detected. Please fix manually before leaving.`
    );
  };

  const handleDiscardAndContinue = () => {
    // User chose to leave with unresolved conflicts (unsafe)
    toast.error(
      "Warning: Leaving with unresolved conflicts. Data may not be saved correctly."
    );

    // Proceed with navigation anyway
    proceedNavigation();
  };

  // Throttled mouse wheel zoom handler with cursor-centered zooming
  const handleWheelZoom = useMemo(
    () =>
      throttle((event: WheelEvent) => {
        // Always prevent default to stop page scrolling when over the editor
        event.preventDefault();
        event.stopPropagation();

        // Only zoom if cursor is over the spectrogram
        const target = event.currentTarget as HTMLElement;
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const isOverSpectrogram =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;

        if (!isOverSpectrogram || !spectrogramDimensions.width) return;

        // Use requestAnimationFrame for smooth updates
        requestAnimationFrame(() => {
          // Calculate zoom factor based on wheel delta
          const zoomSpeed = 0.002;
          const delta = -event.deltaY * zoomSpeed;
          const zoomFactor = Math.exp(delta);

          // Calculate new zoom level with limits (dynamic based on duration)
          const newZoom = Math.max(1, Math.min(maxZoomLevel, zoomLevel * zoomFactor));

          if (newZoom === zoomLevel) return;

          // Get cursor position relative to spectrogram container
          const cursorX =
            event.clientX - rect.left - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const cursorY = event.clientY - rect.top;

          // Get current scroll position
          const currentScrollLeft = unifiedScrollRef.current?.scrollLeft || 0;

          // Calculate world coordinates at cursor position (horizontal only)
          // World position = (cursor position in viewport + scroll offset) / current zoom
          const worldX = (cursorX + currentScrollLeft) / zoomLevel;

          // Calculate new offset to keep cursor position fixed (horizontal only)
          // New scroll = world position * new zoom - cursor position in viewport
          const newOffsetX = Math.max(0, worldX * newZoom - cursorX);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const newOffsetY = 0; // No vertical zoom/offset

          // Apply zoom and offset
          setZoomLevel(newZoom);
          setZoomOffset({ x: 0, y: 0 }); // Reset zoom offset, use scroll only

          // Update horizontal scroll to keep cursor position fixed
          if (unifiedScrollRef.current) {
            unifiedScrollRef.current.scrollLeft = newOffsetX;
          }

          // PERF: Hide labels during active zooming, show after 150ms of inactivity
          setIsActivelyZooming(true);
          if (zoomDebounceRef.current) {
            clearTimeout(zoomDebounceRef.current);
          }
          zoomDebounceRef.current = setTimeout(() => {
            setIsActivelyZooming(false);
          }, 150);

          // No need to update WaveSurfer zoom - container width handles it
          // WaveSurfer will automatically adjust to the new container width
        });
      }, 16), // 60 FPS throttle
    [zoomLevel, spectrogramDimensions.width, maxZoomLevel],
  );

  // Clean up throttled function and zoom debounce on unmount
  useEffect(() => {
    return () => {
      handleWheelZoom.cancel?.();
      if (zoomDebounceRef.current) {
        clearTimeout(zoomDebounceRef.current);
      }
    };
  }, [handleWheelZoom]);

  // Throttled scroll handler for performance
  const handleScrollOptimized = useMemo(
    () =>
      throttle((e: React.UIEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        // Store actual pixel scroll position, not percentage
        const actualScrollLeft = target.scrollLeft;
        const verticalScrollPercentage =
          target.scrollHeight > target.clientHeight
            ? (target.scrollTop / (target.scrollHeight - target.clientHeight)) *
              100
            : 0;

        // Update scroll states - use pixels for horizontal
        setScrollOffset(actualScrollLeft);
        setVerticalScrollOffset(verticalScrollPercentage);

        // Update visible bounds with requestAnimationFrame for smoothness
        requestAnimationFrame(() => {
          const bounds = calculateVisibleBounds();
          const visible = boundingBoxes.filter((box) => {
            return box.x < bounds.right && box.x + box.width > bounds.left;
          });
          setVisibleBoundingBoxes(visible);
        });
      }, 16), // 60 FPS throttle
    [boundingBoxes, calculateVisibleBounds],
  );

  // Clean up scroll throttled function
  useEffect(() => {
    return () => {
      handleScrollOptimized.cancel?.();
    };
  }, [handleScrollOptimized]);

  // Attach wheel event listener with passive: false to prevent scrolling
  useEffect(() => {
    const scrollContainer = unifiedScrollRef.current;
    if (!scrollContainer) return;

    const wheelHandler = (event: WheelEvent) => {
      // Check if the cursor is over the scrollable area
      const rect = scrollContainer.getBoundingClientRect();
      const isOverContainer =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (isOverContainer) {
        handleWheelZoom(event);
      }
    };

    // Add event listener with passive: false
    scrollContainer.addEventListener("wheel", wheelHandler, { passive: false });

    // Cleanup
    return () => {
      scrollContainer.removeEventListener("wheel", wheelHandler);
    };
  }, [handleWheelZoom]);

  // Quick label handler for A-Z keys
  const handleQuickLabel = (label: string) => {
    const updatedBoxes = [...boundingBoxes];
    let updateCount = 0;

    selectedBoxes.forEach((index) => {
      if (updatedBoxes[index]) {
        updatedBoxes[index] = { ...updatedBoxes[index], label };
        updateCount++;
      }
    });

    if (updateCount > 0) {
      // Track the last used label (excluding "None") for consistency with other label assignment methods
      if (label && label !== "None") {
        setLastUsedLabel(label);
      }

      setBoundingBoxes(updatedBoxes);
      toast.success(
        `Label "${label}" assigned to ${updateCount} box${updateCount > 1 ? "es" : ""}`,
      );
      setHasUnsavedChanges(true);
    }
  };

  // Custom label handler for multiple boxes
  const handleCustomLabel = () => {
    if (selectedBoxes.size > 0) {
      setShowCustomLabelInput(true);
    }
  };

  const applyCustomLabel = () => {
    if (customLabelInput.trim()) {
      const updatedBoxes = [...boundingBoxes];
      let updateCount = 0;
      const trimmedLabel = customLabelInput.trim();

      selectedBoxes.forEach((index) => {
        if (updatedBoxes[index]) {
          updatedBoxes[index] = {
            ...updatedBoxes[index],
            label: trimmedLabel,
          };
          updateCount++;
        }
      });

      if (updateCount > 0) {
        // Track the last used label (excluding "None") for consistency with other label assignment methods
        if (trimmedLabel && trimmedLabel !== "None") {
          setLastUsedLabel(trimmedLabel);
        }

        setBoundingBoxes(updatedBoxes);
        toast.success(
          `Label "${trimmedLabel}" assigned to ${updateCount} box${updateCount > 1 ? "es" : ""}`,
        );
        setHasUnsavedChanges(true);
      }
    }
    setShowCustomLabelInput(false);
    setCustomLabelInput("");
  };

  // Play segment handler
  const playSegment = (box: BoundingBox) => {
    if (
      wavesurferRef.current &&
      box.start_time !== undefined &&
      box.end_time !== undefined
    ) {
      wavesurferRef.current.seekTo(box.start_time / duration);
      wavesurferRef.current.play();

      // Set up timer to stop at segment end
      const checkInterval = setInterval(() => {
        if (wavesurferRef.current) {
          const currentTime = wavesurferRef.current.getCurrentTime();
          if (currentTime >= box.end_time!) {
            wavesurferRef.current.pause();
            clearInterval(checkInterval);
          }
        }
      }, 50);

      // Clear interval if playback is paused manually
      const pauseHandler = () => {
        clearInterval(checkInterval);
      };

      wavesurferRef.current.once("pause", pauseHandler);
    }
  };

  // Export handler - commented out for future use
  // const handleExport = () => {
  //   const exportData = {
  //     recording: {
  //       id: recording?.id,
  //       filename: recording?.original_filename,
  //       duration: duration,
  //       sample_rate: recording?.sample_rate,
  //     },
  //     annotations: boundingBoxes.map((box, index) => ({
  //       id: index,
  //       label: box.label || 'None',
  //       start_time: box.start_time,
  //       end_time: box.end_time,
  //       min_frequency: box.min_frequency,
  //       max_frequency: box.max_frequency,
  //       duration_ms: ((box.end_time || 0) - (box.start_time || 0)) * 1000,
  //     })),
  //     export_date: new Date().toISOString(),
  //   };
  //
  //   // Export as JSON
  //   const jsonBlob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  //   const jsonUrl = URL.createObjectURL(jsonBlob);
  //   const jsonLink = document.createElement('a');
  //   jsonLink.href = jsonUrl;
  //   jsonLink.download = `${recording?.original_filename || 'annotations'}_${Date.now()}.json`;
  //   jsonLink.click();
  //   URL.revokeObjectURL(jsonUrl);
  //
  //   // Export as CSV
  //   const csvHeader = 'Label,Start Time (s),End Time (s),Duration (ms),Min Frequency (Hz),Max Frequency (Hz)\n';
  //   const csvRows = boundingBoxes.map(box =>
  //     `${box.label || 'None'},${box.start_time?.toFixed(3)},${box.end_time?.toFixed(3)},${(((box.end_time || 0) - (box.start_time || 0)) * 1000).toFixed(1)},${box.min_frequency?.toFixed(1)},${box.max_frequency?.toFixed(1)}`
  //   ).join('\n');
  //   const csvBlob = new Blob([csvHeader + csvRows], { type: 'text/csv' });
  //   const csvUrl = URL.createObjectURL(csvBlob);
  //   const csvLink = document.createElement('a');
  //   csvLink.href = csvUrl;
  //   csvLink.download = `${recording?.original_filename || 'annotations'}_${Date.now()}.csv`;
  //   csvLink.click();
  //   URL.revokeObjectURL(csvUrl);
  //
  //   toast.success('Annotations exported as JSON and CSV');
  // };

  // Calculate and update segment duration when selection changes
  useEffect(() => {
    if (selectedBoxes.size === 1) {
      const boxIndex = Array.from(selectedBoxes)[0];
      const box = boundingBoxes[boxIndex];
      if (box && box.start_time !== undefined && box.end_time !== undefined) {
        setSegmentDuration((box.end_time - box.start_time) * 1000); // Convert to milliseconds
      }
    } else if (drawingBox && duration > 0) {
      const startTime = CoordinateUtils.pixelToTime(
        Math.min(drawingBox.x, drawingBox.x + drawingBox.width),
        duration,
        spectrogramDimensions.width,
        1,
        false,
      );
      const endTime = CoordinateUtils.pixelToTime(
        Math.max(drawingBox.x, drawingBox.x + drawingBox.width),
        duration,
        spectrogramDimensions.width,
        1,
        false,
      );
      setSegmentDuration((endTime - startTime) * 1000);
    } else {
      setSegmentDuration(null);
    }
  }, [
    selectedBoxes,
    boundingBoxes,
    drawingBox,
    spectrogramDimensions,
    duration,
  ]);

  const getLabelColor = (label: string) => {
    let colorIndex = labelColorMap.get(label);

    if (colorIndex === undefined) {
      // Assign next available color index
      const usedIndices = new Set(labelColorMap.values());
      let nextIndex = 1; // Start from 1 (0 is reserved for "None")

      while (usedIndices.has(nextIndex) && nextIndex < LABEL_COLORS.length) {
        nextIndex++;
      }

      // If all colors are used, cycle back
      if (nextIndex >= LABEL_COLORS.length) {
        nextIndex = 1 + (labelColorMap.size % (LABEL_COLORS.length - 1));
      }

      const newMap = new Map(labelColorMap);
      newMap.set(label, nextIndex);
      setLabelColorMap(newMap);
      colorIndex = nextIndex;
    }

    return LABEL_COLORS[colorIndex] || LABEL_COLORS[0];
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-50 overflow-hidden">
      {/* Simplified Header */}
      <div
        className="bg-white shadow-sm border-b border-gray-200 px-4 py-1 flex-shrink-0"
        style={{ height: "40px" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={() =>
                pauseAndNavigate(
                  recording ? `/projects/${recording.project_id}` : "/projects",
                )
              }
              className="p-1 rounded-md hover:bg-gray-100"
              title="Back to Project"
            >
              <ArrowLeftIcon className="h-4 w-4 text-gray-500" />
            </button>

            {/* Recording Navigation */}
            <div className="flex items-center space-x-1">
              <button
                onClick={() => navigateToRecording(currentRecordingIndex - 1)}
                disabled={currentRecordingIndex === 0}
                className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Previous recording (←)"
              >
                <ChevronLeftIcon className="h-4 w-4 text-gray-600" />
              </button>

              <div className="text-xs text-gray-600">
                <span className="font-medium">{currentRecordingIndex + 1}</span>
                <span className="text-gray-400">/</span>
                <span className="font-medium">
                  {totalProjectRecordings || projectRecordings.length}
                </span>
              </div>

              <button
                onClick={() => navigateToRecording(currentRecordingIndex + 1)}
                disabled={
                  currentRecordingIndex === projectRecordings.length - 1
                }
                className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Next recording (→)"
              >
                <ChevronRightIcon className="h-4 w-4 text-gray-600" />
              </button>
            </div>

            {recording && (
              <div className="flex items-center space-x-3">
                <div className="text-sm text-gray-700 max-w-[300px] truncate">
                  <span
                    className="font-medium"
                    title={recording.original_filename}
                  >
                    {recording.original_filename}
                  </span>
                </div>

                {/* Modern toggle switch for Finished status */}
                <button
                  onClick={async () => {
                    try {
                      const updatedRecording = await recordingService.toggleFinished(recording.id);
                      setRecording(updatedRecording);
                      toast.success(
                        updatedRecording.is_finished
                          ? "Recording marked as finished"
                          : "Recording unmarked as finished"
                      );
                    } catch (error) {
                      console.error("Failed to toggle finished status:", error);
                      toast.error("Failed to update finished status");
                    }
                  }}
                  className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 ${
                    recording.is_finished ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                  title={recording.is_finished ? "Mark as unfinished" : "Mark as finished"}
                >
                  <span
                    className={`inline-block w-4 h-4 transform transition-transform duration-200 ease-in-out bg-white rounded-full shadow-lg ${
                      recording.is_finished ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className={`text-xs font-medium transition-colors ${
                  recording.is_finished ? 'text-green-700' : 'text-gray-500'
                }`}>
                  Finished
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {/* Enhanced save status display */}
            <div className="flex items-center space-x-2">
              {/* Save button */}
              <button
                onClick={handleSaveAnnotations}
                disabled={isSaving || isAutoSaving || !hasUnsavedChanges}
                className={`px-3 py-1.5 text-sm font-medium text-white rounded-md transition-colors flex items-center space-x-1 ${
                  hasUnsavedChanges && !isSaving && !isAutoSaving
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-gray-400 cursor-not-allowed"
                }`}
              >
                {(isSaving || isAutoSaving) && (
                  <svg
                    className="animate-spin -ml-1 mr-1 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                )}
                <span>
                  {isSaving
                    ? "Saving..."
                    : isAutoSaving
                      ? "Auto-saving..."
                      : hasUnsavedChanges
                        ? "Save"
                        : "Save"}
                </span>
              </button>

              {/* Save status indicator */}
              <div className="text-xs text-gray-600 min-w-0">
                {isAutoSaving ? (
                  <span className="text-blue-600">Auto-saving...</span>
                ) : isSaving ? (
                  <span className="text-blue-600">Saving...</span>
                ) : hasUnsavedChanges ? (
                  <span className="text-yellow-600">Unsaved changes</span>
                ) : lastSaveTime ? (
                  <span className="text-green-600">
                    Saved {formatTimestamp(lastSaveTime)}
                  </span>
                ) : (
                  <span className="text-gray-500">No changes</span>
                )}
                {saveError && (
                  <div
                    className="text-red-600 truncate max-w-48"
                    title={saveError}
                  >
                    Save failed
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
        {/* Editor Area - Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Unified Spectrogram and Waveform Container */}
          <div className="flex-1 relative bg-white border-l border-r border-b border-gray-300 overflow-hidden">
            {/* Scales */}
            {spectrogramUrl && duration > 0 && (
              <SpectrogramScales
                width={spectrogramDimensions.width}
                height={spectrogramDimensions.height}
                duration={duration}
                maxFrequency={getNyquistFrequency()}
                zoomLevel={zoomLevel}
                scrollOffset={scrollOffset}
              />
            )}

            {/* Unified container with horizontal scroll only */}
            <div
              ref={unifiedScrollRef}
              className="absolute overflow-x-auto overflow-y-hidden"
              style={{
                top: 0,
                left: `${LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH}px`,
                right: 0,
                bottom: "30px",
                height: "calc(100% - 30px)",
              }}
              onScroll={handleScrollOptimized}
            >
              <div
                ref={canvasContainerRef}
                className="relative"
                style={{
                  width: `${CoordinateUtils.getZoomedContainerWidth(baseSpectrogramDimensions.width, zoomLevel)}px`,
                  height: "100%",
                }}
              >
                {/* Split view: 65% spectrogram, 8% timeline, 27% waveform */}
                {/* Spectrogram: 65% */}
                <div
                  className="absolute"
                  style={{
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "65%",
                  }}
                >
                  {spectrogramUrl ? (
                    <img
                      ref={spectrogramImgRef}
                      src={spectrogramUrl}
                      alt="Spectrogram"
                      className="absolute"
                      onError={(e) => {
                        console.error(
                          "Failed to load spectrogram image:",
                          spectrogramUrl,
                        );
                        toast.error("Failed to load spectrogram image");
                      }}
                      onLoad={() => {
                        console.log(
                          "Spectrogram loaded successfully:",
                          spectrogramUrl,
                        );
                      }}
                      style={{
                        top: "0",
                        left: `${LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH}px`, // Offset for frequency scale
                        width: `${CoordinateUtils.getZoomedContentWidth(baseSpectrogramDimensions.width, zoomLevel)}px`,
                        height: "100%",
                        objectFit: "fill", // Stretch to fill the exact space
                        pointerEvents: "none",
                        imageRendering:
                          zoomLevel > 3
                            ? "crisp-edges"
                            : zoomLevel > 1.5
                              ? "auto"
                              : "auto",
                        transform: `translate(-${zoomOffset.x}px, -${zoomOffset.y}px)`,
                        transformOrigin: "top left",
                        // Force GPU acceleration for smooth zooming
                        willChange: "transform",
                        backfaceVisibility: "hidden",
                        perspective: 1000,
                        filter: `contrast(${contrast})`,
                      }}
                    />
                  ) : (
                    <div
                      className="flex flex-col items-center justify-center w-full h-full bg-gray-50"
                      style={{
                        left: `${LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH}px`,
                        width: `calc(100% - ${LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH}px)`,
                      }}
                    >
                      {isLoadingSpectrogram ? (
                        <>
                          <LoadingSpinner size="sm" />
                          <p className="text-gray-600 mb-2">
                            {getSpectrogramStatusMessage() ||
                              "Loading spectrogram..."}
                          </p>
                        </>
                      ) : spectrogramError ? (
                        <div className="text-center">
                          <div className="text-red-500 mb-2">
                            ⚠️ Spectrogram Generation Failed
                          </div>
                          <p className="text-sm text-gray-600 mb-3">
                            {spectrogramError}
                          </p>
                          <button
                            onClick={() =>
                              loadSpectrogram(parseInt(recordingId!))
                            }
                            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                          >
                            Retry Generation
                          </button>
                        </div>
                      ) : (
                        <div className="text-center">
                          <p className="text-gray-500 mb-3">
                            Spectrogram not available
                          </p>
                          <button
                            onClick={() =>
                              loadSpectrogram(parseInt(recordingId!))
                            }
                            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                          >
                            Generate Spectrogram
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Timeline: 8% with white background and improved visibility */}
                <div
                  className="absolute bg-white border-t-2 border-b-2 border-gray-300"
                  style={{
                    top: "65%", // Start right after spectrogram
                    left: 0,
                    right: 0,
                    height: "8%",
                    overflow: "hidden",
                    zIndex: 10, // Ensure timeline is above spectrogram
                  }}
                >
                  <div
                    className="relative"
                    style={{
                      width: `${CoordinateUtils.getZoomedContentWidth(baseSpectrogramDimensions.width, zoomLevel)}px`,
                      height: "100%",
                      marginLeft: `${LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH}px`,
                    }}
                  >
                    <svg
                      width={CoordinateUtils.getZoomedContentWidth(
                        baseSpectrogramDimensions.width,
                        zoomLevel,
                      )}
                      height="100%"
                      className="absolute"
                      style={{
                        left: 0,
                        height: "100%",
                      }}
                    >
                      {duration > 0 &&
                        (() => {
                          const ticks = [];
                          const totalWidth =
                            CoordinateUtils.getZoomedContentWidth(
                              baseSpectrogramDimensions.width,
                              zoomLevel,
                            );
                          const containerHeight = Math.max(
                            48,
                            baseSpectrogramDimensions.height * 0.08,
                          );

                          // Use consistent interval calculation
                          const interval = getTimeTickInterval(
                            duration,
                            zoomLevel,
                          );

                          const numTicks = Math.ceil(duration / interval);

                          for (let i = 0; i <= numTicks; i++) {
                            const time = i * interval;
                            if (time <= duration) {
                              const position = (time / duration) * totalWidth;
                              const isMajor = i % (interval >= 5 ? 1 : 2) === 0;

                              ticks.push(
                                <g key={i}>
                                  <line
                                    x1={position}
                                    y1={0}
                                    x2={position}
                                    y2={
                                      isMajor
                                        ? containerHeight * 0.4
                                        : containerHeight * 0.25
                                    }
                                    stroke={
                                      isMajor
                                        ? AXIS_STYLES.TICK_MAJOR.stroke
                                        : AXIS_STYLES.TICK_MINOR.stroke
                                    }
                                    strokeWidth={
                                      isMajor
                                        ? AXIS_STYLES.TICK_MAJOR.strokeWidth
                                        : AXIS_STYLES.TICK_MINOR.strokeWidth
                                    }
                                  />
                                  {isMajor && (
                                    <text
                                      x={position}
                                      y={containerHeight * 0.75}
                                      textAnchor="middle"
                                      fontSize={AXIS_STYLES.TICK_LABEL.fontSize}
                                      fill={AXIS_STYLES.TICK_LABEL.fill}
                                      fontWeight={
                                        AXIS_STYLES.TICK_LABEL.fontWeight
                                      }
                                    >
                                      {formatTimeLabel(time)}
                                    </text>
                                  )}
                                </g>,
                              );
                            }
                          }

                          return ticks;
                        })()}
                    </svg>
                  </div>
                </div>

                {/* Waveform at bottom 27% - no separate scrolling */}
                <div
                  className="absolute bg-gradient-to-b from-gray-50 to-gray-100"
                  style={{
                    top: "73%", // Start right after timeline (65% + 8%)
                    left: 0,
                    right: 0,
                    height: "27%",
                  }}
                >
                  <div
                    className="absolute"
                    style={{
                      width: `${CoordinateUtils.getZoomedContentWidth(baseSpectrogramDimensions.width, zoomLevel)}px`, // Use base dimensions for fixed size
                      height: "100%",
                      position: "absolute",
                      top: 0,
                      left: `${LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH}px`, // Position at frequency scale offset
                      display: "block",
                    }}
                  >
                    {/* Waveform container - uses OptimizedWaveform for performance */}
                    {useOptimizedWaveform && audioUrl ? (
                      <div
                        style={{
                          width: `${(baseSpectrogramDimensions.width - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH) * zoomLevel}px`,
                          height: "100%",
                          position: "relative",
                        }}
                      >
                        {/* OptimizedWaveform stays at viewport position via transform */}
                        <div
                          style={{
                            width: viewportWidth,
                            height: "100%",
                            position: "absolute",
                            left: 0,
                            transform: `translateX(${scrollOffset}px)`,
                            willChange: "transform",
                          }}
                        >
                          <OptimizedWaveform
                            ref={optimizedWaveformRef}
                            audioUrl={audioUrl}
                            width={viewportWidth}
                            height={Math.max(50, spectrogramDimensions.height * 0.27)}
                            zoomLevel={zoomLevel}
                            scrollOffset={scrollOffset}
                            waveColor="#3B82F6"
                            progressColor="#1E40AF"
                            onReady={(dur) => {
                              setDuration(dur);
                            }}
                            onTimeUpdate={(time) => {
                              setCurrentTime(time);
                              // Update timeline cursor position
                              if (duration > 0) {
                                const relativePosition = time / duration;
                                const position = relativePosition * CoordinateUtils.getZoomedContentWidth(
                                  baseSpectrogramDimensions.width,
                                  zoomLevel
                                );
                                setTimelineCursorPosition(position);
                              }
                            }}
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                            onFinish={() => setIsPlaying(false)}
                            onSeek={(time) => {
                              setCurrentTime(time);
                              if (duration > 0) {
                                const relativePosition = time / duration;
                                const position = relativePosition * CoordinateUtils.getZoomedContentWidth(
                                  baseSpectrogramDimensions.width,
                                  zoomLevel
                                );
                                setTimelineCursorPosition(position);
                              }
                            }}
                            onClick={(time) => {
                              // Seek when clicking waveform
                              if (optimizedWaveformRef.current) {
                                optimizedWaveformRef.current.seekTo(time / duration);
                              }
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      /* Fallback to original WaveSurfer when audio not loaded or optimized disabled */
                      <div
                        ref={waveformRef}
                        id="waveform-container"
                        style={{
                          width: `${(baseSpectrogramDimensions.width - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH) * zoomLevel}px`,
                          height: "100%",
                          position: "relative",
                        }}
                      />
                    )}

                    {/* Bounding box projections on waveform - overlay on top of waveform */}
                    <svg
                      key={`waveform-mirrors-${baseSpectrogramDimensions.width}-${baseSpectrogramDimensions.height}`}
                      className="absolute top-0 left-0 pointer-events-none"
                      style={{
                        width: "100%",
                        height: "100%",
                        position: "absolute",
                        zIndex: 10, // Ensure it's above waveform
                      }}
                    >
                      {/* Render ALL boxes in waveform - it shows the full recording overview */}
                      {boundingBoxes.map((box, mapIndex) => {
                        const index = mapIndex;
                        const isSelected = selectedBoxes.has(index);
                        const labelColor = getLabelColor(box.label || "None");
                        // Calculate pixel positions for waveform boxes - use base dimensions for consistent positioning
                        const startX =
                          duration > 0
                            ? CoordinateUtils.timeToPixel(
                                box.start_time || 0,
                                duration,
                                baseSpectrogramDimensions.width, // Use base dimensions for consistent coordinates
                                zoomLevel,
                                false,
                              )
                            : 0;
                        const endX =
                          duration > 0
                            ? CoordinateUtils.timeToPixel(
                                box.end_time || 0,
                                duration,
                                baseSpectrogramDimensions.width, // Use base dimensions for consistent coordinates
                                zoomLevel,
                                false,
                              )
                            : 0;
                        const waveformHeight =
                          spectrogramDimensions.height *
                          LAYOUT_CONSTANTS.WAVEFORM_HEIGHT_RATIO; // Use viewport dimensions to match container

                        return (
                          <g key={`waveform_box_${index}`}>
                            {/* Selected box highlight background */}
                            {isSelected && (
                              <rect
                                x={Math.min(startX, endX)}
                                y="0"
                                width={Math.abs(endX - startX)}
                                height={waveformHeight}
                                fill="rgba(255, 215, 0, 0.1)"
                                stroke="none"
                              />
                            )}
                            {/* Start line */}
                            <line
                              x1={isNaN(startX) ? 0 : startX}
                              y1="0"
                              x2={isNaN(startX) ? 0 : startX}
                              y2={waveformHeight}
                              stroke={
                                isSelected ? "#FFD700" : labelColor.stroke
                              }
                              strokeWidth={isSelected ? 4 : 1}
                              opacity={isSelected ? 1 : 0.7}
                              strokeDasharray={undefined}
                            />
                            {/* End line */}
                            <line
                              x1={isNaN(endX) ? 0 : endX}
                              y1="0"
                              x2={isNaN(endX) ? 0 : endX}
                              y2={waveformHeight}
                              stroke={
                                isSelected ? "#FFD700" : labelColor.stroke
                              }
                              strokeWidth={isSelected ? 4 : 1}
                              opacity={isSelected ? 1 : 0.7}
                              strokeDasharray={undefined}
                            />
                            {/* Horizontal connector at top */}
                            <line
                              x1={isNaN(startX) ? 0 : startX}
                              y1="2"
                              x2={isNaN(endX) ? 0 : endX}
                              y2="2"
                              stroke={
                                isSelected ? "#FFD700" : labelColor.stroke
                              }
                              strokeWidth={isSelected ? 4 : 1}
                              opacity={isSelected ? 1 : 0.7}
                              strokeDasharray={undefined}
                            />
                            {/* Fill area */}
                            <rect
                              x={isNaN(startX) ? 0 : startX}
                              y="0"
                              width={
                                isNaN(endX - startX) || endX - startX < 0
                                  ? 0
                                  : endX - startX
                              }
                              height={waveformHeight}
                              fill={
                                isSelected
                                  ? "rgba(255, 215, 0, 0.3)"
                                  : labelColor.fill
                              }
                              opacity={isSelected ? 0.5 : 0.3}
                            />
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              </div>

              {/* Optimized Canvas for annotations and cursor - moved inside scroll container */}
              {/* Stage is limited to spectrogram area (65%) and scales vertically with viewport */}
              <Stage
                width={CoordinateUtils.getZoomedContentWidth(
                  baseSpectrogramDimensions.width,
                  zoomLevel,
                )} // Full zoomed width for proper event handling
                height={
                  spectrogramDimensions.height *
                  LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO
                } // Match spectrogram area height (65% of viewport)
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onContextMenu={handleContextMenu}
                ref={stageRef}
                x={0} // No x offset needed - Stage is relative to container
                y={-zoomOffset.y} // Keep vertical offset for consistency
                scaleX={1}
                scaleY={
                  (spectrogramDimensions.height *
                    LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO) /
                  (baseSpectrogramDimensions.height *
                    LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO)
                } // Scale boxes vertically when viewport changes
                listening={true}
                pixelRatio={OPTIMIZED_PIXEL_RATIO} // PERF: Limit pixel ratio for high zoom performance
                style={{
                  position: "absolute",
                  top: "0",
                  left: `${Math.round(LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH)}px`,
                  cursor: stageCursor, // Performance: Use memoized cursor
                }}
              >
                {/* Static layer for selection rectangle - cached */}
                <Layer listening={false} cache={false} clearBeforeDraw={true}>
                  {/* Selection rectangle - apply horizontal zoom only */}
                  {selectionRect && (
                    <Rect
                      x={
                        Math.min(
                          selectionRect.x,
                          selectionRect.x + selectionRect.width,
                        ) * zoomLevel
                      }
                      y={
                        Math.min(
                          selectionRect.y,
                          selectionRect.y + selectionRect.height,
                        )
                      }
                      width={Math.abs(selectionRect.width) * zoomLevel}
                      height={Math.abs(selectionRect.height)}
                      fill="rgba(59, 130, 246, 0.1)"
                      stroke="#3B82F6"
                      strokeWidth={1}
                      dash={[5, 5]}
                      perfectDrawEnabled={false}
                      listening={false}
                    />
                  )}
                </Layer>

                {/* Dynamic layer for bounding boxes - optimized */}
                <Layer listening={true} clearBeforeDraw={true}>
                  {/* Optimized Bounding boxes - only render visible boxes */}
                  {transformedBoxes.map((transformedBox, index) => {
                    // const originalIndex = visibleBoundingBoxes.indexOf(transformedBox); // Unused
                    const globalIndex = transformedBox.originalIndex;
                    const isSelected = selectedBoxes.has(globalIndex);
                    const isSingleSelected =
                      selectedBox && boundingBoxes[globalIndex] === selectedBox;
                    const labelColor = transformedBox.color;

                    // Check if this box is involved in any conflicts (O(1) lookup)
                    const isInConflict = conflictingBoxIndices.has(globalIndex);

                    // Use transformed coordinates for better performance
                    const scaledBox = {
                      x: transformedBox.screenX,
                      y: transformedBox.screenY,
                      width: transformedBox.screenWidth,
                      height: transformedBox.screenHeight,
                    };

                    // Use label color as base, but modify for selection states
                    let strokeColor = labelColor.stroke;
                    let fillColor = labelColor.fill;
                    // LOD: Use thinner stroke for small boxes
                    let strokeWidth = scaledBox.width < 30 ? 1 : 2;
                    let shadowBlur = 0;
                    let shadowColor = "transparent";
                    let dashArray: number[] | undefined = undefined;

                    // Conflict highlighting takes precedence over selection
                    if (isInConflict) {
                      strokeWidth = 3;
                      strokeColor = "#FF4500"; // Orange-red for conflicts
                      fillColor = "rgba(255, 69, 0, 0.2)"; // Semi-transparent orange-red
                      shadowBlur = 15;
                      shadowColor = "rgba(255, 69, 0, 0.8)"; // Orange glow
                      dashArray = [8, 4]; // Dashed line to indicate problem
                    } else if (isSelected || isSingleSelected) {
                      strokeWidth = 1.5; // Thin stroke for precision work
                      shadowBlur = 0; // No shadow - clean dashed stroke only
                      shadowColor = "transparent";
                      dashArray = [8, 4]; // Dashed line to indicate selection
                      // Use much brighter version of the same label color for selection
                      fillColor = "rgba(255, 215, 0, 0.25)"; // Golden fill for selected boxes
                      // Make stroke bright golden for maximum contrast
                      strokeColor = "#FFD700"; // Gold color for selected boxes
                    }

                    return (
                      <Group
                        key={
                          globalIndex >= 0 ? globalIndex : `visible_${index}`
                        }
                      >
                        <Rect
                          x={scaledBox.x}
                          y={scaledBox.y}
                          width={scaledBox.width}
                          height={scaledBox.height}
                          stroke={strokeColor}
                          strokeWidth={strokeWidth}
                          fill={fillColor}
                          shadowBlur={shadowBlur}
                          shadowColor={shadowColor}
                          dash={dashArray}
                          perfectDrawEnabled={false}
                          shadowForStrokeEnabled={false}
                          onContextMenu={(e) => {
                            e.evt.preventDefault();
                            e.cancelBubble = true;

                            // Show context menu without selecting the box
                            // The context menu will operate on the clicked box directly
                            setContextMenu({
                              x: e.evt.clientX,
                              y: e.evt.clientY,
                              boxIndex: globalIndex,
                            });
                          }}
                        />

                        {/* Label text - LOD: only show when box is large enough (>= 50px width) and not actively zooming */}
                        {scaledBox.width >= 50 && !isActivelyZooming && (
                          <>
                            {/* Background for label */}
                            <Rect
                              x={scaledBox.x}
                              y={Math.max(5, scaledBox.y - 20)}
                              width={Math.min(
                                scaledBox.width,
                                transformedBox.labelWidth,
                              )}
                              height={18}
                              fill={`rgba(0, 0, 0, ${transformedBox.label && transformedBox.label !== "None" ? 0.8 : 0.6})`}
                              cornerRadius={3}
                              listening={false}
                              perfectDrawEnabled={false}
                            />
                            {/* Label text */}
                            <Text
                              x={scaledBox.x + 4}
                              y={Math.max(10, scaledBox.y - 15)}
                              text={transformedBox.label || "None"}
                              fill={
                                transformedBox.label &&
                                transformedBox.label !== "None"
                                  ? "white"
                                  : "#cbd5e1"
                              }
                              fontSize={12}
                              fontFamily="Inter, system-ui, sans-serif"
                              fontStyle={
                                !transformedBox.label ||
                                transformedBox.label === "None"
                                  ? "italic"
                                  : "normal"
                              }
                              listening={false}
                            />
                          </>
                        )}

                        {/* Resize handles - LOD: only show when box is large enough (>= 30px) */}
                        {(isSingleSelected || isSelected) &&
                          !isAnnotationMode &&
                          scaledBox.width >= 30 && (
                            <>
                              {/* Corner handles - smaller for precision */}
                              <Circle
                                x={scaledBox.x}
                                y={scaledBox.y}
                                radius={4}
                                fill="#FFD700"
                                stroke="white"
                                strokeWidth={2}
                                listening={false}
                              />
                              <Circle
                                x={scaledBox.x + scaledBox.width}
                                y={scaledBox.y}
                                radius={4}
                                fill="#FFD700"
                                stroke="white"
                                strokeWidth={2}
                                listening={false}
                              />
                              <Circle
                                x={scaledBox.x}
                                y={scaledBox.y + scaledBox.height}
                                radius={4}
                                fill="#FFD700"
                                stroke="white"
                                strokeWidth={2}
                                listening={false}
                              />
                              <Circle
                                x={scaledBox.x + scaledBox.width}
                                y={scaledBox.y + scaledBox.height}
                                radius={4}
                                fill="#FFD700"
                                stroke="white"
                                strokeWidth={2}
                                listening={false}
                              />
                            </>
                          )}
                      </Group>
                    );
                  })}

                  {/* Drawing box - scale to spectrogram area */}
                  {drawingBox && (
                    <Rect
                      x={
                        isNaN(drawingBox.x) || isNaN(drawingBox.width)
                          ? 0
                          : (drawingBox.width < 0
                              ? drawingBox.x + drawingBox.width
                              : drawingBox.x) * zoomLevel
                      }
                      y={
                        isNaN(drawingBox.y) || isNaN(drawingBox.height)
                          ? 0
                          : drawingBox.height < 0
                            ? drawingBox.y + drawingBox.height
                            : drawingBox.y
                      }
                      width={
                        isNaN(drawingBox.width)
                          ? 0
                          : Math.abs(drawingBox.width || 0) * zoomLevel
                      }
                      height={
                        isNaN(drawingBox.height)
                          ? 0
                          : Math.abs(drawingBox.height || 0)
                      }
                      stroke="#10B981"
                      strokeWidth={2}
                      fill="transparent"
                      dash={[5, 5]}
                      perfectDrawEnabled={false}
                      listening={false}
                    />
                  )}

                  {/* Bottom line (frequency boundary) - only render within spectrogram area */}
                  {bottomLine.isActive && bottomLine.pixelY !== null && (() => {
                    const spectrogramHeight = baseSpectrogramDimensions.height * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO;
                    // Only render if pixelY is within spectrogram bounds
                    if (bottomLine.pixelY >= 0 && bottomLine.pixelY <= spectrogramHeight) {
                      return (
                        <>
                          <Line
                            points={[
                              0,
                              bottomLine.pixelY,
                              CoordinateUtils.getZoomedContentWidth(
                                baseSpectrogramDimensions.width,
                                zoomLevel
                              ),
                              bottomLine.pixelY,
                            ]}
                            stroke="#3B82F6"
                            strokeWidth={3}
                            dash={[10, 5]}
                            listening={false}
                          />
                          {/* Frequency label for bottom line */}
                          <Group
                            x={10}
                            y={bottomLine.pixelY - 25}
                            draggable={true}
                            onDragStart={() => {
                              setIsDraggingBottomLine(true);
                            }}
                            onDragMove={(e) => {
                              const stage = e.target.getStage();
                              if (!stage) return;

                              const group = e.target;
                              const newY = group.y() + 25; // Offset because label is above the line

                              // Constrain to spectrogram bounds
                              const spectrogramHeight = baseSpectrogramDimensions.height * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO;
                              const constrainedY = Math.max(0, Math.min(newY, spectrogramHeight));

                              // Calculate frequency from pixel position
                              const nyquistFreq = getNyquistFrequency();
                              const frequency = CoordinateUtils.pixelToFrequency(
                                constrainedY,
                                nyquistFreq,
                                spectrogramHeight
                              );

                              // Update bottom line position
                              setBottomLineAtPixel(constrainedY, frequency);

                              // Reset group position (since we're updating via setBottomLineAtPixel)
                              group.position({ x: 10, y: constrainedY - 25 });
                            }}
                            onDragEnd={() => {
                              setIsDraggingBottomLine(false);
                            }}
                            onMouseEnter={(e) => {
                              const container = e.target.getStage()?.container();
                              if (container) {
                                container.style.cursor = 'grab';
                              }
                            }}
                            onMouseLeave={(e) => {
                              const container = e.target.getStage()?.container();
                              if (container && !isDraggingBottomLine) {
                                container.style.cursor = 'default';
                              }
                            }}
                          >
                            <Rect
                              width={120}
                              height={20}
                              fill="#3B82F6"
                              cornerRadius={4}
                              perfectDrawEnabled={false}
                            />
                            <Text
                              text={`Bottom: ${Math.round(bottomLine.frequency || 0)} Hz`}
                              fontSize={12}
                              fill="white"
                              fontStyle="bold"
                              padding={4}
                              align="center"
                              width={120}
                            />
                          </Group>
                        </>
                      );
                    }
                    return null;
                  })()}

                  {/* Distance measurement overlay (Alt + Hover feature) - Vertical dashed lines */}
                  {distanceMeasurement && (
                    <Group listening={false}>
                      {/* Left vertical dashed line */}
                      <Line
                        points={[
                          distanceMeasurement.leftBracket.x * zoomLevel,
                          distanceMeasurement.leftBracket.yTop,
                          distanceMeasurement.leftBracket.x * zoomLevel,
                          distanceMeasurement.leftBracket.yBottom,
                        ]}
                        stroke="#8B5CF6"
                        strokeWidth={2}
                        dash={[8, 4]}
                        lineCap="round"
                        listening={false}
                      />

                      {/* Right vertical dashed line */}
                      <Line
                        points={[
                          distanceMeasurement.rightBracket.x * zoomLevel,
                          distanceMeasurement.rightBracket.yTop,
                          distanceMeasurement.rightBracket.x * zoomLevel,
                          distanceMeasurement.rightBracket.yBottom,
                        ]}
                        stroke="#8B5CF6"
                        strokeWidth={2}
                        dash={[8, 4]}
                        lineCap="round"
                        listening={false}
                      />

                      {/* Horizontal connector line at y-axis center */}
                      <Line
                        points={[
                          distanceMeasurement.leftBracket.x * zoomLevel,
                          distanceMeasurement.horizontalLineY,
                          distanceMeasurement.rightBracket.x * zoomLevel,
                          distanceMeasurement.horizontalLineY,
                        ]}
                        stroke="#8B5CF6"
                        strokeWidth={2}
                        listening={false}
                      />

                      {/* Distance label */}
                      <Group
                        x={
                          ((distanceMeasurement.leftBracket.x +
                            distanceMeasurement.rightBracket.x) /
                            2) *
                          zoomLevel
                        }
                        y={distanceMeasurement.horizontalLineY - 12}
                        listening={false}
                      >
                        <Rect
                          x={-40}
                          y={-12}
                          width={80}
                          height={24}
                          fill="rgba(139, 92, 246, 0.95)"
                          cornerRadius={4}
                          listening={false}
                          perfectDrawEnabled={false}
                        />
                        <Text
                          text={`${Math.round(distanceMeasurement.distanceMs)} ms`}
                          fontSize={13}
                          fill="white"
                          fontStyle="bold"
                          align="center"
                          verticalAlign="middle"
                          width={80}
                          x={-40}
                          y={-7}
                          listening={false}
                        />
                      </Group>
                    </Group>
                  )}

                  {/* Cursor line only for spectrogram area */}
                  {duration > 0 && (
                    <Line
                      points={[
                        timelineCursorPosition, // Already in zoomed coordinates
                        0,
                        timelineCursorPosition, // Already in zoomed coordinates
                        baseSpectrogramDimensions.height *
                          LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO, // World space height (will be scaled by Stage scaleY)
                      ]}
                      stroke="#EF4444"
                      strokeWidth={2}
                      listening={false}
                    />
                  )}
                </Layer>
              </Stage>
            </div>

            {/* Integrated Playback Controls - inside the unified frame */}
            <div
              className="absolute bottom-0 left-0 right-0 bg-gray-50 border-t border-gray-300 flex items-center px-3"
              style={{ height: "30px", zIndex: 10 }}
            >
              <div className="flex items-center space-x-3">
                <button
                  onClick={handlePlayPause}
                  className="p-1 rounded-full bg-blue-600 hover:bg-blue-700 transition-colors"
                  title="Play/Pause (Space)"
                >
                  {isPlaying ? (
                    <PauseIcon className="h-4 w-4 text-white" />
                  ) : (
                    <PlayIcon className="h-4 w-4 text-white" />
                  )}
                </button>

                <button
                  onClick={cyclePlaybackSpeed}
                  className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 hover:bg-blue-200 text-blue-700 transition-colors"
                  title="Playback speed (click to cycle)"
                >
                  {playbackSpeed}×
                </button>

                {/* Spectrogram Status Indicator */}
                {(spectrogramStatus === "processing" ||
                  spectrogramStatus === "pending" ||
                  spectrogramStatus === "timeout") && (
                  <div className="flex items-center space-x-2 ml-6">
                    {spectrogramStatus !== "timeout" && (
                      <LoadingSpinner size="sm" />
                    )}
                    <span
                      className={`text-xs ${
                        spectrogramStatus === "timeout"
                          ? "text-red-600"
                          : "text-blue-600"
                      }`}
                    >
                      {spectrogramStatus === "processing"
                        ? "Generating..."
                        : spectrogramStatus === "pending"
                          ? "Queued..."
                          : spectrogramStatus === "timeout"
                            ? "Timed out"
                            : ""}
                    </span>
                  </div>
                )}

                {/* Add retry button for failed/timeout states */}
                {(spectrogramStatus === "failed" ||
                  spectrogramStatus === "timeout") && (
                  <button
                    onClick={() => loadSpectrogram(parseInt(recordingId!))}
                    className="ml-4 px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                  >
                    Retry Generation
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Vertical Toolbar */}
        <div
          className="bg-white border-l border-gray-200 flex flex-col items-center py-2 gap-1 flex-shrink-0"
          style={{ width: "56px" }}
        >
          {/* Undo/Redo */}
          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed group"
            title="Undo (Ctrl+Z)"
          >
            <ArrowUturnLeftIcon className="h-5 w-5 text-gray-600" />
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed group"
            title="Redo (Ctrl+Y)"
          >
            <ArrowUturnRightIcon className="h-5 w-5 text-gray-600" />
          </button>

          {/* Divider */}
          <div className="w-8 h-px bg-gray-300 my-2"></div>

          {/* Zoom controls */}
          <button
            onClick={handleZoomIn}
            className="p-2 rounded-md hover:bg-gray-100 group"
            title="Zoom In (Ctrl+=)"
          >
            <MagnifyingGlassPlusIcon className="h-5 w-5 text-gray-600" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 rounded-md hover:bg-gray-100 group"
            title="Zoom Out (Ctrl+-)"
          >
            <MagnifyingGlassMinusIcon className="h-5 w-5 text-gray-600" />
          </button>
          <button
            onClick={handleZoomReset}
            className="p-2 rounded-md hover:bg-gray-100 group"
            title="Reset View (Ctrl+0)"
          >
            <ArrowsPointingOutIcon className="h-5 w-5 text-gray-600" />
          </button>

          {isEditingZoom ? (
            <input
              type="text"
              value={zoomInputValue}
              onChange={handleZoomInputChange}
              onBlur={handleZoomInputConfirm}
              onKeyDown={handleZoomInputKeyDown}
              className="w-12 text-xs text-gray-700 px-1 py-0.5 text-center border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
              maxLength={3}
              title="Enter zoom level (100-600%)"
            />
          ) : (
            <button
              onClick={handleZoomInputStart}
              className="text-xs text-gray-500 px-1 py-0.5 text-center hover:bg-gray-100 rounded cursor-pointer min-w-[3rem]"
              title="Click to enter zoom level (100-600%)"
            >
              {Math.round(zoomLevel * 100)}%
            </button>
          )}

          {/* Divider */}
          <div className="w-8 h-px bg-gray-300 my-2"></div>

          {/* Contrast Adjustment */}
          <button
            onClick={() => setShowContrastModal(true)}
            className="p-2 rounded-md hover:bg-gray-100 group"
            title="Adjust Contrast"
          >
            <AdjustmentsHorizontalIcon className="h-5 w-5 text-gray-600" />
          </button>

          {/* Divider */}
          <div className="w-8 h-px bg-gray-300 my-2"></div>

          {/* Annotation Mode */}
          <button
            onClick={toggleAnnotationMode}
            onContextMenu={(e) => {
              e.preventDefault();
              setAnnotationModeContextMenu({ x: e.clientX, y: e.clientY });
            }}
            className={`p-2 rounded-md transition-colors group ${
              isAnnotationMode
                ? "bg-green-100 text-green-700 hover:bg-green-200"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            title="Toggle annotation mode (.) | Right-click for default label options"
          >
            <PencilIcon className="h-5 w-5" />
          </button>

          {/* ROI Selection Mode */}
          <button
            onClick={toggleRoiSelectionMode}
            className={`p-2 rounded-md transition-colors group ${
              isRoiSelectionMode
                ? "bg-purple-100 text-purple-700 hover:bg-purple-200"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            title="Toggle ROI selection mode - drag to select multiple annotations"
          >
            <CursorArrowRaysIcon className="h-5 w-5" />
          </button>

          {/* Bottom Line Mode */}
          <button
            onClick={() => {
              if (bottomLine.isActive) {
                // If bottom line exists, show modal to edit or delete
                setShowBottomLineModal(true);
              } else {
                // If no bottom line, toggle setting mode
                const newState = !isSettingBottomLine;
                setIsSettingBottomLine(newState);
                // Disable other modes when enabling bottom line mode
                if (newState) {
                  setIsAnnotationMode(false);
                  setIsRoiSelectionMode(false);
                }
              }
            }}
            className={`p-2 rounded-md transition-colors group ${
              isSettingBottomLine
                ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                : bottomLine.isActive
                ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            title={
              bottomLine.isActive
                ? "Edit or remove bottom line"
                : isSettingBottomLine
                ? "Click on spectrogram to set bottom line"
                : "Create bottom line (frequency boundary)"
            }
          >
            <MinusIcon className="h-5 w-5" />
          </button>

          {/* Keyboard Shortcuts Help */}
          <button
            onClick={() => setShowKeyboardShortcuts(true)}
            className="p-2 rounded-md transition-colors text-gray-600 hover:bg-gray-100"
            title="Keyboard shortcuts (?)"
          >
            <QuestionMarkCircleIcon className="h-5 w-5" />
          </button>

          {/* Divider */}
          <div className="w-8 h-px bg-gray-300 my-2"></div>

          {/* Highlight Conflicts */}
          <button
            onClick={handleToggleHighlightConflicts}
            className="p-2 rounded-md transition-colors group relative text-gray-600 hover:bg-gray-100"
            title="Detect and highlight time conflicts (boxes must have ≥10ms gap)"
          >
            <ExclamationTriangleIcon className="h-5 w-5" />
            {/* Badge with conflict count */}
            {conflicts.length > 0 && highlightConflicts && (
              <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                {conflicts.length}
              </div>
            )}
          </button>

          {/* Resolve Conflicts */}
          <button
            onClick={() => handleResolveConflicts()}
            disabled={conflicts.length === 0}
            className={`p-2 rounded-md transition-colors ${
              conflicts.length > 0
                ? "text-blue-600 hover:bg-blue-50 cursor-pointer"
                : "text-gray-300 cursor-not-allowed"
            }`}
            title={
              conflicts.length > 0
                ? `Resolve ${conflicts.length} conflict${conflicts.length > 1 ? "s" : ""} automatically (works without selection)`
                : "No conflicts to resolve. Click the warning icon first to detect conflicts."
            }
          >
            <CheckCircleIcon className="h-5 w-5" />
          </button>

          {/* Show/Hide Sidebar */}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`p-2 rounded-md transition-colors group relative ${
              showSidebar
                ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            title={showSidebar ? "Hide Annotations" : "Show Annotations"}
          >
            {/* Custom list icon */}
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 10h16M4 14h16M4 18h16"
              />
            </svg>
            {/* Badge with count */}
            {boundingBoxes.length > 0 && (
              <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                {boundingBoxes.length}
              </div>
            )}
          </button>
        </div>

        {/* Collapsible Sidebar */}
        {showSidebar && (
          <div
            className="border-l border-gray-200 bg-white p-3 overflow-y-auto flex-shrink-0"
            style={{ width: "320px" }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">Annotations</h2>
              <button
                onClick={() => setShowSidebar(false)}
                className="p-1 rounded-md hover:bg-gray-100"
              >
                <XMarkIcon className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Bottom Line Controls */}
            {bottomLine.isActive && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-blue-900">Bottom Line</h3>
                  <button
                    onClick={clearBottomLine}
                    className="p-1 rounded-md hover:bg-blue-100 text-blue-700"
                    title="Remove bottom line"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-blue-700 font-medium w-20">
                      Frequency:
                    </label>
                    <input
                      type="number"
                      value={Math.round(bottomLine.frequency || 0)}
                      onChange={(e) => {
                        const freq = parseFloat(e.target.value);
                        if (!isNaN(freq)) {
                          const nyquistFreq = getNyquistFrequency();
                          const constrainedFreq = Math.max(0, Math.min(freq, nyquistFreq));
                          // Calculate actual spectrogram height (65% of total canvas height)
                          const spectrogramHeight = spectrogramDimensions.height * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO;
                          setBottomLineAtFrequency(
                            constrainedFreq,
                            spectrogramHeight,
                            0,
                            nyquistFreq
                          );
                        }
                      }}
                      className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Frequency (Hz)"
                    />
                    <span className="text-xs text-blue-600">Hz</span>
                  </div>
                  <p className="text-xs text-blue-600 italic">
                    Bounding boxes cannot extend below this line
                  </p>
                </div>
              </div>
            )}

            {/* Sorting toggle */}
            <div className="mb-3 flex items-center justify-between bg-gray-50 p-2 rounded-lg">
              <span className="text-xs font-medium text-gray-700">Sort by:</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSortMode("time")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    sortMode === "time"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
                  }`}
                >
                  Time
                </button>
                <button
                  onClick={() => setSortMode("alphabetical")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    sortMode === "alphabetical"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
                  }`}
                >
                  A-Z
                </button>
              </div>
            </div>

            <BoundingBoxList
              boxes={sortedBoundingBoxes}
              selectedBox={selectedBox}
              onSelect={setSelectedBox}
              onDelete={handleDeleteBox}
              onUpdateLabel={handleUpdateLabel}
              selectedBoxes={selectedBoxes}
              onSelectMultiple={handleSelectMultiple}
              onDeleteMultiple={handleDeleteSelectedBoxes}
            />
          </div>
        )}
      </div>

      {showLabelModal && (
        <LabelModal
          onClose={() => setShowLabelModal(false)}
          onSave={handleLabelSubmit}
          initialLabel={tempBox?.label || ""}
        />
      )}

      <ConflictWarningModal
        isOpen={showConflictModal}
        conflicts={navigationConflicts}
        onResolveAndContinue={handleResolveAndContinue}
        onStayAndFix={handleStayAndFix}
        onDiscardAndContinue={handleDiscardAndContinue}
      />

      <KeyboardShortcutsModal
        isOpen={showKeyboardShortcuts}
        onClose={() => setShowKeyboardShortcuts(false)}
      />

      <BottomLineModal
        isOpen={showBottomLineModal}
        onClose={() => setShowBottomLineModal(false)}
        currentFrequency={bottomLine.frequency || 0}
        maxFrequency={getNyquistFrequency()}
        onSave={(frequency) => {
          // Calculate actual spectrogram height (65% of total canvas height)
          const spectrogramHeight = baseSpectrogramDimensions.height * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO;
          setBottomLineAtFrequency(
            frequency,
            spectrogramHeight,
            0,
            getNyquistFrequency()
          );
          toast.success(`Bottom line updated to ${Math.round(frequency)} Hz`);
        }}
        onDelete={() => {
          clearBottomLine();
          toast.success("Bottom line removed");
        }}
      />

      <ContrastModal
        isOpen={showContrastModal}
        onClose={() => setShowContrastModal(false)}
        currentContrast={contrast}
        onContrastChange={setContrast}
      />

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={(() => {
            // Context menu for a specific bounding box
            if (contextMenu.boxIndex !== undefined) {
              const boxIndex = contextMenu.boxIndex; // Capture the value for TypeScript
              const targetBox = boundingBoxes[boxIndex];

              // Check if we're dealing with multiple selected boxes
              if (selectedBoxes.size > 1 && selectedBoxes.has(boxIndex)) {
                // Multiple selection - operate on all selected boxes
                return [
                  {
                    label: `Edit Label for ${selectedBoxes.size} items`,
                    icon: <PencilIcon className="w-4 h-4" />,
                    onClick: () => {
                      handleCustomLabel();
                      setContextMenu(null);
                    },
                  },
                  {
                    label: `Copy ${selectedBoxes.size} items`,
                    icon: <ClipboardDocumentIcon className="w-4 h-4" />,
                    onClick: () => {
                      handleCopySelection();
                      setContextMenu(null);
                    },
                    shortcut: "Ctrl+C",
                  },
                  {
                    label: `Delete ${selectedBoxes.size} items`,
                    icon: <TrashIcon className="w-4 h-4" />,
                    onClick: () => {
                      handleDeleteSelectedBoxes();
                      setContextMenu(null);
                    },
                    shortcut: "Del",
                  },
                ];
              } else {
                // Single box - operate on the clicked box directly
                return [
                  {
                    label: "Edit Label",
                    icon: <PencilIcon className="w-4 h-4" />,
                    onClick: () => {
                      // Direct operation on the clicked box
                      handleEditLabel(boxIndex);
                      setContextMenu(null);
                    },
                  },
                  {
                    label: "Copy",
                    icon: <ClipboardDocumentIcon className="w-4 h-4" />,
                    onClick: () => {
                      // Direct copy of the clicked box
                      if (targetBox) {
                        setClipboardBox({ ...targetBox });
                        toast.success("Bounding box copied");
                        setContextMenu(null);
                      }
                    },
                    shortcut: "Ctrl+C",
                  },
                  {
                    label: "Delete",
                    icon: <TrashIcon className="w-4 h-4" />,
                    onClick: () => {
                      // Direct deletion of the clicked box
                      handleDeleteBox(boxIndex);
                      setContextMenu(null);
                    },
                    shortcut: "Del",
                  },
                ];
              }
            }

            // Context menu for empty space
            if (clipboardBox) {
              return [
                {
                  label: "Paste",
                  icon: <ClipboardDocumentIcon className="w-4 h-4" />,
                  onClick: () => {
                    handlePasteSelection();
                    setContextMenu(null);
                  },
                  shortcut: "Ctrl+V",
                },
              ];
            }

            // No options available
            return [];
          })()}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Custom Label Input Modal */}
      {showCustomLabelInput && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-medium mb-4">
              Set Label for {selectedBoxes.size} Selected Box
              {selectedBoxes.size > 1 ? "es" : ""}
            </h3>
            <div className="mb-4">
              <input
                type="text"
                value={customLabelInput}
                onChange={(e) => setCustomLabelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    applyCustomLabel();
                  } else if (e.key === "Escape") {
                    setShowCustomLabelInput(false);
                    setCustomLabelInput("");
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter label (or press A-Z for quick labels)"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-2">
                Tip: When boxes are selected, you can press A-Z keys directly
                for quick labeling without this dialog.
              </p>
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowCustomLabelInput(false);
                  setCustomLabelInput("");
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={applyCustomLabel}
                className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Apply Label
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Annotation Mode Context Menu */}
      {annotationModeContextMenu && (
        <ContextMenu
          x={annotationModeContextMenu.x}
          y={annotationModeContextMenu.y}
          items={[
            {
              label: "No default label",
              onClick: () => {
                setDefaultLabel(null);
                setAnnotationModeContextMenu(null);
                toast.success("Default label set to None");
              },
              checked: defaultLabel === null,
              shortcut: "Ctrl+1",
            },
            {
              label: "Use last assigned label",
              onClick: () => {
                setDefaultLabel("USE_LAST");
                setAnnotationModeContextMenu(null);
                toast.success(
                  "Will dynamically use the most recently assigned label" +
                    (lastUsedLabel ? ` (currently: "${lastUsedLabel}")` : " (none assigned yet)"),
                );
              },
              checked: defaultLabel === "USE_LAST",
              shortcut: "Ctrl+2",
            },
            {
              label: "Set custom default label...",
              onClick: () => {
                setAnnotationModeContextMenu(null);
                setShowDefaultLabelInput(true);
                setDefaultLabelInput(
                  defaultLabel && defaultLabel !== "USE_LAST"
                    ? defaultLabel
                    : "",
                );
              },
              checked: defaultLabel !== null && defaultLabel !== "USE_LAST",
              shortcut: "Ctrl+3",
            },
          ]}
          onClose={() => setAnnotationModeContextMenu(null)}
        />
      )}

      {/* Default Label Input Modal */}
      {showDefaultLabelInput && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-medium mb-4">
              Set Default Label for New Annotations
            </h3>
            <div className="mb-4">
              <input
                type="text"
                value={defaultLabelInput}
                onChange={(e) => setDefaultLabelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setDefaultLabel(defaultLabelInput || null);
                    setShowDefaultLabelInput(false);
                    toast.success(
                      defaultLabelInput
                        ? `Default label set to: "${defaultLabelInput}"`
                        : "Default label cleared",
                    );
                  } else if (e.key === "Escape") {
                    setShowDefaultLabelInput(false);
                    setDefaultLabelInput("");
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter default label (or leave empty for None)"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-2">
                This label will be automatically assigned to new bounding boxes.
              </p>
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowDefaultLabelInput(false);
                  setDefaultLabelInput("");
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setDefaultLabel(defaultLabelInput || null);
                  setShowDefaultLabelInput(false);
                  toast.success(
                    defaultLabelInput
                      ? `Default label set to: "${defaultLabelInput}"`
                      : "Default label cleared",
                  );
                }}
                className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Set Default
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnotationEditor;
