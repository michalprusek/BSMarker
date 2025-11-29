import React, { useRef, useEffect, useCallback, useMemo } from "react";
import { CoordinateUtils } from "../utils/coordinates";
import { debounce } from "lodash";

interface SpectrogramCanvasProps {
  imageUrl: string;
  width: number;
  height: number;
  zoomLevel: number;
  zoomOffset: { x: number; y: number };
  interpolationType?: "nearest" | "bilinear" | "bicubic";
  contrast?: number;
  enableSharpening?: boolean; // Performance: disabled by default
  onImageLoad?: () => void;
  onImageError?: (error: string) => void;
}

const SpectrogramCanvas: React.FC<SpectrogramCanvasProps> = ({
  imageUrl,
  width,
  height,
  zoomLevel,
  zoomOffset,
  interpolationType = "bicubic",
  contrast = 1.0,
  enableSharpening = false, // Disabled by default for performance
  onImageLoad,
  onImageError,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isRenderingRef = useRef<boolean>(false);
  const lastZoomLevelRef = useRef<number>(1);

  // Sharpening filter for enhanced clarity - DEBOUNCED for performance
  const applySharpening = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      canvasWidth: number,
      canvasHeight: number,
      strength: number,
    ) => {
      // Skip if canvas is too large (performance protection)
      const maxPixels = 500000; // ~700x700
      if (canvasWidth * canvasHeight > maxPixels) {
        console.debug(
          "Sharpening skipped: canvas too large for performance",
          canvasWidth,
          "x",
          canvasHeight,
        );
        return;
      }

      try {
        const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        const data = imageData.data;
        const factor = Math.min(0.5, strength * 0.1);

        // Simple unsharp mask
        const tempData = new Uint8ClampedArray(data);

        for (let y = 1; y < canvasHeight - 1; y++) {
          for (let x = 1; x < canvasWidth - 1; x++) {
            const idx = (y * canvasWidth + x) * 4;

            for (let c = 0; c < 3; c++) {
              const center = tempData[idx + c];
              const neighbors =
                (tempData[idx - canvasWidth * 4 + c] +
                  tempData[idx + canvasWidth * 4 + c] +
                  tempData[idx - 4 + c] +
                  tempData[idx + 4 + c]) /
                4;

              data[idx + c] = Math.min(
                255,
                Math.max(0, center + factor * (center - neighbors)),
              );
            }
          }
        }

        ctx.putImageData(imageData, 0, 0);
      } catch (e) {
        console.debug("Sharpening failed:", e);
      }
    },
    [],
  );

  // Debounced sharpening - only apply after zoom stabilizes
  const debouncedSharpening = useMemo(
    () =>
      debounce(
        (
          ctx: CanvasRenderingContext2D,
          w: number,
          h: number,
          strength: number,
        ) => {
          applySharpening(ctx, w, h, strength);
        },
        300, // Wait 300ms after last zoom change
      ),
    [applySharpening],
  );

  // Cleanup debounced function
  useEffect(() => {
    return () => {
      debouncedSharpening.cancel();
    };
  }, [debouncedSharpening]);

  // High-quality image rendering with different interpolation methods
  const renderImage = useCallback(() => {
    // Prevent concurrent renders
    if (isRenderingRef.current) return;

    const canvas = canvasRef.current;
    const image = imageRef.current;

    if (!canvas || !image || !image.complete) return;

    isRenderingRef.current = true;

    const ctx = canvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
    });

    if (!ctx) {
      isRenderingRef.current = false;
      return;
    }

    // Get device pixel ratio for high-DPI display support
    const pixelRatio = CoordinateUtils.getDevicePixelRatio();

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save context state
    ctx.save();

    // Apply device pixel ratio scaling
    ctx.scale(pixelRatio, pixelRatio);

    // Set interpolation quality based on zoom level and type
    if (interpolationType === "nearest" || zoomLevel > 5) {
      ctx.imageSmoothingEnabled = false;
    } else {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality =
        interpolationType === "bicubic" ? "high" : "medium";
    }

    // Apply transformations
    ctx.translate(-zoomOffset.x, -zoomOffset.y);
    ctx.scale(zoomLevel, zoomLevel);

    // Simplified rendering - skip progressive upscaling for performance
    // Progressive upscaling was creating too many temporary canvases
    ctx.drawImage(image, 0, 0);

    // Restore context state
    ctx.restore();

    // Apply debounced sharpening only if enabled and zoom is high
    if (enableSharpening && zoomLevel > 2 && interpolationType !== "nearest") {
      // Use debounced version to avoid applying during zoom animation
      debouncedSharpening(
        ctx,
        Math.floor(canvas.width / pixelRatio),
        Math.floor(canvas.height / pixelRatio),
        zoomLevel,
      );
    }

    lastZoomLevelRef.current = zoomLevel;
    isRenderingRef.current = false;
  }, [
    zoomLevel,
    zoomOffset,
    interpolationType,
    enableSharpening,
    debouncedSharpening,
  ]);

  // Load image
  useEffect(() => {
    const image = new Image();
    image.crossOrigin = "anonymous";

    image.onload = () => {
      imageRef.current = image;
      renderImage();
      onImageLoad?.();
    };

    image.onerror = () => {
      onImageError?.("Failed to load spectrogram image");
    };

    image.src = imageUrl;

    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [imageUrl, onImageLoad, onImageError, renderImage]);

  // Re-render on zoom changes with animation frame
  useEffect(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      renderImage();
    });

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderImage]);

  // Calculate canvas dimensions with device pixel ratio support
  const canvasDimensions = useMemo(
    () => CoordinateUtils.getCanvasDimensions(width, height, zoomLevel),
    [width, height, zoomLevel],
  );

  return (
    <canvas
      ref={canvasRef}
      width={canvasDimensions.canvasWidth}
      height={canvasDimensions.canvasHeight}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: canvasDimensions.styleWidth,
        height: canvasDimensions.styleHeight,
        imageRendering: interpolationType === "nearest" ? "pixelated" : "auto",
        transform: "translateZ(0)", // Force GPU acceleration
        willChange: "transform",
        filter: `contrast(${contrast})`,
      }}
    />
  );
};

// Memoize component to prevent unnecessary re-renders
export default React.memo(SpectrogramCanvas);
