import {
  SpectrogramCoordinates,
  SpectrogramOptimizations,
  SpectrogramData,
  SpectrogramDimensions,
  WorldCoordinates,
  PixelCoordinates,
  BoundingBox,
} from "../spectrogram-utils";

describe("SpectrogramCoordinates", () => {
  const mockDimensions: SpectrogramDimensions = {
    width: 1200,
    height: 600,
    duration: 30, // 30 seconds
    minFrequency: 0,
    maxFrequency: 22050, // 22.05 kHz
  };

  describe("timeToPixel", () => {
    it("should convert time 0 to pixel 0", () => {
      const result = SpectrogramCoordinates.timeToPixel(0, 1200, 30);
      expect(result).toBe(0);
    });

    it("should convert half duration to half width", () => {
      const result = SpectrogramCoordinates.timeToPixel(15, 1200, 30);
      expect(result).toBe(600);
    });

    it("should convert full duration to full width", () => {
      const result = SpectrogramCoordinates.timeToPixel(30, 1200, 30);
      expect(result).toBe(1200);
    });

    it("should handle zero duration gracefully", () => {
      const result = SpectrogramCoordinates.timeToPixel(15, 1200, 0);
      expect(result).toBe(0);
    });

    it("should handle fractional time values correctly", () => {
      const result = SpectrogramCoordinates.timeToPixel(7.5, 1200, 30);
      expect(result).toBe(300);
    });
  });

  describe("pixelToTime", () => {
    it("should convert pixel 0 to time 0", () => {
      const result = SpectrogramCoordinates.pixelToTime(0, 1200, 30);
      expect(result).toBe(0);
    });

    it("should convert half width to half duration", () => {
      const result = SpectrogramCoordinates.pixelToTime(600, 1200, 30);
      expect(result).toBe(15);
    });

    it("should convert full width to full duration", () => {
      const result = SpectrogramCoordinates.pixelToTime(1200, 1200, 30);
      expect(result).toBe(30);
    });

    it("should handle zero width gracefully", () => {
      const result = SpectrogramCoordinates.pixelToTime(600, 0, 30);
      expect(result).toBe(0);
    });

    it("should handle fractional pixel values correctly", () => {
      const result = SpectrogramCoordinates.pixelToTime(300, 1200, 30);
      expect(result).toBe(7.5);
    });
  });

  describe("frequencyToPixel", () => {
    it("should convert max frequency to pixel 0 (inverted Y-axis)", () => {
      const result = SpectrogramCoordinates.frequencyToPixel(
        22050,
        0,
        22050,
        600,
      );
      expect(result).toBe(0);
    });

    it("should convert min frequency to max height (inverted Y-axis)", () => {
      const result = SpectrogramCoordinates.frequencyToPixel(0, 0, 22050, 600);
      expect(result).toBe(600);
    });

    it("should convert mid frequency to mid height (inverted)", () => {
      const result = SpectrogramCoordinates.frequencyToPixel(
        11025,
        0,
        22050,
        600,
      );
      expect(result).toBe(300);
    });

    it("should handle equal min and max frequency gracefully", () => {
      const result = SpectrogramCoordinates.frequencyToPixel(
        1000,
        1000,
        1000,
        600,
      );
      expect(result).toBe(0);
    });

    it("should handle frequencies within custom range", () => {
      const result = SpectrogramCoordinates.frequencyToPixel(
        1500,
        1000,
        2000,
        400,
      );
      expect(result).toBe(200); // Half way = (1 - 0.5) * 400 = 200
    });
  });

  describe("pixelToFrequency", () => {
    it("should convert pixel 0 to max frequency (inverted Y-axis)", () => {
      const result = SpectrogramCoordinates.pixelToFrequency(0, 600, 0, 22050);
      expect(result).toBe(22050);
    });

    it("should convert max height to min frequency (inverted Y-axis)", () => {
      const result = SpectrogramCoordinates.pixelToFrequency(
        600,
        600,
        0,
        22050,
      );
      expect(result).toBe(0);
    });

    it("should convert mid height to mid frequency (inverted)", () => {
      const result = SpectrogramCoordinates.pixelToFrequency(
        300,
        600,
        0,
        22050,
      );
      expect(result).toBe(11025);
    });

    it("should handle zero height gracefully", () => {
      const result = SpectrogramCoordinates.pixelToFrequency(300, 0, 0, 22050);
      expect(result).toBe(0);
    });

    it("should handle custom frequency range", () => {
      const result = SpectrogramCoordinates.pixelToFrequency(
        200,
        400,
        1000,
        2000,
      );
      expect(result).toBe(1500); // Inverted: (1 - 200/400) * 1000 + 1000 = 1500
    });
  });

  describe("worldToPixel", () => {
    it("should convert world coordinates to pixel coordinates", () => {
      const world: WorldCoordinates = {
        x: 600,
        y: 300,
        time: 15,
        frequency: 11025,
      };

      const result = SpectrogramCoordinates.worldToPixel(world, mockDimensions);

      expect(result.x).toBe(600); // 15s / 30s * 1200px
      expect(result.y).toBe(300); // 11025Hz inverted position
    });

    it("should handle edge cases", () => {
      const world: WorldCoordinates = {
        x: 0,
        y: 0,
        time: 0,
        frequency: 22050,
      };

      const result = SpectrogramCoordinates.worldToPixel(world, mockDimensions);

      expect(result.x).toBe(0);
      expect(result.y).toBe(0); // Max frequency at top
    });
  });

  describe("pixelToWorld", () => {
    it("should convert pixel coordinates to world coordinates", () => {
      const pixel: PixelCoordinates = { x: 600, y: 300 };

      const result = SpectrogramCoordinates.pixelToWorld(pixel, mockDimensions);

      expect(result.time).toBe(15); // 600px / 1200px * 30s
      expect(result.frequency).toBe(11025); // Middle frequency
      expect(result.x).toBe(600);
      expect(result.y).toBe(300);
    });
  });

  describe("boundingBoxToPixels", () => {
    it("should convert time/frequency bounding box to pixel coordinates", () => {
      const box = {
        startTime: 5,
        endTime: 15,
        minFreq: 1000,
        maxFreq: 3000,
      };

      const result = SpectrogramCoordinates.boundingBoxToPixels(
        box,
        mockDimensions,
      );

      expect(result.x).toBe(200); // 5s / 30s * 1200px
      expect(result.width).toBe(400); // (15-5)s / 30s * 1200px
      expect(result.startTime).toBe(5);
      expect(result.endTime).toBe(15);
      expect(result.minFreq).toBe(1000);
      expect(result.maxFreq).toBe(3000);
    });
  });

  describe("pixelsToBoundingBox", () => {
    it("should convert pixel bounding box to time/frequency coordinates", () => {
      const box = {
        x: 200,
        y: 100,
        width: 400,
        height: 200,
      };

      const result = SpectrogramCoordinates.pixelsToBoundingBox(
        box,
        mockDimensions,
      );

      expect(result.startTime).toBe(5); // 200px / 1200px * 30s
      expect(result.endTime).toBe(15); // (200+400)px / 1200px * 30s
      expect(result.x).toBe(200);
      expect(result.y).toBe(100);
      expect(result.width).toBe(400);
      expect(result.height).toBe(200);
    });
  });
});

describe("SpectrogramOptimizations", () => {
  describe("getOptimalResolution", () => {
    it("should return thumbnail for low zoom", () => {
      expect(SpectrogramOptimizations.getOptimalResolution(0.3)).toBe(
        "thumbnail",
      );
    });

    it("should return standard for medium zoom", () => {
      expect(SpectrogramOptimizations.getOptimalResolution(1.0)).toBe(
        "standard",
      );
    });

    it("should return full for high zoom", () => {
      expect(SpectrogramOptimizations.getOptimalResolution(3.0)).toBe("full");
    });
  });

  describe("calculateViewport", () => {
    it("should calculate viewport bounds correctly", () => {
      const transform = { x: -100, y: -50, k: 2 };
      const result = SpectrogramOptimizations.calculateViewport(
        800,
        600,
        transform,
      );

      expect(result.left).toBe(50); // -(-100) / 2
      expect(result.top).toBe(25); // -(-50) / 2
      expect(result.width).toBe(400); // 800 / 2
      expect(result.height).toBe(300); // 600 / 2
      expect(result.right).toBe(450); // 50 + 400
      expect(result.bottom).toBe(325); // 25 + 300
    });

    it("should handle identity transform", () => {
      const transform = { x: 0, y: 0, k: 1 };
      const result = SpectrogramOptimizations.calculateViewport(
        800,
        600,
        transform,
      );

      expect(result.left).toBe(0);
      expect(result.top).toBe(0);
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
    });
  });

  describe("isBoxInViewport", () => {
    const viewport = {
      left: 100,
      top: 50,
      right: 500,
      bottom: 350,
      width: 400,
      height: 300,
    };

    it("should return true for box inside viewport", () => {
      const box: BoundingBox = {
        x: 200,
        y: 100,
        width: 100,
        height: 50,
        startTime: 0,
        endTime: 1,
        minFreq: 0,
        maxFreq: 100,
      };

      expect(SpectrogramOptimizations.isBoxInViewport(box, viewport)).toBe(
        true,
      );
    });

    it("should return false for box completely outside viewport", () => {
      const box: BoundingBox = {
        x: 600,
        y: 400,
        width: 50,
        height: 50,
        startTime: 0,
        endTime: 1,
        minFreq: 0,
        maxFreq: 100,
      };

      expect(SpectrogramOptimizations.isBoxInViewport(box, viewport)).toBe(
        false,
      );
    });

    it("should return true for partially overlapping box", () => {
      const box: BoundingBox = {
        x: 50,
        y: 25,
        width: 100,
        height: 50,
        startTime: 0,
        endTime: 1,
        minFreq: 0,
        maxFreq: 100,
      };

      expect(SpectrogramOptimizations.isBoxInViewport(box, viewport)).toBe(
        true,
      );
    });
  });

  describe("calculateVisibleTiles", () => {
    it("should calculate correct tile indices", () => {
      const viewport = {
        left: 250,
        top: 150,
        right: 750,
        bottom: 450,
        width: 500,
        height: 300,
      };
      const tileSize = 256;
      const totalWidth = 1024;
      const totalHeight = 768;

      const tiles = SpectrogramOptimizations.calculateVisibleTiles(
        viewport,
        tileSize,
        totalWidth,
        totalHeight,
      );

      // Should include tiles that intersect with viewport
      expect(tiles.length).toBeGreaterThan(0);
      expect(tiles.some((tile) => tile.col === 0 && tile.row === 0)).toBe(true);
    });

    it("should not include tiles outside bounds", () => {
      const viewport = {
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
      };
      const tileSize = 256;
      const totalWidth = 512;
      const totalHeight = 512;

      const tiles = SpectrogramOptimizations.calculateVisibleTiles(
        viewport,
        tileSize,
        totalWidth,
        totalHeight,
      );

      // Should only have tiles within total bounds
      tiles.forEach((tile) => {
        expect(tile.x).toBeLessThan(totalWidth);
        expect(tile.y).toBeLessThan(totalHeight);
      });
    });
  });

  describe("debounce", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it("should delay function execution", () => {
      const mockFn = jest.fn();
      const debouncedFn = SpectrogramOptimizations.debounce(mockFn, 100);

      debouncedFn();
      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("should reset timer on multiple calls", () => {
      const mockFn = jest.fn();
      const debouncedFn = SpectrogramOptimizations.debounce(mockFn, 100);

      debouncedFn();
      jest.advanceTimersByTime(50);
      debouncedFn();
      jest.advanceTimersByTime(50);

      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(50);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    afterEach(() => {
      jest.useRealTimers();
    });
  });

  describe("throttle", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it("should limit function execution rate", () => {
      const mockFn = jest.fn();
      const throttledFn = SpectrogramOptimizations.throttle(mockFn, 100);

      throttledFn();
      throttledFn();
      throttledFn();

      expect(mockFn).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(100);
      throttledFn();

      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    afterEach(() => {
      jest.useRealTimers();
    });
  });
});

describe("SpectrogramData", () => {
  describe("melToFrequency", () => {
    it("should convert mel scale to linear frequency", () => {
      expect(SpectrogramData.melToFrequency(0)).toBe(0);
      expect(SpectrogramData.melToFrequency(1127)).toBeCloseTo(1000, 0);
    });
  });

  describe("frequencyToMel", () => {
    it("should convert linear frequency to mel scale", () => {
      expect(SpectrogramData.frequencyToMel(0)).toBe(0);
      expect(SpectrogramData.frequencyToMel(1000)).toBeCloseTo(1127, 0);
    });
  });

  describe("calculateOptimalFFTParams", () => {
    it("should calculate reasonable FFT parameters", () => {
      const result = SpectrogramData.calculateOptimalFFTParams(44100, 30);

      expect(result.nFFT).toBeGreaterThan(0);
      expect(result.hopLength).toBeGreaterThan(0);
      expect(result.nFFT).toBeGreaterThanOrEqual(result.hopLength * 2);
      expect(result.nFFT).toBeLessThanOrEqual(4096);
    });
  });

  describe("estimateMemoryUsage", () => {
    it("should estimate memory usage for spectrogram generation", () => {
      const memory = SpectrogramData.estimateMemoryUsage(30, 44100, 128, 512);

      expect(memory).toBeGreaterThan(0);
      expect(typeof memory).toBe("number");
    });
  });

  describe("formatFrequency", () => {
    it("should format frequency values correctly", () => {
      expect(SpectrogramData.formatFrequency(500)).toBe("500Hz");
      expect(SpectrogramData.formatFrequency(1000)).toBe("1.0kHz");
      expect(SpectrogramData.formatFrequency(2500)).toBe("2.5kHz");
      expect(SpectrogramData.formatFrequency(10000)).toBe("10.0kHz");
    });
  });

  describe("formatTime", () => {
    it("should format time values correctly", () => {
      expect(SpectrogramData.formatTime(5)).toBe("5.00s");
      expect(SpectrogramData.formatTime(65)).toBe("1:05.0");
      expect(SpectrogramData.formatTime(3665)).toBe("1:01:05");
    });
  });
});
