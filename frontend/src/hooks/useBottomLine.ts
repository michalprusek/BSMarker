import { useState, useCallback } from 'react';
import { CoordinateUtils } from '../utils/coordinates';

export interface BottomLineState {
  isActive: boolean;
  pixelY: number | null;
  frequency: number | null;
}

export interface UseBottomLineReturn {
  bottomLine: BottomLineState;
  isSettingBottomLine: boolean;
  setIsSettingBottomLine: (value: boolean) => void;
  setBottomLineAtPixel: (pixelY: number, frequency: number) => void;
  setBottomLineAtFrequency: (frequency: number, spectrogramHeight: number, minFreq: number, maxFreq: number) => void;
  clearBottomLine: () => void;
  getBottomLinePixelY: () => number | null;
  getBottomLineFrequency: () => number | null;
}

/**
 * Custom hook for managing bottom line (frequency boundary) state and operations.
 *
 * The bottom line acts as a virtual lower boundary for bounding boxes in the annotation editor.
 * Users can set it by clicking on the spectrogram, and all bounding boxes will be constrained
 * to not extend below this line.
 *
 * @returns Object containing bottom line state and control functions
 */
export const useBottomLine = (): UseBottomLineReturn => {
  const [bottomLine, setBottomLine] = useState<BottomLineState>({
    isActive: false,
    pixelY: null,
    frequency: null,
  });
  const [isSettingBottomLine, setIsSettingBottomLine] = useState(false);

  /**
   * Set the bottom line at a specific pixel position with corresponding frequency
   */
  const setBottomLineAtPixel = useCallback((pixelY: number, frequency: number) => {
    setBottomLine({
      isActive: true,
      pixelY,
      frequency,
    });
    setIsSettingBottomLine(false);
  }, []);

  /**
   * Set the bottom line at a specific frequency and calculate pixel position
   */
  const setBottomLineAtFrequency = useCallback((
    frequency: number,
    spectrogramHeight: number,
    minFreq: number,
    maxFreq: number
  ) => {
    // Use canonical coordinate transformation from CoordinateUtils
    const pixelY = CoordinateUtils.frequencyToPixel(frequency, maxFreq, spectrogramHeight);

    setBottomLine({
      isActive: true,
      pixelY,
      frequency,
    });
  }, []);

  /**
   * Clear/remove the bottom line
   */
  const clearBottomLine = useCallback(() => {
    setBottomLine({
      isActive: false,
      pixelY: null,
      frequency: null,
    });
    setIsSettingBottomLine(false);
  }, []);

  /**
   * Get current bottom line pixel Y position
   */
  const getBottomLinePixelY = useCallback(() => {
    return bottomLine.isActive ? bottomLine.pixelY : null;
  }, [bottomLine]);

  /**
   * Get current bottom line frequency
   */
  const getBottomLineFrequency = useCallback(() => {
    return bottomLine.isActive ? bottomLine.frequency : null;
  }, [bottomLine]);

  return {
    bottomLine,
    isSettingBottomLine,
    setIsSettingBottomLine,
    setBottomLineAtPixel,
    setBottomLineAtFrequency,
    clearBottomLine,
    getBottomLinePixelY,
    getBottomLineFrequency,
  };
};
