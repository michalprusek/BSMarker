/**
 * Duration formatting utilities for the BSMarker application
 */

/**
 * Format duration in seconds to human-readable format
 * @param seconds - Duration in seconds (can be null/undefined)
 * @param format - Format type: 'short' (e.g., '1.23s') or 'long' (e.g., '1:23')
 * @returns Formatted duration string
 */
export const formatDuration = (
  seconds: number | null | undefined, 
  format: 'short' | 'long' = 'short'
): string => {
  // Handle null, undefined, NaN, or zero
  if (!seconds || isNaN(seconds) || seconds <= 0) {
    return format === 'short' ? 'Unknown' : '0:00';
  }

  if (format === 'short') {
    // Format as "X.XXs" for display in lists
    return `${seconds.toFixed(2)}s`;
  } else {
    // Format as "M:SS" for audio players
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
};

/**
 * Check if a recording has a valid duration
 * @param duration - Duration value to check
 * @returns True if duration is valid (not null/undefined/NaN/zero)
 */
export const hasValidDuration = (duration: number | null | undefined): boolean => {
  return !!(duration && !isNaN(duration) && duration > 0);
};

/**
 * Format duration for recording lists with fallback text
 * @param duration - Duration in seconds
 * @param fallbackText - Text to show when duration is invalid (default: 'Unknown')
 * @returns Formatted duration string
 */
export const formatRecordingDuration = (
  duration: number | null | undefined,
  fallbackText: string = 'Unknown'
): string => {
  return hasValidDuration(duration) ? formatDuration(duration, 'short') : fallbackText;
};