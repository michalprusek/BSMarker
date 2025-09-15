/**
 * Annotation history management hook for BSMarker
 * Provides undo/redo functionality for annotation changes
 */

import { useState, useCallback, useRef } from "react";
import { BoundingBox } from "../types";
import { logger } from "../lib/logger";

const MAX_HISTORY_SIZE = 20;

export interface HistoryEntry {
  boundingBoxes: BoundingBox[];
  timestamp: number;
  action: string;
}

export interface UseAnnotationHistoryReturn {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  addToHistory: (boxes: BoundingBox[], action: string) => void;
  clearHistory: () => void;
  historySize: number;
  currentIndex: number;
}

export const useAnnotationHistory = (
  boundingBoxes: BoundingBox[],
  setBoundingBoxes: (boxes: BoundingBox[]) => void,
): UseAnnotationHistoryReturn => {
  const [history, setHistory] = useState<HistoryEntry[]>([
    { boundingBoxes: [], timestamp: Date.now(), action: "initial" },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isInternalUpdate = useRef(false);

  const addToHistory = useCallback(
    (boxes: BoundingBox[], action: string) => {
      if (isInternalUpdate.current) {
        isInternalUpdate.current = false;
        return;
      }

      setHistory((prev) => {
        // Remove any entries after current index (redo history)
        const newHistory = prev.slice(0, historyIndex + 1);

        // Add new entry
        const entry: HistoryEntry = {
          boundingBoxes: JSON.parse(JSON.stringify(boxes)), // Deep clone
          timestamp: Date.now(),
          action,
        };
        newHistory.push(entry);

        // Limit history size
        if (newHistory.length > MAX_HISTORY_SIZE) {
          newHistory.shift();
        } else {
          setHistoryIndex(newHistory.length - 1);
        }

        logger.debug(`Added to history: ${action}`, "AnnotationHistory", {
          historySize: newHistory.length,
          action,
        });

        return newHistory;
      });
    },
    [historyIndex],
  );

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const entry = history[newIndex];

      isInternalUpdate.current = true;
      setBoundingBoxes(JSON.parse(JSON.stringify(entry.boundingBoxes)));
      setHistoryIndex(newIndex);

      logger.info(`Undo: ${entry.action}`, "AnnotationHistory");
    }
  }, [historyIndex, history, setBoundingBoxes]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const entry = history[newIndex];

      isInternalUpdate.current = true;
      setBoundingBoxes(JSON.parse(JSON.stringify(entry.boundingBoxes)));
      setHistoryIndex(newIndex);

      logger.info(`Redo: ${entry.action}`, "AnnotationHistory");
    }
  }, [historyIndex, history, setBoundingBoxes]);

  const clearHistory = useCallback(() => {
    setHistory([
      {
        boundingBoxes: JSON.parse(JSON.stringify(boundingBoxes)),
        timestamp: Date.now(),
        action: "cleared",
      },
    ]);
    setHistoryIndex(0);
    logger.info("History cleared", "AnnotationHistory");
  }, [boundingBoxes]);

  return {
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    undo,
    redo,
    addToHistory,
    clearHistory,
    historySize: history.length,
    currentIndex: historyIndex,
  };
};
