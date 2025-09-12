import React, { useRef, useEffect, useCallback } from 'react';

interface SpectrogramCanvasProps {
  imageUrl: string;
  width: number;
  height: number;
  zoomLevel: number;
  zoomOffset: { x: number; y: number };
  interpolationType?: 'nearest' | 'bilinear' | 'bicubic';
  onImageLoad?: () => void;
  onImageError?: (error: string) => void;
}

const SpectrogramCanvas: React.FC<SpectrogramCanvasProps> = ({
  imageUrl,
  width,
  height,
  zoomLevel,
  zoomOffset,
  interpolationType = 'bicubic',
  onImageLoad,
  onImageError
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // High-quality image rendering with different interpolation methods
  const renderImage = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    
    if (!canvas || !image || !image.complete) return;
    
    const ctx = canvas.getContext('2d', { 
      alpha: false,
      desynchronized: true 
    });
    
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save context state
    ctx.save();

    // Set interpolation quality based on zoom level and type
    if (interpolationType === 'nearest' || zoomLevel > 5) {
      ctx.imageSmoothingEnabled = false;
    } else {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = interpolationType === 'bicubic' ? 'high' : 'medium';
    }

    // Apply transformations
    ctx.translate(-zoomOffset.x, -zoomOffset.y);
    ctx.scale(zoomLevel, zoomLevel);

    // Multi-step rendering for high-quality bicubic interpolation
    if (interpolationType === 'bicubic' && zoomLevel > 2) {
      // Create temporary canvas for progressive scaling
      const steps = Math.ceil(Math.log2(zoomLevel));
      let tempCanvas = document.createElement('canvas');
      let tempCtx = tempCanvas.getContext('2d')!;
      
      tempCanvas.width = image.naturalWidth;
      tempCanvas.height = image.naturalHeight;
      tempCtx.drawImage(image, 0, 0);
      
      // Progressive upscaling for better quality
      for (let i = 1; i < steps; i++) {
        const prevCanvas = tempCanvas;
        tempCanvas = document.createElement('canvas');
        tempCtx = tempCanvas.getContext('2d')!;
        
        const stepScale = Math.pow(2, Math.min(1, (Math.log2(zoomLevel) - i + 1)));
        tempCanvas.width = Math.floor(prevCanvas.width * stepScale);
        tempCanvas.height = Math.floor(prevCanvas.height * stepScale);
        
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';
        tempCtx.drawImage(prevCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
      }
      
      // Draw the final scaled image
      ctx.scale(1 / zoomLevel, 1 / zoomLevel);
      ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
    } else {
      // Direct rendering for lower zoom levels
      ctx.drawImage(image, 0, 0);
    }

    // Restore context state
    ctx.restore();

    // Apply sharpening filter for better clarity at high zoom
    if (zoomLevel > 2 && interpolationType !== 'nearest') {
      applySharpening(ctx, canvas.width, canvas.height, zoomLevel);
    }
  }, [zoomLevel, zoomOffset, interpolationType]);

  // Sharpening filter for enhanced clarity
  const applySharpening = (ctx: CanvasRenderingContext2D, width: number, height: number, strength: number) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const factor = Math.min(0.5, strength * 0.1);
    
    // Simple unsharp mask
    const tempData = new Uint8ClampedArray(data);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        
        for (let c = 0; c < 3; c++) {
          const center = tempData[idx + c];
          const neighbors = (
            tempData[idx - width * 4 + c] +
            tempData[idx + width * 4 + c] +
            tempData[idx - 4 + c] +
            tempData[idx + 4 + c]
          ) / 4;
          
          data[idx + c] = Math.min(255, Math.max(0, 
            center + factor * (center - neighbors)
          ));
        }
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
  };

  // Load image
  useEffect(() => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    
    image.onload = () => {
      imageRef.current = image;
      renderImage();
      onImageLoad?.();
    };
    
    image.onerror = () => {
      onImageError?.('Failed to load spectrogram image');
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

  return (
    <canvas
      ref={canvasRef}
      width={width * zoomLevel}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${width * zoomLevel}px`,
        height: `${height}px`,
        imageRendering: interpolationType === 'nearest' ? 'pixelated' : 'auto',
        transform: 'translateZ(0)', // Force GPU acceleration
        willChange: 'transform'
      }}
    />
  );
};

export default SpectrogramCanvas;