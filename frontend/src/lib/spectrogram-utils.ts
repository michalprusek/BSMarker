/**
 * Utility functions for spectrogram coordinate transformations and optimizations.
 * Provides a single source of truth for all coordinate mappings.
 */

import { ViewportTransform } from "../utils/zoom";

export interface SpectrogramDimensions {
  width: number;
  height: number;
  duration: number;
  minFrequency: number;
  maxFrequency: number;
}

export interface WorldCoordinates {
  x: number;
  y: number;
  time: number;
  frequency: number;
}

export interface PixelCoordinates {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  startTime: number;
  endTime: number;
  minFreq: number;
  maxFreq: number;
}

/**
 * Centralized coordinate transformation utilities for spectrograms.
 */
export class SpectrogramCoordinates {
  /**
   * Convert time value to pixel x-coordinate with optional transform.
   * At scale = 1, the full duration maps to the full canvas width.
   */
  static timeToPixel(
    time: number,
    canvasWidth: number,
    duration: number,
    transform?: ViewportTransform,
  ): number {
    if (duration <= 0) return 0;
    // Normalize time to [0, 1] range
    const normalized = time / duration;
    // At scale = 1, this maps to full canvas width
    const worldX = normalized * canvasWidth;
    if (transform) {
      return worldX * transform.scaleX + transform.translateX;
    }
    return worldX;
  }

  /**
   * Convert pixel x-coordinate to time value with optional transform.
   * At scale = 1, the full canvas width maps to the full duration.
   */
  static pixelToTime(
    pixelX: number,
    canvasWidth: number,
    duration: number,
    transform?: ViewportTransform,
  ): number {
    if (canvasWidth <= 0 || duration <= 0) return 0;
    let worldX = pixelX;
    if (transform) {
      worldX = (pixelX - transform.translateX) / transform.scaleX;
    }
    // Map from canvas width to duration
    const normalized = worldX / canvasWidth;
    return normalized * duration;
  }

  /**
   * Convert frequency value to pixel y-coordinate with optional transform.
   * Note: Y-axis is inverted (high frequencies at top).
   */
  static frequencyToPixel(
    frequency: number,
    canvasHeight: number,
    minFreq: number,
    maxFreq: number,
    transform?: ViewportTransform,
  ): number {
    if (maxFreq <= minFreq) return 0;
    const normalized = (frequency - minFreq) / (maxFreq - minFreq);
    const worldY = canvasHeight * (1 - normalized); // Invert for display
    if (transform) {
      return worldY * transform.scaleY + transform.translateY;
    }
    return worldY;
  }

  /**
   * Convert pixel y-coordinate to frequency value with optional transform.
   * Note: Y-axis is inverted (high frequencies at top).
   */
  static pixelToFrequency(
    pixelY: number,
    canvasHeight: number,
    minFreq: number,
    maxFreq: number,
    transform?: ViewportTransform,
  ): number {
    if (canvasHeight <= 0) return minFreq;
    let worldY = pixelY;
    if (transform) {
      worldY = (pixelY - transform.translateY) / transform.scaleY;
    }
    const normalized = 1 - worldY / canvasHeight; // Invert from display
    return minFreq + normalized * (maxFreq - minFreq);
  }

  /**
   * Convert world coordinates to pixel coordinates.
   */
  static worldToPixel(
    world: WorldCoordinates,
    dimensions: SpectrogramDimensions,
  ): PixelCoordinates {
    return {
      x: this.timeToPixel(world.time, dimensions.duration, dimensions.width),
      y: this.frequencyToPixel(
        world.frequency,
        dimensions.minFrequency,
        dimensions.maxFrequency,
        dimensions.height,
      ),
    };
  }

  /**
   * Convert pixel coordinates to world coordinates.
   */
  static pixelToWorld(
    pixel: PixelCoordinates,
    dimensions: SpectrogramDimensions,
  ): WorldCoordinates {
    const time = this.pixelToTime(
      pixel.x,
      dimensions.width,
      dimensions.duration,
    );
    const frequency = this.pixelToFrequency(
      pixel.y,
      dimensions.height,
      dimensions.minFrequency,
      dimensions.maxFrequency,
    );

    return {
      x: pixel.x,
      y: pixel.y,
      time,
      frequency,
    };
  }

  /**
   * Convert a bounding box from time/frequency to pixel coordinates.
   */
  static boundingBoxToPixels(
    box: {
      startTime: number;
      endTime: number;
      minFreq: number;
      maxFreq: number;
    },
    dimensions: SpectrogramDimensions,
  ): BoundingBox {
    const x = this.timeToPixel(
      box.startTime,
      dimensions.duration,
      dimensions.width,
    );
    const y = this.frequencyToPixel(
      box.maxFreq,
      dimensions.minFrequency,
      dimensions.maxFrequency,
      dimensions.height,
    );
    const width = this.timeToPixel(
      box.endTime - box.startTime,
      dimensions.duration,
      dimensions.width,
    );
    const height = Math.abs(
      this.frequencyToPixel(
        box.maxFreq,
        dimensions.minFrequency,
        dimensions.maxFrequency,
        dimensions.height,
      ) -
        this.frequencyToPixel(
          box.minFreq,
          dimensions.minFrequency,
          dimensions.maxFrequency,
          dimensions.height,
        ),
    );

    return {
      x,
      y,
      width,
      height,
      startTime: box.startTime,
      endTime: box.endTime,
      minFreq: box.minFreq,
      maxFreq: box.maxFreq,
    };
  }

  /**
   * Convert a bounding box from pixel to time/frequency coordinates.
   */
  static pixelsToBoundingBox(
    box: {
      x: number;
      y: number;
      width: number;
      height: number;
    },
    dimensions: SpectrogramDimensions,
  ): BoundingBox {
    const startTime = this.pixelToTime(
      box.x,
      dimensions.width,
      dimensions.duration,
    );
    const endTime = this.pixelToTime(
      box.x + box.width,
      dimensions.width,
      dimensions.duration,
    );
    const maxFreq = this.pixelToFrequency(
      box.y,
      dimensions.height,
      dimensions.minFrequency,
      dimensions.maxFrequency,
    );
    const minFreq = this.pixelToFrequency(
      box.y + box.height,
      dimensions.height,
      dimensions.minFrequency,
      dimensions.maxFrequency,
    );

    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      startTime,
      endTime,
      minFreq,
      maxFreq,
    };
  }
}

/**
 * Utility functions for spectrogram rendering optimizations.
 */
export class SpectrogramOptimizations {
  /**
   * Determine optimal resolution based on zoom level.
   */
  static getOptimalResolution(
    zoomLevel: number,
  ): "thumbnail" | "standard" | "full" {
    if (zoomLevel < 0.5) return "thumbnail";
    if (zoomLevel < 2.0) return "standard";
    return "full";
  }

  /**
   * Calculate visible viewport in world coordinates.
   */
  static calculateViewport(
    canvasWidth: number,
    canvasHeight: number,
    transform: { x: number; y: number; k: number },
  ) {
    const invZoom = 1 / transform.k;
    const worldX = -transform.x * invZoom;
    const worldY = -transform.y * invZoom;
    const worldWidth = canvasWidth * invZoom;
    const worldHeight = canvasHeight * invZoom;

    return {
      left: worldX,
      top: worldY,
      right: worldX + worldWidth,
      bottom: worldY + worldHeight,
      width: worldWidth,
      height: worldHeight,
    };
  }

  /**
   * Check if a bounding box is visible in the viewport.
   */
  static isBoxInViewport(
    box: BoundingBox,
    viewport: ReturnType<typeof SpectrogramOptimizations.calculateViewport>,
  ): boolean {
    return !(
      box.x + box.width < viewport.left ||
      box.x > viewport.right ||
      box.y + box.height < viewport.top ||
      box.y > viewport.bottom
    );
  }

  /**
   * Calculate tile indices for a given viewport.
   */
  static calculateVisibleTiles(
    viewport: ReturnType<typeof SpectrogramOptimizations.calculateViewport>,
    tileSize: number,
    totalWidth: number,
    totalHeight: number,
  ): Array<{ row: number; col: number; x: number; y: number }> {
    const startCol = Math.floor(viewport.left / tileSize);
    const endCol = Math.ceil(viewport.right / tileSize);
    const startRow = Math.floor(viewport.top / tileSize);
    const endRow = Math.ceil(viewport.bottom / tileSize);

    const tiles: Array<{ row: number; col: number; x: number; y: number }> = [];

    for (let row = Math.max(0, startRow); row < endRow; row++) {
      for (let col = Math.max(0, startCol); col < endCol; col++) {
        const x = col * tileSize;
        const y = row * tileSize;

        if (x < totalWidth && y < totalHeight) {
          tiles.push({ row, col, x, y });
        }
      }
    }

    return tiles;
  }

  /**
   * Debounce function for render optimizations.
   */
  static debounce<T extends (...args: any[]) => void>(
    func: T,
    wait: number,
  ): T {
    let timeout: NodeJS.Timeout | null = null;

    return ((...args: Parameters<T>) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    }) as T;
  }

  /**
   * Throttle function for interaction optimizations.
   */
  static throttle<T extends (...args: any[]) => void>(
    func: T,
    limit: number,
  ): T {
    let inThrottle = false;

    return ((...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    }) as T;
  }
}

/**
 * Utility functions for spectrogram data processing.
 */
export class SpectrogramData {
  /**
   * Convert mel scale to linear frequency.
   */
  static melToFrequency(mel: number): number {
    return 700 * (Math.pow(10, mel / 2595) - 1);
  }

  /**
   * Convert linear frequency to mel scale.
   */
  static frequencyToMel(freq: number): number {
    return 2595 * Math.log10(1 + freq / 700);
  }

  /**
   * Calculate optimal FFT parameters for given audio duration.
   */
  static calculateOptimalFFTParams(
    sampleRate: number,
    duration: number,
    targetTimeResolution: number = 0.01, // 10ms default
  ): { nFFT: number; hopLength: number } {
    // Calculate hop length for target time resolution
    const hopLength = Math.floor(sampleRate * targetTimeResolution);

    // Choose n_fft as next power of 2 greater than 2 * hop_length
    let nFFT = 1;
    while (nFFT < hopLength * 2) {
      nFFT *= 2;
    }

    // Cap at reasonable values for performance
    nFFT = Math.min(nFFT, 4096);

    return { nFFT, hopLength };
  }

  /**
   * Estimate memory usage for spectrogram generation.
   */
  static estimateMemoryUsage(
    duration: number,
    sampleRate: number,
    nMels: number,
    hopLength: number,
  ): number {
    // Audio data: duration * sample_rate * 4 bytes (float32)
    const audioMemory = duration * sampleRate * 4;

    // Spectrogram: (duration * sample_rate / hop_length) * n_mels * 4 bytes
    const spectrogramFrames = Math.ceil((duration * sampleRate) / hopLength);
    const spectrogramMemory = spectrogramFrames * nMels * 4;

    // Image data (approximate): width * height * 4 bytes (RGBA)
    const imageMemory = 1600 * 400 * 4; // Standard resolution

    return audioMemory + spectrogramMemory + imageMemory;
  }

  /**
   * Format frequency value for display.
   */
  static formatFrequency(freq: number): string {
    if (freq >= 1000) {
      return `${(freq / 1000).toFixed(1)}kHz`;
    }
    return `${Math.round(freq)}Hz`;
  }

  /**
   * Format time value for display.
   */
  static formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;

    if (minutes > 0) {
      return `${minutes}:${secs.toFixed(1).padStart(4, "0")}`;
    }
    return `${secs.toFixed(2)}s`;
  }
}

// Re-export for convenience
export {
  SpectrogramCoordinates as Coordinates,
  SpectrogramOptimizations as Optimizations,
  SpectrogramData as Data,
};
