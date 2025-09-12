/**
 * Annotation Editor Context for BSMarker
 * Provides shared state management for the annotation editor
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { BoundingBox, Recording } from '../types';
import { logger } from '../lib/logger';

export interface AnnotationEditorState {
  // Recording data
  recording: Recording | null;
  duration: number;
  
  // Spectrogram data
  spectrogramUrl: string | null;
  spectrogramDimensions: { width: number; height: number };
  spectrogramStatus: 'idle' | 'loading' | 'ready' | 'error';
  
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
}

export interface AnnotationEditorActions {
  // Recording actions
  setRecording: (recording: Recording | null) => void;
  setDuration: (duration: number) => void;
  
  // Spectrogram actions
  setSpectrogramUrl: (url: string | null) => void;
  setSpectrogramDimensions: (dimensions: { width: number; height: number }) => void;
  setSpectrogramStatus: (status: 'idle' | 'loading' | 'ready' | 'error') => void;
  
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
}

export interface AnnotationEditorContextType {
  state: AnnotationEditorState;
  actions: AnnotationEditorActions;
}

const AnnotationEditorContext = createContext<AnnotationEditorContextType | undefined>(undefined);

export interface AnnotationEditorProviderProps {
  children: ReactNode;
}

export const AnnotationEditorProvider: React.FC<AnnotationEditorProviderProps> = ({ children }) => {
  // Recording state
  const [recording, setRecording] = useState<Recording | null>(null);
  const [duration, setDuration] = useState(0);
  
  // Spectrogram state
  const [spectrogramUrl, setSpectrogramUrl] = useState<string | null>(null);
  const [spectrogramDimensions, setSpectrogramDimensions] = useState({ width: 800, height: 400 });
  const [spectrogramStatus, setSpectrogramStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  
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
  const [drawingBox, setDrawingBox] = useState<Partial<BoundingBox> | null>(null);
  
  // Playback state
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Annotation actions
  const addBoundingBox = useCallback((box: BoundingBox) => {
    setBoundingBoxes(prev => [...prev, box]);
    setHasUnsavedChanges(true);
    logger.debug('Added bounding box', 'AnnotationEditorContext');
  }, []);

  const updateBoundingBox = useCallback((index: number, box: BoundingBox) => {
    setBoundingBoxes(prev => {
      const updated = [...prev];
      updated[index] = box;
      return updated;
    });
    setHasUnsavedChanges(true);
    logger.debug(`Updated bounding box ${index}`, 'AnnotationEditorContext');
  }, []);

  const deleteBoundingBox = useCallback((index: number) => {
    setBoundingBoxes(prev => prev.filter((_, i) => i !== index));
    setSelectedBoxes(prev => {
      const updated = new Set(prev);
      updated.delete(index);
      // Adjust indices for remaining selected boxes
      const adjusted = new Set<number>();
      updated.forEach(i => {
        if (i > index) adjusted.add(i - 1);
        else if (i < index) adjusted.add(i);
      });
      return adjusted;
    });
    setHasUnsavedChanges(true);
    logger.debug(`Deleted bounding box ${index}`, 'AnnotationEditorContext');
  }, []);

  const deleteSelectedBoxes = useCallback(() => {
    const indicesToDelete = Array.from(selectedBoxes).sort((a, b) => b - a);
    setBoundingBoxes(prev => prev.filter((_, i) => !selectedBoxes.has(i)));
    setSelectedBoxes(new Set());
    setHasUnsavedChanges(true);
    logger.info(`Deleted ${indicesToDelete.length} selected boxes`, 'AnnotationEditorContext');
  }, [selectedBoxes]);

  // Selection actions
  const selectBox = useCallback((index: number, multiSelect: boolean = false) => {
    setSelectedBoxes(prev => {
      const updated = multiSelect ? new Set(prev) : new Set<number>();
      if (updated.has(index)) {
        updated.delete(index);
      } else {
        updated.add(index);
      }
      return updated;
    });
    logger.debug(`Selected box ${index}, multi: ${multiSelect}`, 'AnnotationEditorContext');
  }, []);

  const selectBoxes = useCallback((indices: Set<number>) => {
    setSelectedBoxes(indices);
    logger.debug(`Selected ${indices.size} boxes`, 'AnnotationEditorContext');
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedBoxes(new Set());
    logger.debug('Cleared selection', 'AnnotationEditorContext');
  }, []);

  const selectAll = useCallback(() => {
    setSelectedBoxes(new Set(boundingBoxes.map((_, i) => i)));
    logger.debug(`Selected all ${boundingBoxes.length} boxes`, 'AnnotationEditorContext');
  }, [boundingBoxes]);

  // UI actions
  const setAnnotationMode = useCallback((enabled: boolean) => {
    setIsAnnotationMode(enabled);
    if (enabled) {
      clearSelection();
    }
    logger.debug(`Annotation mode: ${enabled}`, 'AnnotationEditorContext');
  }, [clearSelection]);

  const state: AnnotationEditorState = {
    recording,
    duration,
    spectrogramUrl,
    spectrogramDimensions,
    spectrogramStatus,
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
  };

  const actions: AnnotationEditorActions = {
    setRecording,
    setDuration,
    setSpectrogramUrl,
    setSpectrogramDimensions,
    setSpectrogramStatus,
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
    throw new Error('useAnnotationEditor must be used within AnnotationEditorProvider');
  }
  return context;
};

export default AnnotationEditorContext;