/**
 * Unit tests for coordinate transformation utilities
 */

import { CoordinateUtils, LAYOUT_CONSTANTS } from './coordinates';

describe('CoordinateUtils', () => {
  describe('timeToPixel', () => {
    it('should convert time to pixel position correctly', () => {
      const time = 5; // 5 seconds
      const duration = 10; // 10 seconds total
      const totalWidth = 1000; // 1000px total width
      
      // Without frequency scale offset
      const result = CoordinateUtils.timeToPixel(time, duration, totalWidth, 1, false);
      const expectedWidth = totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
      const expected = (time / duration) * expectedWidth;
      expect(result).toBe(expected);
    });

    it('should include frequency scale offset when specified', () => {
      const time = 5;
      const duration = 10;
      const totalWidth = 1000;
      
      const result = CoordinateUtils.timeToPixel(time, duration, totalWidth, 1, true);
      const expectedWidth = totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
      const expected = (time / duration) * expectedWidth + LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
      expect(result).toBe(expected);
    });

    it('should handle zoom level correctly', () => {
      const time = 5;
      const duration = 10;
      const totalWidth = 1000;
      const zoomLevel = 2;
      
      const result = CoordinateUtils.timeToPixel(time, duration, totalWidth, zoomLevel, false);
      const expectedWidth = totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
      const expected = (time / duration) * expectedWidth * zoomLevel;
      expect(result).toBe(expected);
    });

    it('should return 0 when duration is 0', () => {
      const result = CoordinateUtils.timeToPixel(5, 0, 1000, 1, false);
      expect(result).toBe(0);
    });
  });

  describe('pixelToTime', () => {
    it('should convert pixel position to time correctly', () => {
      const x = 480; // pixel position
      const duration = 10; // 10 seconds total
      const totalWidth = 1000; // 1000px total width
      
      const result = CoordinateUtils.pixelToTime(x, duration, totalWidth, 1, false);
      const expectedWidth = totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
      const expected = (x / expectedWidth) * duration;
      expect(result).toBe(expected);
    });

    it('should account for frequency scale offset when specified', () => {
      const x = 520; // pixel position including frequency scale
      const duration = 10;
      const totalWidth = 1000;
      
      const result = CoordinateUtils.pixelToTime(x, duration, totalWidth, 1, true);
      const adjustedX = x - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
      const expectedWidth = totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
      const expected = (adjustedX / expectedWidth) * duration;
      expect(result).toBe(expected);
    });

    it('should return 0 when duration is 0', () => {
      const result = CoordinateUtils.pixelToTime(500, 0, 1000, 1, false);
      expect(result).toBe(0);
    });
  });

  describe('frequencyToPixel', () => {
    it('should convert frequency to pixel position with inverted scale', () => {
      const frequency = 10000; // 10kHz
      const maxFrequency = 20000; // 20kHz max
      const height = 500; // 500px height
      
      const result = CoordinateUtils.frequencyToPixel(frequency, maxFrequency, height);
      // High frequencies at top (inverted)
      const expected = height * (1 - frequency / maxFrequency);
      expect(result).toBe(expected);
    });

    it('should return 0 when maxFrequency is 0', () => {
      const result = CoordinateUtils.frequencyToPixel(10000, 0, 500);
      expect(result).toBe(0);
    });
  });

  describe('pixelToFrequency', () => {
    it('should convert pixel position to frequency with inverted scale', () => {
      const y = 250; // Middle of canvas
      const maxFrequency = 20000; // 20kHz max
      const height = 500; // 500px height
      
      const result = CoordinateUtils.pixelToFrequency(y, maxFrequency, height);
      // Inverted scale
      const expected = maxFrequency * (1 - y / height);
      expect(result).toBe(expected);
    });

    it('should return 0 when height is 0', () => {
      const result = CoordinateUtils.pixelToFrequency(250, 20000, 0);
      expect(result).toBe(0);
    });
  });

  describe('constrainToRange', () => {
    it('should constrain value within range', () => {
      expect(CoordinateUtils.constrainToRange(5, 0, 10)).toBe(5);
      expect(CoordinateUtils.constrainToRange(-5, 0, 10)).toBe(0);
      expect(CoordinateUtils.constrainToRange(15, 0, 10)).toBe(10);
    });
  });

  describe('constrainBoundingBox', () => {
    it('should constrain box within boundaries', () => {
      const box = { x: 100, y: 100, width: 200, height: 150 };
      const totalWidth = 1000;
      const totalHeight = 600;
      
      const result = CoordinateUtils.constrainBoundingBox(box, totalWidth, totalHeight, true);
      
      expect(result.x).toBe(100);
      expect(result.y).toBe(100);
      expect(result.width).toBe(200);
      expect(result.height).toBe(150);
    });

    it('should adjust box position when exceeding boundaries', () => {
      const box = { x: 900, y: 500, width: 200, height: 150 };
      const totalWidth = 1000;
      const totalHeight = 600;
      
      const result = CoordinateUtils.constrainBoundingBox(box, totalWidth, totalHeight, true);
      
      const maxX = totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH;
      const maxY = totalHeight * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO;
      
      expect(result.x).toBeLessThanOrEqual(maxX - result.width);
      expect(result.y).toBeLessThanOrEqual(maxY - result.height);
    });

    it('should account for frequency scale when specified', () => {
      const box = { x: 0, y: 0, width: 100, height: 100 };
      const totalWidth = 1000;
      const totalHeight = 600;
      
      const withScale = CoordinateUtils.constrainBoundingBox(box, totalWidth, totalHeight, true);
      const withoutScale = CoordinateUtils.constrainBoundingBox(box, totalWidth, totalHeight, false);
      
      // Different max X values
      expect(withScale).not.toEqual(withoutScale);
    });
  });

  describe('getSpectrogramContentDimensions', () => {
    it('should calculate correct content dimensions', () => {
      const totalWidth = 1000;
      const totalHeight = 600;
      
      const result = CoordinateUtils.getSpectrogramContentDimensions(totalWidth, totalHeight);
      
      expect(result.width).toBe(totalWidth - LAYOUT_CONSTANTS.FREQUENCY_SCALE_WIDTH);
      expect(result.height).toBe(totalHeight * LAYOUT_CONSTANTS.SPECTROGRAM_HEIGHT_RATIO);
    });
  });
});