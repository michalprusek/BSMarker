/**
 * Custom hook for managing keyboard shortcuts in the annotation editor
 * Provides centralized keyboard event handling with consistent patterns
 */

import { useEffect, useCallback, useRef } from "react";

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  description: string;
  handler: () => void;
  preventDefault?: boolean;
}

export interface KeyboardShortcutsConfig {
  enabled?: boolean;
  shortcuts: KeyboardShortcut[];
}

/**
 * Standard keyboard shortcuts for annotation editor
 */
export const ANNOTATION_SHORTCUTS: KeyboardShortcut[] = [
  // File operations
  {
    key: "s",
    ctrl: true,
    description: "Save annotations",
    handler: () => {},
    preventDefault: true,
  },
  {
    key: "z",
    ctrl: true,
    description: "Undo",
    handler: () => {},
    preventDefault: true,
  },
  {
    key: "z",
    ctrl: true,
    shift: true,
    description: "Redo",
    handler: () => {},
    preventDefault: true,
  },
  {
    key: "y",
    ctrl: true,
    description: "Redo (alternative)",
    handler: () => {},
    preventDefault: true,
  },

  // Navigation
  {
    key: "ArrowLeft",
    alt: true,
    description: "Previous recording",
    handler: () => {},
    preventDefault: true,
  },
  {
    key: "ArrowRight",
    alt: true,
    description: "Next recording",
    handler: () => {},
    preventDefault: true,
  },
  { key: "ArrowLeft", description: "Rewind 1 second", handler: () => {} },
  { key: "ArrowRight", description: "Forward 1 second", handler: () => {} },
  {
    key: "ArrowLeft",
    shift: true,
    description: "Rewind 5 seconds",
    handler: () => {},
  },
  {
    key: "ArrowRight",
    shift: true,
    description: "Forward 5 seconds",
    handler: () => {},
  },
  { key: "Home", description: "Go to start", handler: () => {} },
  { key: "End", description: "Go to end", handler: () => {} },

  // Playback
  {
    key: " ",
    description: "Play/Pause",
    handler: () => {},
    preventDefault: true,
  },
  { key: "[", description: "Decrease speed", handler: () => {} },
  { key: "]", description: "Increase speed", handler: () => {} },
  { key: "\\", description: "Reset speed", handler: () => {} },

  // Annotation operations
  { key: "a", description: "Toggle annotation mode", handler: () => {} },
  { key: "Delete", description: "Delete selected", handler: () => {} },
  { key: "Backspace", description: "Delete selected (Mac)", handler: () => {} },
  {
    key: "a",
    ctrl: true,
    description: "Select all",
    handler: () => {},
    preventDefault: true,
  },
  {
    key: "d",
    ctrl: true,
    description: "Deselect all",
    handler: () => {},
    preventDefault: true,
  },
  {
    key: "c",
    ctrl: true,
    description: "Copy selected",
    handler: () => {},
    preventDefault: true,
  },
  {
    key: "x",
    ctrl: true,
    description: "Cut selected",
    handler: () => {},
    preventDefault: true,
  },
  {
    key: "v",
    ctrl: true,
    description: "Paste",
    handler: () => {},
    preventDefault: true,
  },

  // Zoom operations
  {
    key: "=",
    ctrl: true,
    description: "Zoom in",
    handler: () => {},
    preventDefault: true,
  },
  {
    key: "+",
    ctrl: true,
    description: "Zoom in (alternative)",
    handler: () => {},
    preventDefault: true,
  },
  {
    key: "-",
    ctrl: true,
    description: "Zoom out",
    handler: () => {},
    preventDefault: true,
  },
  {
    key: "0",
    ctrl: true,
    description: "Reset zoom",
    handler: () => {},
    preventDefault: true,
  },

  // View operations
  { key: "b", description: "Toggle sidebar", handler: () => {} },
  { key: "f", description: "Fit to screen", handler: () => {} },
  { key: "g", description: "Toggle grid", handler: () => {} },
  { key: "h", description: "Show help", handler: () => {} },
  { key: "Escape", description: "Cancel operation", handler: () => {} },
];

export function useKeyboardShortcuts(config: KeyboardShortcutsConfig) {
  const enabledRef = useRef(config.enabled ?? true);
  const shortcutsRef = useRef(config.shortcuts);

  // Update refs when config changes
  useEffect(() => {
    enabledRef.current = config.enabled ?? true;
    shortcutsRef.current = config.shortcuts;
  }, [config.enabled, config.shortcuts]);

  /**
   * Check if a keyboard event matches a shortcut
   */
  const matchesShortcut = useCallback(
    (event: KeyboardEvent, shortcut: KeyboardShortcut): boolean => {
      // Check key
      if (event.key !== shortcut.key && event.code !== shortcut.key) {
        return false;
      }

      // Check modifiers
      const ctrlMatch =
        (shortcut.ctrl ?? false) === (event.ctrlKey || event.metaKey);
      const shiftMatch = (shortcut.shift ?? false) === event.shiftKey;
      const altMatch = (shortcut.alt ?? false) === event.altKey;
      const metaMatch = (shortcut.meta ?? false) === event.metaKey;

      return ctrlMatch && shiftMatch && altMatch && metaMatch;
    },
    [],
  );

  /**
   * Handle keyboard event
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Skip if disabled
      if (!enabledRef.current) return;

      // Skip if typing in input field
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Find matching shortcut
      const shortcut = shortcutsRef.current.find((s) =>
        matchesShortcut(event, s),
      );

      if (shortcut) {
        // Prevent default if specified
        if (shortcut.preventDefault) {
          event.preventDefault();
          event.stopPropagation();
        }

        // Execute handler
        shortcut.handler();
      }
    },
    [matchesShortcut],
  );

  /**
   * Set up keyboard event listeners
   */
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  /**
   * Register a new shortcut dynamically
   */
  const registerShortcut = useCallback((shortcut: KeyboardShortcut) => {
    shortcutsRef.current = [...shortcutsRef.current, shortcut];
  }, []);

  /**
   * Unregister a shortcut
   */
  const unregisterShortcut = useCallback(
    (
      key: string,
      modifiers?: {
        ctrl?: boolean;
        shift?: boolean;
        alt?: boolean;
        meta?: boolean;
      },
    ) => {
      shortcutsRef.current = shortcutsRef.current.filter((s) => {
        if (s.key !== key) return true;
        if (modifiers) {
          return !(
            (s.ctrl ?? false) === (modifiers.ctrl ?? false) &&
            (s.shift ?? false) === (modifiers.shift ?? false) &&
            (s.alt ?? false) === (modifiers.alt ?? false) &&
            (s.meta ?? false) === (modifiers.meta ?? false)
          );
        }
        return false;
      });
    },
    [],
  );

  /**
   * Enable/disable all shortcuts
   */
  const setEnabled = useCallback((enabled: boolean) => {
    enabledRef.current = enabled;
  }, []);

  /**
   * Get list of all registered shortcuts
   */
  const getShortcuts = useCallback(() => {
    return shortcutsRef.current;
  }, []);

  /**
   * Format shortcut for display
   */
  const formatShortcut = useCallback((shortcut: KeyboardShortcut): string => {
    const parts: string[] = [];

    if (shortcut.ctrl) parts.push("Ctrl");
    if (shortcut.shift) parts.push("Shift");
    if (shortcut.alt) parts.push("Alt");
    if (shortcut.meta) parts.push("Cmd");

    // Format special keys
    let key = shortcut.key;
    if (key === " ") key = "Space";
    if (key === "ArrowLeft") key = "←";
    if (key === "ArrowRight") key = "→";
    if (key === "ArrowUp") key = "↑";
    if (key === "ArrowDown") key = "↓";

    parts.push(key);

    return parts.join("+");
  }, []);

  return {
    registerShortcut,
    unregisterShortcut,
    setEnabled,
    getShortcuts,
    formatShortcut,
  };
}

/**
 * Create keyboard shortcut handlers for annotation editor
 */
export function createAnnotationShortcuts(handlers: {
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onPreviousRecording?: () => void;
  onNextRecording?: () => void;
  onRewind?: (seconds: number) => void;
  onForward?: (seconds: number) => void;
  onGoToStart?: () => void;
  onGoToEnd?: () => void;
  onPlayPause?: () => void;
  onSpeedDecrease?: () => void;
  onSpeedIncrease?: () => void;
  onSpeedReset?: () => void;
  onToggleAnnotationMode?: () => void;
  onDelete?: () => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  onToggleSidebar?: () => void;
  onFitToScreen?: () => void;
  onToggleGrid?: () => void;
  onShowHelp?: () => void;
  onEscape?: () => void;
}): KeyboardShortcut[] {
  return [
    // File operations
    {
      key: "s",
      ctrl: true,
      description: "Save annotations",
      handler: handlers.onSave || (() => {}),
      preventDefault: true,
    },
    {
      key: "z",
      ctrl: true,
      description: "Undo",
      handler: handlers.onUndo || (() => {}),
      preventDefault: true,
    },
    {
      key: "z",
      ctrl: true,
      shift: true,
      description: "Redo",
      handler: handlers.onRedo || (() => {}),
      preventDefault: true,
    },
    {
      key: "y",
      ctrl: true,
      description: "Redo (alternative)",
      handler: handlers.onRedo || (() => {}),
      preventDefault: true,
    },

    // Navigation
    {
      key: "ArrowLeft",
      alt: true,
      description: "Previous recording",
      handler: handlers.onPreviousRecording || (() => {}),
      preventDefault: true,
    },
    {
      key: "ArrowRight",
      alt: true,
      description: "Next recording",
      handler: handlers.onNextRecording || (() => {}),
      preventDefault: true,
    },
    {
      key: "ArrowLeft",
      description: "Rewind 1 second",
      handler: () => handlers.onRewind?.(1),
    },
    {
      key: "ArrowRight",
      description: "Forward 1 second",
      handler: () => handlers.onForward?.(1),
    },
    {
      key: "ArrowLeft",
      shift: true,
      description: "Rewind 5 seconds",
      handler: () => handlers.onRewind?.(5),
    },
    {
      key: "ArrowRight",
      shift: true,
      description: "Forward 5 seconds",
      handler: () => handlers.onForward?.(5),
    },
    {
      key: "Home",
      description: "Go to start",
      handler: handlers.onGoToStart || (() => {}),
    },
    {
      key: "End",
      description: "Go to end",
      handler: handlers.onGoToEnd || (() => {}),
    },

    // Playback
    {
      key: " ",
      description: "Play/Pause",
      handler: handlers.onPlayPause || (() => {}),
      preventDefault: true,
    },
    {
      key: "[",
      description: "Decrease speed",
      handler: handlers.onSpeedDecrease || (() => {}),
    },
    {
      key: "]",
      description: "Increase speed",
      handler: handlers.onSpeedIncrease || (() => {}),
    },
    {
      key: "\\",
      description: "Reset speed",
      handler: handlers.onSpeedReset || (() => {}),
    },

    // Annotation operations
    {
      key: "a",
      description: "Toggle annotation mode",
      handler: handlers.onToggleAnnotationMode || (() => {}),
    },
    {
      key: "Delete",
      description: "Delete selected",
      handler: handlers.onDelete || (() => {}),
    },
    {
      key: "Backspace",
      description: "Delete selected (Mac)",
      handler: handlers.onDelete || (() => {}),
    },
    {
      key: "a",
      ctrl: true,
      description: "Select all",
      handler: handlers.onSelectAll || (() => {}),
      preventDefault: true,
    },
    {
      key: "d",
      ctrl: true,
      description: "Deselect all",
      handler: handlers.onDeselectAll || (() => {}),
      preventDefault: true,
    },
    {
      key: "c",
      ctrl: true,
      description: "Copy selected",
      handler: handlers.onCopy || (() => {}),
      preventDefault: true,
    },
    {
      key: "x",
      ctrl: true,
      description: "Cut selected",
      handler: handlers.onCut || (() => {}),
      preventDefault: true,
    },
    {
      key: "v",
      ctrl: true,
      description: "Paste",
      handler: handlers.onPaste || (() => {}),
      preventDefault: true,
    },

    // Zoom operations
    {
      key: "=",
      ctrl: true,
      description: "Zoom in",
      handler: handlers.onZoomIn || (() => {}),
      preventDefault: true,
    },
    {
      key: "+",
      ctrl: true,
      description: "Zoom in (alternative)",
      handler: handlers.onZoomIn || (() => {}),
      preventDefault: true,
    },
    {
      key: "-",
      ctrl: true,
      description: "Zoom out",
      handler: handlers.onZoomOut || (() => {}),
      preventDefault: true,
    },
    {
      key: "0",
      ctrl: true,
      description: "Reset zoom",
      handler: handlers.onZoomReset || (() => {}),
      preventDefault: true,
    },

    // View operations
    {
      key: "b",
      description: "Toggle sidebar",
      handler: handlers.onToggleSidebar || (() => {}),
    },
    {
      key: "f",
      description: "Fit to screen",
      handler: handlers.onFitToScreen || (() => {}),
    },
    {
      key: "g",
      description: "Toggle grid",
      handler: handlers.onToggleGrid || (() => {}),
    },
    {
      key: "h",
      description: "Show help",
      handler: handlers.onShowHelp || (() => {}),
    },
    {
      key: "Escape",
      description: "Cancel operation",
      handler: handlers.onEscape || (() => {}),
    },
  ];
}

export default useKeyboardShortcuts;
