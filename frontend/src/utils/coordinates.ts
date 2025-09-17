/**
 * Centralized coordinate system utilities for BSMarker
 * Ensures consistent alignment between spectrogram and waveform displays
 */

// Layout constants - must match the actual layout in AnnotationEditor.tsx
export const LAYOUT_CONSTANTS = {
  FREQUENCY_SCALE_WIDTH: 40, // Width of the frequency scale on the left (logical pixels)
  SPECTROGRAM_HEIGHT_RATIO: 0.65, // 65% of total height for spectrogram (increased from 60%)
  TIMELINE_TOP_RATIO: 0.65, // Timeline starts at 65% (right after spectrogram)
  TIMELINE_HEIGHT_RATIO: 0.08, // 8% for timeline
  WAVEFORM_TOP_RATIO: 0.73, // Waveform starts at 73% (after timeline)
  WAVEFORM_HEIGHT_RATIO: 0.27, // 27% for waveform (reduced from 32%)
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
    includeFrequencyScale: boolean = false,
  ): number {
    if (duration === 0) return 0;

    // The actual spectrogram width (excluding frequency scale)
    const spectrogramWidth =
      totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;

    // Calculate position relative to spectrogram content area
    const position = (time / duration) * spectrogramWidth * zoomLevel;

    // Add frequency scale offset if needed for absolute positioning
    return includeFrequencyScale
      ? position + LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH
      : position;
  },

  /**
   * Convert pixel position to time (accounting for frequency scale offset)
   */
  pixelToTime(
    x: number,
    duration: number,
    totalWidth: number,
    zoomLevel: number = 1,
    includeFrequencyScale: boolean = false,
  ): number {
    if (duration === 0) return 0;

    // Adjust for frequency scale if x includes it
    const adjustedX = includeFrequencyScale
      ? x - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH
      : x;

    // The actual spectrogram width (excluding frequency scale)
    const spectrogramWidth =
      totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;

    // Calculate time from position
    return (adjustedX / (spectrogramWidth * zoomLevel)) * duration;
  },

  /**
   * Convert frequency to pixel position (y-axis)
   */
  frequencyToPixel(
    frequency: number,
    maxFrequency: number,
    height: number,
  ): number {
    if (maxFrequency === 0) return 0;
    // Frequency scale is inverted (high frequencies at top)
    return height * (1 - frequency / maxFrequency);
  },

  /**
   * Convert pixel position to frequency (y-axis)
   */
  pixelToFrequency(y: number, maxFrequency: number, height: number): number {
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
    return (
      this.getZoomedContentWidth(totalWidth, zoomLevel) +
      LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH
    );
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
    zoomLevel: number = 1,
  ): typeof box {
    // The actual drawable area (excluding frequency scale) with zoom applied
    // When zoomed, only the content area zooms, not the frequency scale
    const effectiveWidth = accountForFrequencyScale
      ? (totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH) * zoomLevel
      : totalWidth * zoomLevel;

    const maxX = effectiveWidth;
    const maxY =
      totalHeight * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO * zoomLevel; // Only spectrogram area, zoomed

    // Constrain position to keep box fully within boundaries
    const constrainedX = this.constrainToRange(
      box.x,
      0,
      Math.max(0, maxX - box.width),
    );
    const constrainedY = this.constrainToRange(
      box.y,
      0,
      Math.max(0, maxY - box.height),
    );

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
    totalHeight: number,
  ): { width: number; height: number } {
    return {
      width: totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH,
      height: totalHeight * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO,
    };
  },

  /**
   * Get effective width (content area without frequency scale)
   * This is one of the most frequently used calculations
   */
  getEffectiveWidth(totalWidth: number): number {
    return totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
  },

  /**
   * Get device pixel ratio for high-DPI display support
   * Returns 1 as fallback for older browsers
   */
  getDevicePixelRatio(): number {
    return window.devicePixelRatio || 1;
  },

  /**
   * Apply device pixel ratio to canvas dimensions
   * Used for high-DPI canvas rendering
   */
  getCanvasDimensions(
    width: number,
    height: number,
    zoomLevel: number = 1,
  ): {
    canvasWidth: number;
    canvasHeight: number;
    styleWidth: string;
    styleHeight: string;
  } {
    const pixelRatio = this.getDevicePixelRatio();
    return {
      canvasWidth: Math.round(width * zoomLevel * pixelRatio),
      canvasHeight: Math.round(height * pixelRatio),
      styleWidth: `${Math.round(width * zoomLevel)}px`,
      styleHeight: `${Math.round(height)}px`,
    };
  },

  /**
   * Get absolute screen position accounting for scroll offset
   * Used when converting Konva stage coordinates to absolute positions
   */
  getAbsoluteScreenPosition(
    point: { x: number; y: number },
    scrollOffset: number,
  ): { x: number; y: number } {
    return {
      x: point.x + scrollOffset,
      y: point.y,
    };
  },

  /**
   * Convert screen coordinates to world coordinates (unzoomed space)
   * World coordinates are the base coordinate system before zoom is applied
   */
  screenToWorldCoordinates(screenX: number, zoomLevel: number = 1): number {
    return screenX / zoomLevel;
  },

  /**
   * Convert world coordinates to screen coordinates (zoomed space)
   * Screen coordinates are the displayed coordinates after zoom is applied
   */
  worldToScreenCoordinates(worldX: number, zoomLevel: number = 1): number {
    return worldX * zoomLevel;
  },

  /**
   * Get normalized seek position (0-1) for audio/video seeking
   * This is invariant to zoom and scroll for consistent seeking behavior
   */
  getSeekPosition(
    absoluteX: number,
    effectiveWidth: number,
    zoomLevel: number = 1,
  ): number {
    const zoomedWidth = effectiveWidth * zoomLevel;
    if (zoomedWidth === 0) return 0;

    // Clamp to valid range [0, 1]
    return Math.max(0, Math.min(1, absoluteX / zoomedWidth));
  },

  /**
   * Get maximum world X coordinate for boundary constraints
   * This represents the rightmost valid position in world coordinates
   */
  getMaxWorldX(spectrogramDimensions: { width: number }): number {
    return this.getEffectiveWidth(spectrogramDimensions.width) - 1;
  },

  /**
   * Transform bounding box coordinates from world space to screen space
   * Used for rendering bounding boxes with zoom applied
   * Now includes sub-pixel rounding for display resolution consistency
   */
  transformBoxToScreen(
    box: {
      x: number;
      y: number;
      width: number;
      height: number;
    },
    zoomLevel: number = 1,
  ): {
    screenX: number;
    screenY: number;
    screenWidth: number;
    screenHeight: number;
  } {
    // Apply sub-pixel rounding for crisp rendering
    // This ensures boxes align properly on all display resolutions
    return {
      screenX: Math.round(this.worldToScreenCoordinates(box.x, zoomLevel)),
      screenY: Math.round(box.y), // No vertical zoom, but round for pixel alignment
      screenWidth: Math.round(
        this.worldToScreenCoordinates(box.width, zoomLevel),
      ),
      screenHeight: Math.round(box.height), // No vertical zoom, but round for pixel alignment
    };
  },

  /**
   * Calculate timeline cursor position with zoom
   * Used for rendering the current playback position indicator
   */
  getTimelineCursorPosition(
    currentTime: number,
    duration: number,
    spectrogramDimensions: { width: number },
    zoomLevel: number = 1,
  ): number {
    if (duration === 0) return 0;

    const effectiveWidth = this.getEffectiveWidth(spectrogramDimensions.width);
    return (currentTime / duration) * effectiveWidth * zoomLevel;
  },

  /**
   * Convert stage coordinates to world coordinates with constraints
   * Combines absolute position calculation, world conversion, and boundary constraints
   */
  stageToWorldCoordinates(
    stagePoint: { x: number; y: number },
    scrollOffset: number,
    zoomLevel: number,
    spectrogramDimensions: { width: number; height: number },
  ): { x: number; y: number } {
    // Get absolute position accounting for scroll
    const absolute = this.getAbsoluteScreenPosition(stagePoint, scrollOffset);

    // Convert to world coordinates
    const worldX = this.screenToWorldCoordinates(absolute.x, zoomLevel);

    // Constrain to valid boundaries
    const maxWorldX = this.getMaxWorldX(spectrogramDimensions);
    const constrainedX = this.constrainToRange(worldX, 0, maxWorldX);

    return {
      x: constrainedX,
      y: stagePoint.y, // No vertical transformation needed
    };
  },

  /**
   * Calculate the zoomed and scrolled position for a given time
   * Useful for synchronizing timeline elements with audio playback
   */
  getZoomedTimePosition(
    time: number,
    duration: number,
    spectrogramDimensions: { width: number },
    zoomLevel: number = 1,
    scrollOffset: number = 0,
  ): number {
    const pixelPosition = this.timeToPixel(
      time,
      duration,
      spectrogramDimensions.width,
      zoomLevel,
      false,
    );

    // Adjust for scroll offset to get screen position
    return pixelPosition - scrollOffset;
  },
};

export default CoordinateUtils;
