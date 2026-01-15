/**
 * Annotation Editor Context for BSMarker
 * Provides shared state management for the annotation editor
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { BoundingBox, Recording } from "../types";
import { logger } from "../lib/logger";

export interface AnnotationEditorState {
  // Recording data
  recording: Recording | null;
  duration: number;
  projectRecordings: Recording[];
  currentRecordingIndex: number;

  // Spectrogram data
  spectrogramUrl: string | null;
  spectrogramDimensions: { width: number; height: number };
  baseSpectrogramDimensions: { width: number; height: number };
  spectrogramStatus: "idle" | "loading" | "ready" | "error";
  spectrogramError: string | null;

  // Annotation data
  boundingBoxes: BoundingBox[];
  selectedBoxes: Set<number>;

  // UI state
  isAnnotationMode: boolean;
  zoomLevel: number;
  scrollOffset: number;
  hasUnsavedChanges: boolean;

  // Drawing state
  isDrawing: boolean;
  drawingBox: Partial<BoundingBox> | null;

  // Playback state
  currentTime: number;
  isPlaying: boolean;

  // History for undo/redo
  history: BoundingBox[][];
  historyIndex: number;

  // Saving state
  isSaving: boolean;
  lastSaveTime: Date | null;
}

export interface AnnotationEditorActions {
  // Recording actions
  setRecording: (recording: Recording | null) => void;
  setDuration: (duration: number) => void;
  setProjectRecordings: (recordings: Recording[]) => void;
  setCurrentRecordingIndex: (index: number) => void;

  // Spectrogram actions
  setSpectrogramUrl: (url: string | null) => void;
  setSpectrogramDimensions: (dimensions: {
    width: number;
    height: number;
  }) => void;
  setBaseSpectrogramDimensions: (dimensions: {
    width: number;
    height: number;
  }) => void;
  setSpectrogramStatus: (
    status: "idle" | "loading" | "ready" | "error",
  ) => void;
  setSpectrogramError: (error: string | null) => void;

  // Annotation actions
  setBoundingBoxes: (boxes: BoundingBox[]) => void;
  addBoundingBox: (box: BoundingBox) => void;
  updateBoundingBox: (index: number, box: BoundingBox) => void;
  deleteBoundingBox: (index: number) => void;
  deleteSelectedBoxes: () => void;

  // Selection actions
  selectBox: (index: number, multiSelect?: boolean) => void;
  selectBoxes: (indices: Set<number>) => void;
  clearSelection: () => void;
  selectAll: () => void;

  // UI actions
  setAnnotationMode: (enabled: boolean) => void;
  setZoomLevel: (level: number) => void;
  setScrollOffset: (offset: number) => void;
  setHasUnsavedChanges: (hasChanges: boolean) => void;

  // Drawing actions
  setIsDrawing: (drawing: boolean) => void;
  setDrawingBox: (box: Partial<BoundingBox> | null) => void;

  // Playback actions
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;

  // History actions
  addToHistory: (boxes: BoundingBox[]) => void;
  undo: () => BoundingBox[] | null;
  redo: () => BoundingBox[] | null;
  clearHistory: () => void;

  // Saving actions
  setIsSaving: (saving: boolean) => void;
  setLastSaveTime: (time: Date | null) => void;
}

export interface AnnotationEditorContextType {
  state: AnnotationEditorState;
  actions: AnnotationEditorActions;
}

const AnnotationEditorContext = createContext<
  AnnotationEditorContextType | undefined
>(undefined);

export interface AnnotationEditorProviderProps {
  children: ReactNode;
}

const MAX_HISTORY_SIZE = 50;

export const AnnotationEditorProvider: React.FC<
  AnnotationEditorProviderProps
> = ({ children }) => {
  // Recording state
  const [recording, setRecording] = useState<Recording | null>(null);
  const [duration, setDuration] = useState(0);
  const [projectRecordings, setProjectRecordings] = useState<Recording[]>([]);
  const [currentRecordingIndex, setCurrentRecordingIndex] = useState(0);

  // Spectrogram state
  const [spectrogramUrl, setSpectrogramUrl] = useState<string | null>(null);
  const [spectrogramDimensions, setSpectrogramDimensions] = useState({
    width: 800,
    height: 400,
  });
  const [baseSpectrogramDimensions, setBaseSpectrogramDimensions] = useState({
    width: 800,
    height: 400,
  });
  const [spectrogramStatus, setSpectrogramStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [spectrogramError, setSpectrogramError] = useState<string | null>(null);

  // Annotation state
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [selectedBoxes, setSelectedBoxes] = useState<Set<number>>(new Set());

  // UI state
  const [isAnnotationMode, setIsAnnotationMode] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingBox, setDrawingBox] = useState<Partial<BoundingBox> | null>(
    null,
  );

  // Playback state
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // History state for undo/redo
  const [history, setHistory] = useState<BoundingBox[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Saving state
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);

  // Annotation actions
  const addBoundingBox = useCallback((box: BoundingBox) => {
    setBoundingBoxes((prev) => [...prev, box]);
    setHasUnsavedChanges(true);
    logger.debug("Added bounding box", "AnnotationEditorContext");
  }, []);

  const updateBoundingBox = useCallback((index: number, box: BoundingBox) => {
    setBoundingBoxes((prev) => {
      const updated = [...prev];
      updated[index] = box;
      return updated;
    });
    setHasUnsavedChanges(true);
    logger.debug(`Updated bounding box ${index}`, "AnnotationEditorContext");
  }, []);

  const deleteBoundingBox = useCallback((index: number) => {
    setBoundingBoxes((prev) => prev.filter((_, i) => i !== index));
    setSelectedBoxes((prev) => {
      const updated = new Set(prev);
      updated.delete(index);
      // Adjust indices for remaining selected boxes
      const adjusted = new Set<number>();
      updated.forEach((i) => {
        if (i > index) adjusted.add(i - 1);
        else if (i < index) adjusted.add(i);
      });
      return adjusted;
    });
    setHasUnsavedChanges(true);
    logger.debug(`Deleted bounding box ${index}`, "AnnotationEditorContext");
  }, []);

  const deleteSelectedBoxes = useCallback(() => {
    const indicesToDelete = Array.from(selectedBoxes).sort((a, b) => b - a);
    setBoundingBoxes((prev) => prev.filter((_, i) => !selectedBoxes.has(i)));
    setSelectedBoxes(new Set());
    setHasUnsavedChanges(true);
    logger.info(
      `Deleted ${indicesToDelete.length} selected boxes`,
      "AnnotationEditorContext",
    );
  }, [selectedBoxes]);

  // Selection actions
  const selectBox = useCallback(
    (index: number, multiSelect: boolean = false) => {
      setSelectedBoxes((prev) => {
        const updated = multiSelect ? new Set(prev) : new Set<number>();
        if (updated.has(index)) {
          updated.delete(index);
        } else {
          updated.add(index);
        }
        return updated;
      });
      logger.debug(
        `Selected box ${index}, multi: ${multiSelect}`,
        "AnnotationEditorContext",
      );
    },
    [],
  );

  const selectBoxes = useCallback((indices: Set<number>) => {
    setSelectedBoxes(indices);
    logger.debug(`Selected ${indices.size} boxes`, "AnnotationEditorContext");
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedBoxes(new Set());
    logger.debug("Cleared selection", "AnnotationEditorContext");
  }, []);

  const selectAll = useCallback(() => {
    setSelectedBoxes(new Set(boundingBoxes.map((_, i) => i)));
    logger.debug(
      `Selected all ${boundingBoxes.length} boxes`,
      "AnnotationEditorContext",
    );
  }, [boundingBoxes]);

  // UI actions
  const setAnnotationMode = useCallback(
    (enabled: boolean) => {
      setIsAnnotationMode(enabled);
      if (enabled) {
        clearSelection();
      }
      logger.debug(`Annotation mode: ${enabled}`, "AnnotationEditorContext");
    },
    [clearSelection],
  );

  // History actions
  const addToHistory = useCallback((boxes: BoundingBox[]) => {
    setHistory((prev) => {
      // Remove any redo states after current index
      const newHistory = prev.slice(0, historyIndex + 1);
      // Add new state
      newHistory.push(JSON.parse(JSON.stringify(boxes)));
      // Limit history size
      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
      }
      return newHistory;
    });
    setHistoryIndex((prev) => Math.min(prev + 1, MAX_HISTORY_SIZE - 1));
    logger.debug("Added to history", "AnnotationEditorContext");
  }, [historyIndex]);

  const undo = useCallback((): BoundingBox[] | null => {
    if (historyIndex <= 0) {
      logger.debug("Nothing to undo", "AnnotationEditorContext");
      return null;
    }
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    const previousState = history[newIndex];
    if (previousState) {
      setBoundingBoxes(JSON.parse(JSON.stringify(previousState)));
      setHasUnsavedChanges(true);
      logger.debug(`Undo to index ${newIndex}`, "AnnotationEditorContext");
      return previousState;
    }
    return null;
  }, [historyIndex, history]);

  const redo = useCallback((): BoundingBox[] | null => {
    if (historyIndex >= history.length - 1) {
      logger.debug("Nothing to redo", "AnnotationEditorContext");
      return null;
    }
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    const nextState = history[newIndex];
    if (nextState) {
      setBoundingBoxes(JSON.parse(JSON.stringify(nextState)));
      setHasUnsavedChanges(true);
      logger.debug(`Redo to index ${newIndex}`, "AnnotationEditorContext");
      return nextState;
    }
    return null;
  }, [historyIndex, history]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setHistoryIndex(-1);
    logger.debug("History cleared", "AnnotationEditorContext");
  }, []);

  const state: AnnotationEditorState = {
    recording,
    duration,
    projectRecordings,
    currentRecordingIndex,
    spectrogramUrl,
    spectrogramDimensions,
    baseSpectrogramDimensions,
    spectrogramStatus,
    spectrogramError,
    boundingBoxes,
    selectedBoxes,
    isAnnotationMode,
    zoomLevel,
    scrollOffset,
    hasUnsavedChanges,
    isDrawing,
    drawingBox,
    currentTime,
    isPlaying,
    history,
    historyIndex,
    isSaving,
    lastSaveTime,
  };

  const actions: AnnotationEditorActions = {
    setRecording,
    setDuration,
    setProjectRecordings,
    setCurrentRecordingIndex,
    setSpectrogramUrl,
    setSpectrogramDimensions,
    setBaseSpectrogramDimensions,
    setSpectrogramStatus,
    setSpectrogramError,
    setBoundingBoxes,
    addBoundingBox,
    updateBoundingBox,
    deleteBoundingBox,
    deleteSelectedBoxes,
    selectBox,
    selectBoxes,
    clearSelection,
    selectAll,
    setAnnotationMode,
    setZoomLevel,
    setScrollOffset,
    setHasUnsavedChanges,
    setIsDrawing,
    setDrawingBox,
    setCurrentTime,
    setIsPlaying,
    addToHistory,
    undo,
    redo,
    clearHistory,
    setIsSaving,
    setLastSaveTime,
  };

  const value: AnnotationEditorContextType = {
    state,
    actions,
  };

  return (
    <AnnotationEditorContext.Provider value={value}>
      {children}
    </AnnotationEditorContext.Provider>
  );
};

// Custom hook to use the context
export const useAnnotationEditor = (): AnnotationEditorContextType => {
  const context = useContext(AnnotationEditorContext);
  if (!context) {
    throw new Error(
      "useAnnotationEditor must be used within AnnotationEditorProvider",
    );
  }
  return context;
};

export default AnnotationEditorContext;
