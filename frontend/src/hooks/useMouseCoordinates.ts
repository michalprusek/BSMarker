import { useCallback } from 'react';
import CoordinateUtils from '../utils/coordinates';

interface MouseCoordinateResult {
  absoluteX: number;
  absolutePosition: { x: number; y: number };
  seekPosition: number;
  worldX: number;
  pos: { x: number; y: number };
  effectiveWidth: number;
}

interface SpectrogramDimensions {
  width: number;
  height: number;
}

/**
 * Custom hook for handling mouse coordinate transformations in the annotation editor.
 * Centralizes all coordinate calculations to ensure consistency and eliminate duplication.
 */
export const useMouseCoordinates = (
  spectrogramDimensions: SpectrogramDimensions,
  scrollOffset: number,
  zoomLevel: number
) => {
  /**
   * Transform mouse point to various coordinate systems needed for annotation operations.
   * This eliminates the duplicate coordinate transformation logic that was repeated
   * in handleMouseDown, handleMouseMove, and handleContextMenu.
   */
  const transformMousePoint = useCallback(
    (point: { x: number; y: number }): MouseCoordinateResult => {
      // Calculate effective width for the spectrogram
      const effectiveWidth = CoordinateUtils.getEffectiveWidth(spectrogramDimensions.width);

      // Get absolute screen position accounting for scroll offset
      const absolutePosition = CoordinateUtils.getAbsoluteScreenPosition(point, scrollOffset);
      const absoluteX = absolutePosition.x;

      // Calculate seek position (normalized 0 to 1) for audio playback
      const seekPosition = CoordinateUtils.getSeekPosition(absoluteX, effectiveWidth, zoomLevel);

      // Convert to world coordinates for bounding box operations
      // IMPORTANT: Constrain worldX to valid range when zoomed
      const maxWorldX = CoordinateUtils.getMaxWorldX(spectrogramDimensions);
      const worldX = Math.min(maxWorldX, CoordinateUtils.screenToWorldCoordinates(absoluteX, zoomLevel));

      // Create position object for bounding box operations
      const pos = { x: worldX, y: point.y };

      return {
        absoluteX,
        absolutePosition,
        seekPosition,
        worldX,
        pos,
        effectiveWidth
      };
    },
    [spectrogramDimensions, scrollOffset, zoomLevel]
  );

  /**
   * Clamp seek position to valid range [0, 1]
   */
  const clampSeekPosition = useCallback((seekPosition: number): number => {
    return Math.max(0, Math.min(1, seekPosition));
  }, []);

  /**
   * Get the maximum world X coordinate for boundary constraints
   */
  const getMaxWorldX = useCallback((): number => {
    return CoordinateUtils.getMaxWorldX(spectrogramDimensions);
  }, [spectrogramDimensions]);

  /**
   * Calculate zoomed content width
   */
  const getZoomedContentWidth = useCallback((): number => {
    return CoordinateUtils.getZoomedContentWidth(spectrogramDimensions.width, zoomLevel);
  }, [spectrogramDimensions.width, zoomLevel]);

  return {
    transformMousePoint,
    clampSeekPosition,
    getMaxWorldX,
    getZoomedContentWidth
  };
};