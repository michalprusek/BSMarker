/**
 * Centralized axis styling constants for consistent appearance
 * Ensures frequency and time axes have matching visual style
 */

export const AXIS_STYLES = {
  // Text styling
  TICK_LABEL: {
    fontSize: 11,
    fill: '#374151',      // Consistent dark gray
    fontWeight: '500' as const,
  },
  
  AXIS_LABEL: {
    fontSize: 12,
    fill: '#374151',      // Consistent dark gray
    fontWeight: '600' as const,
  },
  
  // Tick styling
  TICK_MAJOR: {
    stroke: '#374151',    // Dark gray for major ticks
    strokeWidth: 1.5,
  },
  
  TICK_MINOR: {
    stroke: '#6B7280',    // Lighter gray for minor ticks
    strokeWidth: 1,
  },
  
  // Grid line styling
  GRID_LINE: {
    stroke: '#E5E7EB',    // Light gray for grid
    strokeWidth: 0.5,
    strokeDasharray: '2,2',
  },
  
  // Axis line styling
  AXIS_LINE: {
    stroke: '#374151',
    strokeWidth: 1,
  },
  
  // Background styling
  AXIS_BACKGROUND: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',  // Gray-300 for borders
  },
} as const;

/**
 * Helper function to get consistent tick intervals based on duration and zoom
 */
export function getTimeTickInterval(duration: number, zoomLevel: number): number {
  // Consistent interval calculation
  let interval = 5; // Default 5 seconds
  
  if (zoomLevel > 8) {
    interval = 0.25;
  } else if (zoomLevel > 4) {
    interval = 0.5;
  } else if (zoomLevel > 2) {
    interval = 1;
  } else if (duration > 600) {
    interval = 60;
  } else if (duration > 300) {
    interval = 30;
  } else if (duration > 60) {
    interval = 10;
  }
  
  return interval;
}

/**
 * Format time consistently across all components
 */
export function formatTimeLabel(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  if (mins > 0) {
    return `${mins}:${secs.toFixed(0).padStart(2, '0')}`;
  }
  
  // Show decimal for sub-second precision when needed
  return secs % 1 === 0 ? `${secs}s` : `${secs.toFixed(1)}s`;
}

/**
 * Format frequency consistently
 */
export function formatFrequencyLabel(freq: number): string {
  if (freq >= 1000) {
    return `${(freq / 1000).toFixed(freq % 1000 === 0 ? 0 : 1)}k`;
  }
  return `${freq.toFixed(0)}`;
}