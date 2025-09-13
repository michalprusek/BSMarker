/**
 * Shared constants for BSMarker application
 * Single source of truth for configuration values
 */

// Annotation Editor Constants
export const ANNOTATION_CONSTANTS = {
  // Playback speeds available in the audio player
  PLAYBACK_SPEEDS: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4],
  
  // Maximum number of undo/redo history states
  MAX_HISTORY_SIZE: 20,
  
  // Default maximum frequency for spectrograms (Hz)
  DEFAULT_MAX_FREQUENCY: 22050,
  
  // Zoom limits
  MIN_ZOOM_LEVEL: 1,
  MAX_ZOOM_LEVEL: 10,
  ZOOM_STEP: 0.1,
  
  // Autosave interval (milliseconds)
  AUTOSAVE_INTERVAL: 5000,
  
  // Spectrogram generation settings
  SPECTROGRAM: {
    N_FFT: 2048,
    HOP_LENGTH: 512,
    N_MELS: 128,
  },
} as const;

// Enhanced color palette for annotations
export const LABEL_COLORS = [
  { stroke: '#6B7280', fill: 'rgba(107, 114, 128, 0.2)' },  // Gray for "None"
  { stroke: '#DC2626', fill: 'rgba(220, 38, 38, 0.25)' },   // Red
  { stroke: '#F59E0B', fill: 'rgba(245, 158, 11, 0.25)' },  // Amber
  { stroke: '#10B981', fill: 'rgba(16, 185, 129, 0.25)' },  // Emerald
  { stroke: '#2563EB', fill: 'rgba(37, 99, 235, 0.25)' },   // Blue
  { stroke: '#9333EA', fill: 'rgba(147, 51, 234, 0.25)' },  // Violet
  { stroke: '#EC4899', fill: 'rgba(236, 72, 153, 0.25)' },  // Pink
  { stroke: '#14B8A6', fill: 'rgba(20, 184, 166, 0.25)' },  // Teal
  { stroke: '#F97316', fill: 'rgba(249, 115, 22, 0.25)' },  // Orange
  { stroke: '#84CC16', fill: 'rgba(132, 204, 22, 0.25)' },  // Lime
] as const;

// File upload constraints
export const FILE_UPLOAD = {
  // Maximum file size in bytes (100MB)
  MAX_SIZE: 104857600,
  
  // Allowed audio file extensions
  ALLOWED_EXTENSIONS: ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac'],
  
  // Allowed MIME types
  ALLOWED_MIME_TYPES: [
    'audio/mpeg',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/mp4',
    'audio/x-m4a',
    'audio/flac',
    'audio/ogg',
    'audio/aac',
  ],
} as const;

// API endpoints configuration
export const API_CONFIG = {
  // Base URL is configured via environment variable
  BASE_URL: process.env.REACT_APP_API_URL || 'http://localhost:8000',
  
  // API version prefix
  API_VERSION: '/api/v1',
  
  // Request timeout (milliseconds)
  TIMEOUT: 30000,
  
  // Retry configuration
  RETRY: {
    MAX_ATTEMPTS: 3,
    DELAY: 1000,
    BACKOFF_FACTOR: 2,
  },
} as const;

// Pagination defaults
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

// Toast notification settings
export const TOAST_CONFIG = {
  // Default duration in milliseconds
  DURATION: 4000,
  
  // Success toast duration
  SUCCESS_DURATION: 3000,
  
  // Error toast duration
  ERROR_DURATION: 5000,
  
  // Position on screen
  POSITION: 'top-right' as const,
} as const;

// Keyboard shortcuts
export const KEYBOARD_SHORTCUTS = {
  // Playback controls
  PLAY_PAUSE: ' ',
  STOP: 'Escape',
  
  // Mode selection
  SELECT_MODE: 's',
  DRAW_MODE: 'd',
  PAN_MODE: 'p',
  
  // Zoom controls
  ZOOM_IN: '=',
  ZOOM_OUT: '-',
  RESET_ZOOM: '0',
  
  // Edit operations
  DELETE: ['Delete', 'Backspace'],
  UNDO: 'z',
  REDO: 'y',
  SAVE: 's',
  
  // Modifiers
  CTRL_OR_CMD: navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? 'metaKey' : 'ctrlKey',
} as const;

// Validation rules
export const VALIDATION = {
  // User validation
  USER: {
    USERNAME_MIN_LENGTH: 3,
    USERNAME_MAX_LENGTH: 50,
    PASSWORD_MIN_LENGTH: 8,
    PASSWORD_MAX_LENGTH: 128,
    EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  
  // Project validation
  PROJECT: {
    NAME_MIN_LENGTH: 3,
    NAME_MAX_LENGTH: 100,
    DESCRIPTION_MAX_LENGTH: 500,
  },
  
  // Annotation validation
  ANNOTATION: {
    LABEL_MAX_LENGTH: 50,
    MIN_BOX_SIZE: 5, // pixels
    MIN_DURATION: 0.01, // seconds
    MIN_FREQUENCY_RANGE: 10, // Hz
  },
} as const;

export default {
  ANNOTATION_CONSTANTS,
  LABEL_COLORS,
  FILE_UPLOAD,
  API_CONFIG,
  PAGINATION,
  TOAST_CONFIG,
  KEYBOARD_SHORTCUTS,
  VALIDATION,
};