/**
 * Centralized coordinate system utilities for BSMarker
 * Ensures consistent alignment between spectrogram and waveform displays
 */

// Layout constants
export const LAYOUT_CONSTANTS = {
  FREQUENCY_SCALE_WIDTH: 40,  // Width of the frequency scale on the left
  SPECTROGRAM_HEIGHT_RATIO: 0.72,  // 72% of total height
  TIMELINE_HEIGHT_RATIO: 0.04,  // 4% for timeline
  WAVEFORM_HEIGHT_RATIO: 0.24,  // 24% for waveform
} as const;

// Coordinate transformation utilities
export const CoordinateUtils = {
  /**
   * Convert time to pixel position (accounting for frequency scale offset)
   * @param time - Time in seconds
   * @param duration - Total duration of the recording in seconds
   * @param totalWidth - Total width of the canvas in pixels
   * @param zoomLevel - Current zoom level (default: 1)
   * @param includeFrequencyScale - Whether to include frequency scale offset (default: false)
   * @returns Pixel position on the x-axis
   */
  timeToPixel(
    time: number,
    duration: number,
    totalWidth: number,
    zoomLevel: number = 1,
    includeFrequencyScale: boolean = false
  ): number {
    if (duration === 0) return 0;
    
    // The actual spectrogram width (excluding frequency scale)
    const spectrogramWidth = totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
    
    // Calculate position relative to spectrogram content area
    const position = (time / duration) * spectrogramWidth * zoomLevel;
    
    // Add frequency scale offset if needed for absolute positioning
    return includeFrequencyScale ? position + LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH : position;
  },

  /**
   * Convert pixel position to time (accounting for frequency scale offset)
   */
  pixelToTime(
    x: number,
    duration: number,
    totalWidth: number,
    zoomLevel: number = 1,
    includeFrequencyScale: boolean = false
  ): number {
    if (duration === 0) return 0;
    
    // Adjust for frequency scale if x includes it
    const adjustedX = includeFrequencyScale ? x - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH : x;
    
    // The actual spectrogram width (excluding frequency scale)
    const spectrogramWidth = totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
    
    // Calculate time from position
    return (adjustedX / (spectrogramWidth * zoomLevel)) * duration;
  },

  /**
   * Convert frequency to pixel position (y-axis)
   */
  frequencyToPixel(
    frequency: number,
    maxFrequency: number,
    height: number
  ): number {
    if (maxFrequency === 0) return 0;
    // Frequency scale is inverted (high frequencies at top)
    return height * (1 - frequency / maxFrequency);
  },

  /**
   * Convert pixel position to frequency (y-axis)
   */
  pixelToFrequency(
    y: number,
    maxFrequency: number,
    height: number
  ): number {
    if (height === 0) return 0;
    // Frequency scale is inverted (high frequencies at top)
    return maxFrequency * (1 - y / height);
  },

  /**
   * Constrain a value to a range
   */
  constrainToRange(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  },

  /**
   * Constrain a bounding box to stay within boundaries
   * Accounts for the frequency scale offset
   */
  constrainBoundingBox(
    box: {
      x: number;
      y: number;
      width: number;
      height: number;
    },
    totalWidth: number,
    totalHeight: number,
    accountForFrequencyScale: boolean = true
  ): typeof box {
    // The actual drawable area (excluding frequency scale)
    const maxX = accountForFrequencyScale 
      ? totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH 
      : totalWidth;
    const maxY = totalHeight * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO; // Only spectrogram area
    
    // Constrain position to keep box fully within boundaries
    const constrainedX = this.constrainToRange(box.x, 0, Math.max(0, maxX - box.width));
    const constrainedY = this.constrainToRange(box.y, 0, Math.max(0, maxY - box.height));
    
    // Constrain size if box is too large for remaining space
    const constrainedWidth = Math.min(box.width, maxX - constrainedX);
    const constrainedHeight = Math.min(box.height, maxY - constrainedY);
    
    return {
      x: constrainedX,
      y: constrainedY,
      width: constrainedWidth,
      height: constrainedHeight,
    };
  },

  /**
   * Calculate spectrogram content dimensions
   */
  getSpectrogramContentDimensions(
    totalWidth: number,
    totalHeight: number
  ): { width: number; height: number } {
    return {
      width: totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH,
      height: totalHeight * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO,
    };
  },
};

export default CoordinateUtils;