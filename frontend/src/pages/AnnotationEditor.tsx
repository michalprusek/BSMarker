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
} from "@heroicons/react/24/solid";
import toast from "react-hot-toast";
import WaveSurfer from "wavesurfer.js";
import { Stage, Layer, Rect, Line, Circle, Group, Text } from "react-konva";
import { recordingService, annotationService } from "../services/api";
import { Recording, BoundingBox } from "../types";
import BoundingBoxList from "../components/BoundingBoxList";
import LabelModal from "../components/LabelModal";
import ContextMenu from "../components/ContextMenu";
import SpectrogramScales from "../components/SpectrogramScales";
import LoadingSpinner from "../components/LoadingSpinner";
import { CoordinateUtils, LAYOUT_CONSTANTS } from "../utils/coordinates";
import {
  AXIS_STYLES,
  formatTimeLabel,
  getTimeTickInterval,
} from "../utils/axisStyles";
import { useAutosave } from "../hooks/useAutosave";
import { useMouseCoordinates } from "../hooks/useMouseCoordinates";
import { useBoundingBoxTimeFrequency } from "../hooks/useBoundingBoxTimeFrequency";
import { ANNOTATION_CONSTANTS, LABEL_COLORS } from "../utils/constants";
// import { useSpectrogramZoom } from '../hooks/useSpectrogramZoom'; // Unused - replaced with custom throttled zoom
import { throttle } from "lodash";

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
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingBox, setDrawingBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [tempBox, setTempBox] = useState<BoundingBox | null>(null);
  const [spectrogramDimensions, setSpectrogramDimensions] = useState({
    width: 800,
    height: 400,
  });
  const [showSidebar, setShowSidebar] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [verticalScrollOffset, setVerticalScrollOffset] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentSpeedIndex, setCurrentSpeedIndex] = useState(0);
  const [isAnnotationMode, setIsAnnotationMode] = useState(false);
  const [isRewindingLeft, setIsRewindingLeft] = useState(false);
  const [isRewindingRight, setIsRewindingRight] = useState(false);
  const [selectedBoxes, setSelectedBoxes] = useState<Set<number>>(new Set());
  const [selectionRect, setSelectionRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    boxIndex?: number;
  } | null>(null);
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
  const [scrollOffset, setScrollOffset] = useState<number>(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [segmentDuration, setSegmentDuration] = useState<number | null>(null);
  const [timelineCursorPosition, setTimelineCursorPosition] =
    useState<number>(0);
  const [customLabelInput, setCustomLabelInput] = useState<string>("");
  const [showCustomLabelInput, setShowCustomLabelInput] =
    useState<boolean>(false);
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const [lastClickedBox, setLastClickedBox] = useState<number | null>(null);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStartPos, setPanStartPos] = useState<{
    x: number;
    scrollX: number;
    y?: number;
    scrollY?: number;
  } | null>(null);
  const rewindIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wasPlayingRef = useRef<boolean>(false);
  const keyDownArrowRef = useRef<boolean>(false);

  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const stageRef = useRef<any>(null);
  const spectrogramImgRef = useRef<HTMLImageElement>(null);
  const audioUrlRef = useRef<string | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const unifiedScrollRef = useRef<HTMLDivElement>(null);

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

  // Initialize custom hooks for coordinate transformations and time/frequency conversions
  const { transformMousePoint, clampSeekPosition, getMaxWorldX } =
    useMouseCoordinates(spectrogramDimensions, scrollOffset, zoomLevel);

  const {
    convertBoxToTimeFrequency,
    convertNormalizedBoxToTimeFrequency,
    getMaxSpectrogramY,
  } = useBoundingBoxTimeFrequency(
    spectrogramDimensions,
    duration,
    getNyquistFrequency,
  );

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

  // Memoize coordinate transformations - horizontal zoom only
  const transformedBoxes = useMemo(
    () =>
      visibleBoundingBoxes.map((box) => {
        const screenCoords = CoordinateUtils.transformBoxToScreen(
          box,
          zoomLevel,
        );
        return {
          ...box,
          ...screenCoords,
          color: getLabelColorMemoized(box.label || "None"),
        };
      }),
    [visibleBoundingBoxes, zoomLevel, getLabelColorMemoized],
  );

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

      if (hasUnsavedChanges && !isAutoSaving && !isSaving) {
        // Enhanced beforeunload with save attempt
        manualSave().catch(() => {
          // Silent fail - we can't do much during beforeunload
        });

        event.preventDefault();
        event.returnValue =
          "You have unsaved changes. Are you sure you want to leave?";
        return event.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges, isAutoSaving, isSaving, manualSave]);

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
  }, [recordingId]);

  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    return () => {
      // Clean up blob URLs when component unmounts
      if (spectrogramUrl && spectrogramUrl.startsWith("blob:")) {
        URL.revokeObjectURL(spectrogramUrl);
      }
      if (audioUrlRef.current && audioUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, [spectrogramUrl]);

  // Audio cleanup on component unmount only (beforeunload handled above)
  useEffect(() => {
    return () => {
      // Pause audio when component unmounts (route change)
      if (wavesurferRef.current && wavesurferRef.current.isPlaying()) {
        wavesurferRef.current.pause();
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
    if (boundingBoxes.length > 0 || history.length > 0) {
      const currentState = JSON.stringify(boundingBoxes);
      const lastHistoryState = history[historyIndex]
        ? JSON.stringify(history[historyIndex])
        : "";

      if (
        currentState !== lastHistoryState &&
        currentState !== JSON.stringify(lastSavedState)
      ) {
        addToHistory(boundingBoxes);
        setHasUnsavedChanges(
          JSON.stringify(boundingBoxes) !== JSON.stringify(lastSavedState),
        );
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

      // Handle 'A' key for annotation mode toggle
      if (
        e.key.toLowerCase() === "a" &&
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

      // Handle A-Z quick labeling when boxes are selected
      if (
        selectedBoxes.size > 0 &&
        e.key.length === 1 &&
        /^[b-zB-Z]$/.test(e.key) &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        const label = e.key.toUpperCase();
        handleQuickLabel(label);
        return;
      }

      // Handle arrow key hold for rewind/fast-forward
      if (e.key === "ArrowLeft" && !keyDownArrowRef.current) {
        e.preventDefault();
        keyDownArrowRef.current = true;
        startRewind("backward");
      } else if (e.key === "ArrowRight" && !keyDownArrowRef.current) {
        e.preventDefault();
        keyDownArrowRef.current = true;
        startRewind("forward");
      } else if (e.key === " ") {
        e.preventDefault();
        handlePlayPause();
      } else if (e.key === "Escape") {
        if (isAnnotationMode) {
          setIsAnnotationMode(false);
        }
        if (selectedBoxes.size > 0) {
          setSelectedBoxes(new Set());
        }
        if (showCustomLabelInput) {
          setShowCustomLabelInput(false);
        }
      } else if (e.key === "Delete" && selectedBoxes.size > 0) {
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
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        keyDownArrowRef.current = false;
        stopRewind();
      }
    };

    // Removed old handleWheel to prevent dual zoom system conflicts
    // Using only handleWheelZoom for consistent behavior

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    // Removed old wheel event listener - using React onWheel instead

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
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
            spectrogramDimensions.height * 0.23,
          );
          if (waveformRef.current) {
            waveformRef.current.style.height = `${waveformHeight}px`;
            // Set container width to match spectrogram exactly
            const zoomedWidth = CoordinateUtils.getZoomedContentWidth(
              spectrogramDimensions.width,
              zoomLevel,
            );
            waveformRef.current.style.width = `${zoomedWidth}px`;
          }

          // Trigger WaveSurfer to redraw at new size
          if (wavesurferRef.current) {
            // WaveSurfer will automatically redraw when container size changes
            // Just ensure it's aware of the change
            (wavesurferRef.current as any).setHeight?.(waveformHeight);
            // With fillParent: true, WaveSurfer automatically adjusts to container size
          }
        } catch (error) {
          console.warn("Failed to resize waveform:", error);
        }
      }, 150); // 150ms debounce

      return () => clearTimeout(resizeTimeout);
    }
  }, [spectrogramDimensions, zoomLevel]);

  // Handle zoom changes for waveform - removed internal zoom to rely on container width only
  useEffect(() => {
    if (wavesurferRef.current && waveformRef.current) {
      // Don't use WaveSurfer's internal zoom - let container width handle it
      // This ensures perfect synchronization with spectrogram
      try {
        if (wavesurferRef.current && wavesurferRef.current.getDuration() > 0) {
          // Update container width to match spectrogram
          const zoomedWidth =
            (spectrogramDimensions.width -
              LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH) *
            zoomLevel;
          if (waveformRef.current) {
            waveformRef.current.style.width = `${zoomedWidth}px`;
          }
          // With fillParent: true, WaveSurfer automatically adjusts to container size
        }
      } catch (e) {
        // Audio not loaded yet, ignore
      }
    }
  }, [zoomLevel, spectrogramDimensions.width]);

  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout;

    const updateDimensions = () => {
      // Clear existing timeout
      clearTimeout(resizeTimeout);

      // Debounce resize updates to prevent excessive re-renders
      resizeTimeout = setTimeout(() => {
        if (unifiedScrollRef.current) {
          const containerWidth = unifiedScrollRef.current.clientWidth;
          // Use full available height for the combined view
          const containerHeight = unifiedScrollRef.current.clientHeight;
          setSpectrogramDimensions({
            width: containerWidth,
            height: containerHeight,
          });
        }
      }, 100); // 100ms debounce for dimension updates
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", updateDimensions);
    };
  }, [spectrogramUrl]);

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
        console.log(`Created blob URL for recording ${recordingId}:`, objectUrl);
        setSpectrogramUrl(objectUrl);
        setSpectrogramError(null);
      }
    } catch (error) {
      console.error(`Failed to load spectrogram image for recording ${recordingId}:`, error);
      setSpectrogramError(`Failed to load spectrogram for recording ${recordingId}`);
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
    [recording?.id],
  );

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
        const boxes = rawBoxes.map((box) => ({
          ...box,
          x: Math.round(box.x || 0),
          y: Math.round(box.y || 0),
          width: Math.round(box.width || 0),
          height: Math.round(box.height || 0),
        }));
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
    if (!recording || !waveformRef.current) return;

    // Destroy existing instance if any
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
    }

    // Ensure container has proper dimensions
    const waveformHeight = Math.max(50, spectrogramDimensions.height * 0.23);

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
      fillParent: true, // Use fillParent to match container width exactly
      backend: "WebAudio",
      mediaControls: false,
      minPxPerSec: 1, // Lower minimum to allow fillParent to work properly
      hideScrollbar: true, // Hide WaveSurfer's own scrollbar
      autoScroll: false, // Disable auto-scroll
      // Remove unsupported options
    });

    wavesurferRef.current = wavesurfer;

    const baseUrl = process.env.REACT_APP_API_URL || "";
    const token = localStorage.getItem("token");

    try {
      const response = await fetch(
        `${baseUrl}/api/v1/recordings/${recording.id}/audio`,
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
      // Waveform will be automatically rendered, no need for manual redraw
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
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

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

  const stopRewind = () => {
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
    setIsAnnotationMode(!isAnnotationMode);
  };

  // Helper function to constrain box within boundaries
  const constrainBox = (box: BoundingBox): BoundingBox => {
    // Use centralized coordinate utilities for consistent constraint handling
    // NOTE: coordinates here are in world space (unzoomed), so use zoom level 1
    const constrained = CoordinateUtils.constrainBoundingBox(
      box,
      spectrogramDimensions.width,
      spectrogramDimensions.height,
      true, // Account for frequency scale
      1, // World coordinates are unzoomed, so zoom level is 1
    );

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

    if (wavesurferRef.current) {
      // Preserve current playback position and state
      const currentTime = wavesurferRef.current.getCurrentTime();
      const duration = wavesurferRef.current.getDuration();
      const wasPlaying = wavesurferRef.current.isPlaying();

      // Pause if playing to prevent jump
      if (wasPlaying) {
        wavesurferRef.current.pause();
      }

      // Set new playback rate
      wavesurferRef.current.setPlaybackRate(nextSpeed);

      // Restore position using relative position (prevents drift)
      if (duration > 0) {
        const relativePosition = currentTime / duration;
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
    if (wavesurferRef.current && wavesurferRef.current.isPlaying()) {
      wavesurferRef.current.pause();
    }
    navigate(path);
  };

  const navigateToRecording = async (index: number) => {
    if (index >= 0 && index < projectRecordings.length) {
      // Pause audio before navigating
      if (wavesurferRef.current && wavesurferRef.current.isPlaying()) {
        wavesurferRef.current.pause();
      }

      // Save current annotations before navigating
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

    // Get the paste position - use context menu position if available, otherwise mouse position
    const pasteAt = contextMenu || mousePosition;

    // Adjust paste position for zoom level (keep display coordinates)
    const adjustedPasteX = pasteAt.x / zoomLevel;
    const adjustedPasteY = pasteAt.y; // Keep display coordinates

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

      setBoundingBoxes([...boundingBoxes, ...newBoxes]);
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
      setBoundingBoxes([...boundingBoxes, newBox]);
      setHasUnsavedChanges(true);
      toast.success("Bounding box pasted");
    }
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
    [boundingBoxes],
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
    const point = stage.getPointerPosition();
    const containerHeight = Math.max(spectrogramDimensions.height, 600);
    const spectrogramHeight = containerHeight * 0.6;

    // Use centralized coordinate transformation hook
    const { seekPosition, pos } = transformMousePoint(point);

    // Check if clicking on a bounding box first (before handling right-click)
    const clickedBoxIndex = boundingBoxes.findIndex(
      (box) =>
        pos.x >= box.x &&
        pos.x <= box.x + box.width &&
        pos.y >= box.y &&
        pos.y <= box.y + box.height,
    );

    // Handle right-click for panning (only if not clicking on a selected bounding box)
    if (e.evt.button === 2) {
      // Check if clicking on a SELECTED bounding box
      const isClickingSelectedBox = clickedBoxIndex !== -1 && selectedBoxes.has(clickedBoxIndex);

      // Only enable panning if NOT clicking on a selected box
      if (!isClickingSelectedBox) {
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
      e.evt.button === 0 &&
      wavesurferRef.current &&
      duration > 0 &&
      !e.evt.shiftKey &&
      !e.evt.ctrlKey &&
      !e.evt.metaKey
    ) {
      const clampedSeekPosition = clampSeekPosition(seekPosition);
      wavesurferRef.current.seekTo(clampedSeekPosition);
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

      // If not shift/ctrl clicking, handle deselection or start panning
      if (!e.evt.shiftKey && !e.evt.ctrlKey && !e.evt.metaKey) {
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
      } else {
        // Start selection rectangle for shift/ctrl
        setIsSelecting(true);
        setSelectionRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
        setSelectedBoxes(new Set());
        setSelectedBox(null);
      }
    } else {
      // Annotation mode - start drawing (only in spectrogram area)
      if (point.y <= spectrogramHeight) {
        setIsDrawing(true);
        setDrawingBox({ x: pos.x, y: pos.y, width: 0, height: 0 });
      }
    }
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    const containerHeight = Math.max(spectrogramDimensions.height, 600);
    const spectrogramHeight = containerHeight * 0.6;

    // Use centralized coordinate transformation hook (same as handleMouseDown)
    const { seekPosition, pos } = transformMousePoint(point);
    setMousePosition(pos);

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
    if (draggingBox) {
      const deltaX =
        pos.x - draggingBox.dragOffset.x - draggingBox.initialBox.x;
      const deltaY =
        pos.y - draggingBox.dragOffset.y - draggingBox.initialBox.y; // Vertical drag works with no zoom

      const updatedBoxes = [...boundingBoxes];

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

            // Apply boundary constraints
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

        // Apply boundary constraints
        updatedBoxes[draggingBox.index] = constrainBox(unconstrained);
        setSelectedBox(updatedBoxes[draggingBox.index]);
      }

      setBoundingBoxes(updatedBoxes);
      setHasUnsavedChanges(true);
      return;
    }

    // Handle resizing
    if (resizingBox && dragStartPos) {
      const box = boundingBoxes[resizingBox.index];
      const newBox = { ...box };
      const minSize = 2;

      // Use centralized hooks for boundary constraints
      const maxY = getMaxSpectrogramY();
      const constrainedY = Math.min(pos.y, maxY);

      // Additional constraint for x position to ensure it doesn't exceed max boundaries during resize
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
      setBoundingBoxes(updatedBoxes);
      setSelectedBox(newBox);
      setHasUnsavedChanges(true);
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
    if (!isAnnotationMode && !isDrawing && !isSelecting) {
      let foundHandle = false;
      for (let i = 0; i < boundingBoxes.length; i++) {
        const box = boundingBoxes[i];
        const handle = getResizeHandle(box, pos.x, pos.y);
        if (handle) {
          setHoveredHandle({ boxIndex: i, handle });
          foundHandle = true;
          break;
        }
      }
      if (!foundHandle) {
        setHoveredHandle(null);
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
      if (preOperationState) {
        const currentState = JSON.stringify(boundingBoxes);
        const preOpState = JSON.stringify(preOperationState);

        if (currentState !== preOpState) {
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
      if (preOperationState) {
        const currentState = JSON.stringify(boundingBoxes);
        const preOpState = JSON.stringify(preOperationState);

        if (currentState !== preOpState) {
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
        const timeFrequency =
          convertNormalizedBoxToTimeFrequency(normalizedBox);

        const newBox: BoundingBox = {
          ...normalizedBox,
          label: "None", // Auto-assign "None" label
          ...timeFrequency,
        };

        // Add the box directly without showing the label modal
        setBoundingBoxes([...boundingBoxes, newBox]);
        setHasUnsavedChanges(true);
        toast.success(
          'Annotation added with "None" label. Right-click to edit label.',
        );
      }

      setDrawingBox(null);
    }
  };

  const handleContextMenu = (e: any) => {
    e.evt.preventDefault();

    const stage = e.target.getStage();
    const point = stage.getPointerPosition();

    // Use centralized coordinate transformation hook
    const { pos } = transformMousePoint(point);
    const adjustedX = pos.x;
    const adjustedY = pos.y;

    // Check if right-clicking on a box
    const clickedBoxIndex = boundingBoxes.findIndex(
      (box) =>
        adjustedX >= box.x &&
        adjustedX <= box.x + box.width &&
        adjustedY >= box.y &&
        adjustedY <= box.y + box.height,
    );

    if (clickedBoxIndex !== -1) {
      // Only show context menu if clicking on a selected box
      if (selectedBoxes.has(clickedBoxIndex)) {
        // Clicked on one of the selected boxes - keep all selected boxes
        // Don't change selection, just show context menu for all selected
        setContextMenu({
          x: e.evt.clientX,
          y: e.evt.clientY,
          boxIndex: clickedBoxIndex,
        });
      }
      // If clicking on non-selected box, do nothing (no automatic selection, no menu)
    }
    // No context menu on empty space
  };

  const handleLabelSubmit = (label: string) => {
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
    const newZoom = Math.min(zoomLevel * 1.5, 6); // Limit to 600%
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

          // Calculate new zoom level with limits
          const newZoom = Math.max(1, Math.min(6, zoomLevel * zoomFactor)); // Limit max zoom to 600%

          if (newZoom === zoomLevel) return;

          // Get cursor position relative to spectrogram container
          const cursorX =
            event.clientX - rect.left - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const cursorY = event.clientY - rect.top;

          // Calculate world coordinates at cursor position (horizontal only)
          const worldX = (cursorX + zoomOffset.x) / zoomLevel;

          // Calculate new offset to keep cursor position fixed (horizontal only)
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

          // No need to update WaveSurfer zoom - container width handles it
          // WaveSurfer will automatically adjust to the new container width
        });
      }, 16), // 60 FPS throttle
    [zoomLevel, zoomOffset, spectrogramDimensions.width],
  );

  // Clean up throttled function on unmount
  useEffect(() => {
    return () => {
      handleWheelZoom.cancel?.();
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

      selectedBoxes.forEach((index) => {
        if (updatedBoxes[index]) {
          updatedBoxes[index] = {
            ...updatedBoxes[index],
            label: customLabelInput.trim(),
          };
          updateCount++;
        }
      });

      if (updateCount > 0) {
        setBoundingBoxes(updatedBoxes);
        toast.success(
          `Label "${customLabelInput.trim()}" assigned to ${updateCount} box${updateCount > 1 ? "es" : ""}`,
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
              <div className="text-sm text-gray-700 max-w-[300px] truncate">
                <span
                  className="font-medium"
                  title={recording.original_filename}
                >
                  {recording.original_filename}
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
                  width: `${CoordinateUtils.getZoomedContainerWidth(spectrogramDimensions.width, zoomLevel)}px`,
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
                        width: `${CoordinateUtils.getZoomedContentWidth(spectrogramDimensions.width, zoomLevel)}px`,
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
                      width: `${(spectrogramDimensions.width - 40) * zoomLevel}px`,
                      height: "100%",
                      marginLeft: `${LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH}px`,
                    }}
                  >
                    <svg
                      width={CoordinateUtils.getZoomedContentWidth(
                        spectrogramDimensions.width,
                        zoomLevel,
                      )}
                      height="100%"
                      className="absolute"
                      style={{
                        transform: `translateX(-${scrollOffset}px)`,
                        height: "100%",
                      }}
                    >
                      {duration > 0 &&
                        (() => {
                          const ticks = [];
                          const totalWidth =
                            CoordinateUtils.getZoomedContentWidth(
                              spectrogramDimensions.width,
                              zoomLevel,
                            );
                          const containerHeight = Math.max(
                            48,
                            spectrogramDimensions.height * 0.08,
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
                      width: `${CoordinateUtils.getZoomedContentWidth(spectrogramDimensions.width, zoomLevel)}px`, // Sync width with zoom
                      height: "100%",
                      position: "absolute",
                      top: 0,
                      left: `${LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH}px`, // Position at frequency scale offset
                      display: "block",
                    }}
                  >
                    {/* Waveform container */}
                    <div
                      ref={waveformRef}
                      id="waveform-container"
                      style={{
                        width: "100%",
                        height: "100%",
                        position: "relative",
                      }}
                    />

                    {/* Bounding box projections on waveform - overlay on top of waveform */}
                    <svg
                      className="absolute top-0 left-0 pointer-events-none"
                      style={{
                        width: "100%",
                        height: "100%",
                        position: "absolute",
                        zIndex: 10, // Ensure it's above waveform
                      }}
                    >
                      {boundingBoxes.map((box, index) => {
                        const isSelected = selectedBoxes.has(index);
                        const labelColor = getLabelColor(box.label || "None");
                        // Calculate pixel positions for waveform boxes - use full width like spectrogram
                        const startX =
                          duration > 0
                            ? CoordinateUtils.timeToPixel(
                                box.start_time || 0,
                                duration,
                                spectrogramDimensions.width, // Use full width, function will subtract FREQUENCY_SCALE_WIDTH
                                zoomLevel,
                                false,
                              )
                            : 0;
                        const endX =
                          duration > 0
                            ? CoordinateUtils.timeToPixel(
                                box.end_time || 0,
                                duration,
                                spectrogramDimensions.width, // Use full width, function will subtract FREQUENCY_SCALE_WIDTH
                                zoomLevel,
                                false,
                              )
                            : 0;
                        const waveformHeight =
                          spectrogramDimensions.height *
                          LAYOUT_CONSTANTS.WAVEFORM_HEIGHT_RATIO; // Use layout constant for waveform height

                        return (
                          <g key={index}>
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
              <Stage
                width={CoordinateUtils.getZoomedContentWidth(
                  spectrogramDimensions.width,
                  zoomLevel,
                )} // Full zoomed width for proper event handling
                height={spectrogramDimensions.height} // Full height to include waveform
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onContextMenu={handleContextMenu}
                ref={stageRef}
                x={0} // No x offset needed - Stage is relative to container
                y={-zoomOffset.y} // Keep vertical offset for consistency
                scaleX={1}
                scaleY={1}
                listening={true}
                style={{
                  position: "absolute",
                  top: "0",
                  left: `${LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH}px`, // Offset for frequency scale
                  cursor: isAnnotationMode
                    ? "crosshair"
                    : isPanning
                      ? "grabbing"
                      : hoveredHandle
                        ? (hoveredHandle.handle.includes("n") &&
                            hoveredHandle.handle.includes("w")) ||
                          (hoveredHandle.handle.includes("s") &&
                            hoveredHandle.handle.includes("e"))
                          ? "nwse-resize"
                          : "nesw-resize"
                        : draggingBox
                          ? "grabbing"
                          : resizingBox
                            ? "grabbing"
                            : isSelecting
                              ? "crosshair"
                              : boundingBoxes.some(
                                    (box) =>
                                      mousePosition.x >= box.x &&
                                      mousePosition.x <= box.x + box.width &&
                                      mousePosition.y >= box.y &&
                                      mousePosition.y <= box.y + box.height,
                                  )
                                ? "move"
                                : mousePosition.y >
                                    Math.max(
                                      spectrogramDimensions.height,
                                      600,
                                    ) *
                                      0.8
                                  ? "pointer"
                                  : "default",
                }}
              >
                {/* Static layer for selection rectangle - cached */}
                <Layer listening={false} cache={false} clearBeforeDraw={true}>
                  {/* Selection rectangle - scale to spectrogram area */}
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
                        ) * 0.7
                      }
                      width={Math.abs(selectionRect.width) * zoomLevel}
                      height={Math.abs(selectionRect.height) * 0.7}
                      fill="rgba(59, 130, 246, 0.1)"
                      stroke="#3B82F6"
                      strokeWidth={1}
                      dash={[5, 5]}
                    />
                  )}
                </Layer>

                {/* Dynamic layer for bounding boxes - optimized */}
                <Layer listening={true} clearBeforeDraw={true}>
                  {/* Mirror highlights for selected boxes - render first so they appear behind */}
                  {transformedBoxes.map((transformedBox, index) => {
                    const globalIndex = boundingBoxes.indexOf(transformedBox);
                    const isSelected = selectedBoxes.has(globalIndex);

                    if (!isSelected) return null;

                    // Render a highlight rectangle for selected boxes
                    const scaledBox = {
                      x: transformedBox.screenX,
                      y: transformedBox.screenY,
                      width: transformedBox.screenWidth,
                      height: transformedBox.screenHeight,
                    };

                    return (
                      <Group key={`highlight-${globalIndex}`}>
                        {/* Outer glow effect */}
                        <Rect
                          x={scaledBox.x - 6}
                          y={scaledBox.y - 6}
                          width={scaledBox.width + 12}
                          height={scaledBox.height + 12}
                          fill="transparent"
                          stroke="#FFD700"
                          strokeWidth={3}
                          opacity={0.6}
                          shadowBlur={15}
                          shadowColor="#FFD700"
                          cornerRadius={4}
                          listening={false}
                        />
                        {/* Inner highlight */}
                        <Rect
                          x={scaledBox.x - 3}
                          y={scaledBox.y - 3}
                          width={scaledBox.width + 6}
                          height={scaledBox.height + 6}
                          fill="rgba(255, 215, 0, 0.15)"
                          stroke="#FFD700"
                          strokeWidth={2}
                          dash={[12, 6]}
                          cornerRadius={2}
                          listening={false}
                        />
                      </Group>
                    );
                  })}

                  {/* Optimized Bounding boxes - only render visible boxes */}
                  {transformedBoxes.map((transformedBox, index) => {
                    // const originalIndex = visibleBoundingBoxes.indexOf(transformedBox); // Unused
                    const globalIndex = boundingBoxes.indexOf(transformedBox);
                    const isSelected = selectedBoxes.has(globalIndex);
                    const isSingleSelected = selectedBox === transformedBox;
                    const labelColor = transformedBox.color;

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
                    let strokeWidth = 2;
                    let shadowBlur = 0;
                    let shadowColor = "transparent";
                    let dashArray: number[] | undefined = undefined;

                    if (isSelected || isSingleSelected) {
                      strokeWidth = 4; // Thicker stroke for visibility
                      shadowBlur = 20; // Much stronger shadow for selected boxes
                      shadowColor = "rgba(255, 215, 0, 0.8)"; // Golden shadow for selection
                      dashArray = undefined; // Solid line for cleaner look
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
                          onContextMenu={(e) => {
                            e.evt.preventDefault();
                            e.cancelBubble = true;

                            // Only show context menu if this box is selected
                            if (selectedBoxes.has(globalIndex)) {
                              setContextMenu({
                                x: e.evt.clientX,
                                y: e.evt.clientY,
                                boxIndex: globalIndex,
                              });
                            }
                            // If not selected, do nothing (no automatic selection, no menu)
                          }}
                        />

                        {/* Label text - always show, including "None" */}
                        {
                          <>
                            {/* Background for label */}
                            <Rect
                              x={scaledBox.x}
                              y={Math.max(5, scaledBox.y - 20)}
                              width={Math.min(
                                scaledBox.width,
                                Math.max(
                                  45,
                                  (transformedBox.label || "None").length * 8 +
                                    8,
                                ),
                              )}
                              height={18}
                              fill={`rgba(0, 0, 0, ${transformedBox.label && transformedBox.label !== "None" ? 0.8 : 0.6})`}
                              cornerRadius={3}
                              listening={false}
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
                        }

                        {/* Resize handles */}
                        {(isSingleSelected || isSelected) &&
                          !isAnnotationMode && (
                            <>
                              {/* Corner handles */}
                              <Circle
                                x={scaledBox.x}
                                y={scaledBox.y}
                                radius={6}
                                fill="#FFD700"
                                stroke="white"
                                strokeWidth={2}
                                listening={false}
                              />
                              <Circle
                                x={scaledBox.x + scaledBox.width}
                                y={scaledBox.y}
                                radius={6}
                                fill="#FFD700"
                                stroke="white"
                                strokeWidth={2}
                                listening={false}
                              />
                              <Circle
                                x={scaledBox.x}
                                y={scaledBox.y + scaledBox.height}
                                radius={6}
                                fill="#FFD700"
                                stroke="white"
                                strokeWidth={2}
                                listening={false}
                              />
                              <Circle
                                x={scaledBox.x + scaledBox.width}
                                y={scaledBox.y + scaledBox.height}
                                radius={6}
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
                    />
                  )}

                  {/* Cursor line only for spectrogram area */}
                  {duration > 0 && (
                    <Line
                      points={[
                        timelineCursorPosition, // Already in zoomed coordinates
                        0,
                        timelineCursorPosition, // Already in zoomed coordinates
                        spectrogramDimensions.height, // Fixed height - no vertical zoom
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

          <div className="text-xs text-gray-500 px-1 text-center">
            {Math.round(zoomLevel * 100)}%
          </div>

          {/* Divider */}
          <div className="w-8 h-px bg-gray-300 my-2"></div>

          {/* Annotation Mode */}
          <button
            onClick={toggleAnnotationMode}
            className={`p-2 rounded-md transition-colors group ${
              isAnnotationMode
                ? "bg-green-100 text-green-700 hover:bg-green-200"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            title="Toggle annotation mode (A)"
          >
            <PencilIcon className="h-5 w-5" />
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
              <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                {boundingBoxes.length > 9 ? "9+" : boundingBoxes.length}
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
            <BoundingBoxList
              boxes={boundingBoxes}
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

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={
            contextMenu.boxIndex !== undefined
              ? selectedBoxes.size > 1 &&
                selectedBoxes.has(contextMenu.boxIndex)
                ? [
                    {
                      label: `Edit Label for ${selectedBoxes.size} items`,
                      icon: <PencilIcon className="w-4 h-4" />,
                      onClick: handleCustomLabel,
                    },
                    {
                      label: `Copy ${selectedBoxes.size} items`,
                      icon: <ClipboardDocumentIcon className="w-4 h-4" />,
                      onClick: handleCopySelection,
                      shortcut: "Ctrl+C",
                    },
                    {
                      label: `Delete ${selectedBoxes.size} items`,
                      icon: <TrashIcon className="w-4 h-4" />,
                      onClick: handleDeleteSelectedBoxes,
                      shortcut: "Del",
                    },
                  ]
                : [
                    {
                      label: "Edit Label",
                      icon: <PencilIcon className="w-4 h-4" />,
                      onClick: () => handleEditLabel(contextMenu.boxIndex!),
                    },
                    {
                      label: "Copy",
                      icon: <ClipboardDocumentIcon className="w-4 h-4" />,
                      onClick: handleCopySelection,
                      shortcut: "Ctrl+C",
                    },
                    {
                      label: "Delete",
                      icon: <TrashIcon className="w-4 h-4" />,
                      onClick: () => handleDeleteBox(contextMenu.boxIndex!),
                      shortcut: "Del",
                    },
                  ]
              : clipboardBox
                ? [
                    {
                      label: "Paste",
                      icon: <ClipboardDocumentIcon className="w-4 h-4" />,
                      onClick: handlePasteSelection,
                      shortcut: "Ctrl+V",
                    },
                  ]
                : []
          }
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
    </div>
  );
};

export default AnnotationEditor;
