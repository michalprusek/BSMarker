import { useState, useRef, useCallback, useEffect } from 'react';

interface ZoomState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface UseSpectrogramZoomOptions {
  minZoom?: number;
  maxZoom?: number;
  zoomSpeed?: number;
  smoothing?: boolean;
  onZoomChange?: (state: ZoomState) => void;
}

export const useSpectrogramZoom = (options: UseSpectrogramZoomOptions = {}) => {
  const {
    minZoom = 1,
    maxZoom = 10,
    zoomSpeed = 0.002,
    smoothing = true,
    onZoomChange
  } = options;

  const [zoomState, setZoomState] = useState<ZoomState>({
    scale: 1,
    offsetX: 0,
    offsetY: 0
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const targetZoomRef = useRef<ZoomState>(zoomState);

  // High-quality image interpolation using canvas
  const renderInterpolatedImage = useCallback((
    image: HTMLImageElement,
    canvas: HTMLCanvasElement,
    zoom: ZoomState,
    interpolationType: 'bicubic' | 'lanczos' = 'bicubic'
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Enable high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Save context state
    ctx.save();

    // Apply transformations
    ctx.translate(-zoom.offsetX, -zoom.offsetY);
    ctx.scale(zoom.scale, zoom.scale);

    // Draw the image with high-quality interpolation
    if (interpolationType === 'lanczos' && zoom.scale > 1.5) {
      // For significant zoom, use multi-step scaling for better quality
      const steps = Math.ceil(Math.log2(zoom.scale));
      let tempCanvas = document.createElement('canvas');
      let tempCtx = tempCanvas.getContext('2d')!;
      
      // Start with original image
      tempCanvas.width = image.naturalWidth;
      tempCanvas.height = image.naturalHeight;
      tempCtx.drawImage(image, 0, 0);
      
      // Progressive upscaling for Lanczos-like quality
      for (let i = 0; i < steps; i++) {
        const prevCanvas = tempCanvas;
        tempCanvas = document.createElement('canvas');
        tempCtx = tempCanvas.getContext('2d')!;
        
        const stepScale = Math.min(2, zoom.scale / Math.pow(2, i));
        tempCanvas.width = prevCanvas.width * stepScale;
        tempCanvas.height = prevCanvas.height * stepScale;
        
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';
        tempCtx.drawImage(prevCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
      }
      
      // Draw the final high-quality scaled image
      ctx.drawImage(tempCanvas, 0, 0, image.naturalWidth, image.naturalHeight);
    } else {
      // For smaller zoom levels or bicubic, use direct scaling
      ctx.drawImage(image, 0, 0);
    }

    // Restore context state
    ctx.restore();
  }, []);

  // Handle wheel event for zooming
  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const rect = container.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Calculate zoom factor
    const delta = event.deltaY * -zoomSpeed;
    const zoomFactor = Math.exp(delta);
    
    // Calculate new scale
    const newScale = Math.max(minZoom, Math.min(maxZoom, zoomState.scale * zoomFactor));
    
    if (newScale === zoomState.scale) return;

    // Calculate cursor position in world space
    const worldX = (mouseX + zoomState.offsetX) / zoomState.scale;
    const worldY = (mouseY + zoomState.offsetY) / zoomState.scale;

    // Calculate new offset to keep cursor position fixed
    const newOffsetX = worldX * newScale - mouseX;
    const newOffsetY = worldY * newScale - mouseY;

    const newZoomState = {
      scale: newScale,
      offsetX: Math.max(0, newOffsetX),
      offsetY: Math.max(0, newOffsetY)
    };

    if (smoothing) {
      targetZoomRef.current = newZoomState;
      animateZoom();
    } else {
      setZoomState(newZoomState);
      onZoomChange?.(newZoomState);
    }
  }, [zoomState, minZoom, maxZoom, zoomSpeed, smoothing, onZoomChange]);

  // Smooth zoom animation
  const animateZoom = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const animate = () => {
      setZoomState(current => {
        const target = targetZoomRef.current;
        const lerpFactor = 0.15; // Smoothing factor

        const newState = {
          scale: current.scale + (target.scale - current.scale) * lerpFactor,
          offsetX: current.offsetX + (target.offsetX - current.offsetX) * lerpFactor,
          offsetY: current.offsetY + (target.offsetY - current.offsetY) * lerpFactor
        };

        // Check if we're close enough to target
        const threshold = 0.001;
        if (
          Math.abs(newState.scale - target.scale) < threshold &&
          Math.abs(newState.offsetX - target.offsetX) < threshold &&
          Math.abs(newState.offsetY - target.offsetY) < threshold
        ) {
          onZoomChange?.(target);
          return target;
        }

        onZoomChange?.(newState);
        animationFrameRef.current = requestAnimationFrame(animate);
        return newState;
      });
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [onZoomChange]);

  // Pan functionality
  const handlePan = useCallback((deltaX: number, deltaY: number) => {
    setZoomState(current => {
      const newState = {
        ...current,
        offsetX: Math.max(0, current.offsetX - deltaX),
        offsetY: Math.max(0, current.offsetY - deltaY)
      };
      onZoomChange?.(newState);
      return newState;
    });
  }, [onZoomChange]);

  // Reset zoom
  const resetZoom = useCallback(() => {
    const resetState = { scale: 1, offsetX: 0, offsetY: 0 };
    
    if (smoothing) {
      targetZoomRef.current = resetState;
      animateZoom();
    } else {
      setZoomState(resetState);
      onZoomChange?.(resetState);
    }
  }, [smoothing, animateZoom, onZoomChange]);

  // Zoom to specific point
  const zoomToPoint = useCallback((x: number, y: number, scale: number) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const worldX = x;
    const worldY = y;

    const newOffsetX = worldX * scale - centerX;
    const newOffsetY = worldY * scale - centerY;

    const newZoomState = {
      scale: Math.max(minZoom, Math.min(maxZoom, scale)),
      offsetX: Math.max(0, newOffsetX),
      offsetY: Math.max(0, newOffsetY)
    };

    if (smoothing) {
      targetZoomRef.current = newZoomState;
      animateZoom();
    } else {
      setZoomState(newZoomState);
      onZoomChange?.(newZoomState);
    }
  }, [minZoom, maxZoom, smoothing, animateZoom, onZoomChange]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return {
    zoomState,
    containerRef,
    canvasRef,
    imageRef,
    handleWheel,
    handlePan,
    resetZoom,
    zoomToPoint,
    renderInterpolatedImage
  };
};