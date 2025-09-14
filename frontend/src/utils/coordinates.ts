/**
 * Centralized coordinate system utilities for BSMarker
 * Ensures consistent alignment between spectrogram and waveform displays
 */

// Layout constants - must match the actual layout in AnnotationEditor.tsx
export const LAYOUT_CONSTANTS = {
  FREQUENCY_SCALE_WIDTH: 40,  // Width of the frequency scale on the left
  SPECTROGRAM_HEIGHT_RATIO: 0.65,  // 65% of total height for spectrogram (increased from 60%)
  TIMELINE_TOP_RATIO: 0.65,  // Timeline starts at 65% (right after spectrogram)
  TIMELINE_HEIGHT_RATIO: 0.08,  // 8% for timeline
  WAVEFORM_TOP_RATIO: 0.73,  // Waveform starts at 73% (after timeline)
  WAVEFORM_HEIGHT_RATIO: 0.27,  // 27% for waveform (reduced from 32%)
} as const;

// Coordinate transformation utilities
export const CoordinateUtils = {
  /**
   * Convert time to pixel position (accounting for frequency scale offset)
   * @param time - Time in seconds
   * @param duration - Total duration of the recording in seconds
   * @param totalWidth - Total width of the canvas in pixels (including frequency scale)
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
   * Calculate the zoomed content width (excluding frequency scale)
   * This is used for Stage and container width calculations
   */
  getZoomedContentWidth(totalWidth: number, zoomLevel: number = 1): number {
    return (totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH) * zoomLevel;
  },

  /**
   * Calculate the total container width including frequency scale
   * Frequency scale stays fixed width while content area zooms
   */
  getZoomedContainerWidth(totalWidth: number, zoomLevel: number = 1): number {
    return this.getZoomedContentWidth(totalWidth, zoomLevel) + LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
  },

  /**
   * Constrain a bounding box to stay within boundaries
   * Accounts for the frequency scale offset and zoom level
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
    accountForFrequencyScale: boolean = true,
    zoomLevel: number = 1
  ): typeof box {
    // The actual drawable area (excluding frequency scale) with zoom applied
    // When zoomed, only the content area zooms, not the frequency scale
    const effectiveWidth = accountForFrequencyScale
      ? (totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH) * zoomLevel
      : totalWidth * zoomLevel;

    const maxX = effectiveWidth;
    const maxY = totalHeight * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO * zoomLevel; // Only spectrogram area, zoomed

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