import { useCallback } from 'react';
import CoordinateUtils, { LAYOUT_CONSTANTS } from '../utils/coordinates';

interface TimeFrequencyResult {
  start_time: number;
  end_time: number;
  min_frequency: number;
  max_frequency: number;
}

interface SpectrogramDimensions {
  width: number;
  height: number;
}

interface BoundingBoxCoords {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Custom hook for handling time and frequency conversions for bounding boxes.
 * Eliminates duplicate pixel-to-time and pixel-to-frequency conversion logic.
 */
export const useBoundingBoxTimeFrequency = (
  spectrogramDimensions: SpectrogramDimensions,
  duration: number,
  getNyquistFrequency: () => number
) => {
  /**
   * Convert bounding box pixel coordinates to time and frequency values.
   * This centralizes the conversion logic that was repeated multiple times
   * throughout the component.
   */
  const convertBoxToTimeFrequency = useCallback(
    (box: BoundingBoxCoords): TimeFrequencyResult => {
      const nyquistFreq = getNyquistFrequency();
      const spectrogramHeight = spectrogramDimensions.height * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO;

      // Convert x coordinates to time
      const start_time = CoordinateUtils.pixelToTime(
        box.x,
        duration,
        spectrogramDimensions.width,
        1, // zoom level 1 for world coordinates
        false // not using effective width
      );

      const end_time = CoordinateUtils.pixelToTime(
        box.x + box.width,
        duration,
        spectrogramDimensions.width,
        1,
        false
      );

      // Convert y coordinates to frequency
      const max_frequency = CoordinateUtils.pixelToFrequency(
        box.y,
        nyquistFreq,
        spectrogramHeight
      );

      const min_frequency = CoordinateUtils.pixelToFrequency(
        box.y + box.height,
        nyquistFreq,
        spectrogramHeight
      );

      return {
        start_time,
        end_time,
        min_frequency,
        max_frequency
      };
    },
    [spectrogramDimensions, duration, getNyquistFrequency]
  );

  /**
   * Convert normalized box coordinates (from drawing) to time and frequency.
   * Used specifically for newly drawn boxes.
   */
  const convertNormalizedBoxToTimeFrequency = useCallback(
    (normalizedBox: BoundingBoxCoords): TimeFrequencyResult => {
      const nyquistFreq = getNyquistFrequency();
      const spectrogramHeight = spectrogramDimensions.height * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO;

      const startTime = duration ? CoordinateUtils.pixelToTime(
        normalizedBox.x,
        duration,
        spectrogramDimensions.width,
        1,
        false
      ) : 0;

      const endTime = duration ? CoordinateUtils.pixelToTime(
        normalizedBox.x + normalizedBox.width,
        duration,
        spectrogramDimensions.width,
        1,
        false
      ) : 0;

      // Calculate frequencies from normalized y coordinates
      const maxFreq = nyquistFreq * (1 - normalizedBox.y / spectrogramHeight);
      const minFreq = nyquistFreq * (1 - (normalizedBox.y + normalizedBox.height) / spectrogramHeight);

      return {
        start_time: startTime,
        end_time: endTime,
        min_frequency: minFreq,
        max_frequency: maxFreq
      };
    },
    [spectrogramDimensions, duration, getNyquistFrequency]
  );

  /**
   * Get the maximum Y coordinate for spectrogram area constraints
   */
  const getMaxSpectrogramY = useCallback((): number => {
    return spectrogramDimensions.height * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO;
  }, [spectrogramDimensions.height]);

  return {
    convertBoxToTimeFrequency,
    convertNormalizedBoxToTimeFrequency,
    getMaxSpectrogramY
  };
};