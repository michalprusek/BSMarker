/**
 * OptimizedWaveform - Direct viewport-based waveform renderer
 *
 * Renders waveform directly from audio peaks data for the visible viewport only.
 * This approach:
 * 1. Always renders at full resolution for current zoom level
 * 2. Only processes samples that are actually visible
 * 3. Uses requestAnimationFrame for smooth scroll/zoom updates
 *
 * Similar to spectrogram tile rendering - we render what's visible, not everything.
 */

import {
  useRef,
  useEffect,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
  type MouseEvent,
} from "react";
import WaveSurfer from "wavesurfer.js";

export interface OptimizedWaveformHandle {
  play: () => void;
  pause: () => void;
  stop: () => void;
  seekTo: (progress: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  isPlaying: () => boolean;
  isReady: () => boolean;
  setPlaybackRate: (rate: number) => void;
}

interface OptimizedWaveformProps {
  audioUrl: string;
  width: number; // Viewport width (visible area)
  height: number;
  zoomLevel: number;
  scrollOffset: number; // In zoomed pixels
  waveColor?: string;
  onReady?: (duration: number) => void;
  onTimeUpdate?: (currentTime: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onFinish?: () => void;
  onSeek?: (time: number) => void;
  onError?: (error: Error) => void;
  onClick?: (time: number) => void;
}

const OptimizedWaveform = forwardRef<OptimizedWaveformHandle, OptimizedWaveformProps>(
  (
    {
      audioUrl,
      width,
      height,
      zoomLevel,
      scrollOffset,
      waveColor = "#3B82F6",
      onReady,
      onTimeUpdate,
      onPlay,
      onPause,
      onFinish,
      onSeek,
      onError,
      onClick,
    },
    ref
  ) => {
    // Refs
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);
    const hiddenContainerRef = useRef<HTMLDivElement>(null);
    const peaksRef = useRef<Float32Array | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const renderRequestRef = useRef<number | null>(null);
    const isReadyRef = useRef(false);

    // State
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [error, setError] = useState<Error | null>(null);

    // Calculate total zoomed width (virtual content width)
    const totalZoomedWidth = width * zoomLevel;

    // handleSeek is defined later, after requestRender
    const handleSeekRef = useRef<(progress: number, fireCallback?: boolean) => void>(() => {});

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      play: () => wavesurferRef.current?.play(),
      pause: () => wavesurferRef.current?.pause(),
      stop: () => {
        wavesurferRef.current?.pause();
        handleSeekRef.current(0, false); // Don't fire onSeek callback when stopping
      },
      seekTo: (progress: number) => handleSeekRef.current(progress),
      getCurrentTime: () => wavesurferRef.current?.getCurrentTime() ?? 0,
      getDuration: () => wavesurferRef.current?.getDuration() ?? 0,
      isPlaying: () => wavesurferRef.current?.isPlaying() ?? false,
      isReady: () => isReadyRef.current,
      setPlaybackRate: (rate: number) => wavesurferRef.current?.setPlaybackRate(rate),
    }), []);

    // Render waveform directly from peaks data
    const renderWaveform = useCallback(() => {
      const canvas = canvasRef.current;
      const peaks = peaksRef.current;

      if (!canvas || !peaks || peaks.length === 0 || duration === 0) return;

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      // Calculate visible time range (scrollOffset is in zoomed pixels)
      const startRatio = Math.max(0, Math.min(1, scrollOffset / totalZoomedWidth));
      const endRatio = Math.max(0, Math.min(1, (scrollOffset + width) / totalZoomedWidth));

      // Calculate which samples are visible
      const startSample = Math.floor(startRatio * peaks.length);
      const endSample = Math.ceil(endRatio * peaks.length);
      const visibleSamples = endSample - startSample;

      if (visibleSamples <= 0) return;

      // Clear canvas
      ctx.fillStyle = "#F9FAFB";
      ctx.fillRect(0, 0, width, height);

      // Bar rendering parameters
      const barWidth = 3;
      const barGap = 2;
      const barRadius = 2;
      const totalBarWidth = barWidth + barGap;
      const numBars = Math.floor(width / totalBarWidth);

      if (numBars <= 0) return;

      ctx.fillStyle = waveColor;

      // Render bars for visible portion
      for (let i = 0; i < numBars; i++) {
        // Calculate which samples this bar represents (within visible range)
        const barStartRatio = i / numBars;
        const barEndRatio = (i + 1) / numBars;

        const sampleStart = startSample + Math.floor(barStartRatio * visibleSamples);
        const sampleEnd = startSample + Math.floor(barEndRatio * visibleSamples);

        // Find max amplitude in this range
        let maxAmp = 0;
        for (let j = sampleStart; j < sampleEnd && j < peaks.length; j++) {
          maxAmp = Math.max(maxAmp, Math.abs(peaks[j]));
        }

        // Draw bar
        const barHeight = Math.max(2, maxAmp * height * 0.9);
        const x = i * totalBarWidth;
        const y = (height - barHeight) / 2;

        // Draw rounded rectangle
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, barRadius);
        ctx.fill();
      }

      // Draw playback position indicator (red vertical line)
      if (currentTime > 0) {
        const progressRatio = currentTime / duration;

        // Only draw if the current position is within visible range
        if (progressRatio >= startRatio && progressRatio <= endRatio) {
          const progressInViewport = ((progressRatio - startRatio) / (endRatio - startRatio)) * width;

          // Draw red vertical line
          ctx.strokeStyle = "#EF4444"; // Red-500
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(progressInViewport, 0);
          ctx.lineTo(progressInViewport, height);
          ctx.stroke();
        }
      }
    }, [width, height, scrollOffset, totalZoomedWidth, duration, currentTime, waveColor]);

    // Throttled render using requestAnimationFrame
    const requestRender = useCallback(() => {
      if (renderRequestRef.current) {
        cancelAnimationFrame(renderRequestRef.current);
      }
      renderRequestRef.current = requestAnimationFrame(() => {
        renderWaveform();
        renderRequestRef.current = null;
      });
    }, [renderWaveform]);

    // Shared seek handler - ensures onSeek callback fires from both clicks and programmatic seeks
    const handleSeek = useCallback(
      (progress: number, fireCallback = true) => {
        // Validate input
        if (!Number.isFinite(progress)) {
          console.warn('[OptimizedWaveform] Invalid progress value:', progress);
          return;
        }

        // Check if WaveSurfer is initialized
        if (!wavesurferRef.current) {
          console.warn('[OptimizedWaveform] Seek called but WaveSurfer not initialized');
          return;
        }

        // Validate duration BEFORE seeking to prevent state desync
        const currentDuration = wavesurferRef.current.getDuration();
        if (!Number.isFinite(currentDuration) || currentDuration <= 0) {
          console.warn('[OptimizedWaveform] Seek called but duration is invalid:', currentDuration);
          return;
        }

        // All checks passed - perform seek
        const clampedProgress = Math.max(0, Math.min(1, progress));
        wavesurferRef.current.seekTo(clampedProgress);

        const time = clampedProgress * currentDuration;
        setCurrentTime(time);
        if (fireCallback) {
          onSeek?.(time);
        }
        requestRender();
      },
      [onSeek, requestRender]
    );

    // Keep handleSeekRef in sync for useImperativeHandle
    useEffect(() => {
      handleSeekRef.current = handleSeek;
    }, [handleSeek]);

    // Animation loop for smooth playback updates
    const startAnimationLoop = useCallback(() => {
      const animate = () => {
        if (wavesurferRef.current?.isPlaying()) {
          const time = wavesurferRef.current.getCurrentTime();
          setCurrentTime(time);
          onTimeUpdate?.(time);
          renderWaveform();
        }
        animationFrameRef.current = requestAnimationFrame(animate);
      };
      animationFrameRef.current = requestAnimationFrame(animate);
    }, [renderWaveform, onTimeUpdate]);

    const stopAnimationLoop = useCallback(() => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }, []);

    // Initialize WaveSurfer (hidden, for audio and peaks extraction)
    useEffect(() => {
      if (!hiddenContainerRef.current || !audioUrl) return;

      // Reset error state when loading new audio
      setError(null);

      // Cleanup previous instance
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
      peaksRef.current = null;

      const ws = WaveSurfer.create({
        container: hiddenContainerRef.current,
        waveColor: "transparent",
        progressColor: "transparent",
        cursorColor: "transparent",
        height: 1,
        barWidth: 0,
        interact: false,
        backend: "WebAudio",
        normalize: true,
        hideScrollbar: true,
      });

      wavesurferRef.current = ws;

      ws.on("ready", () => {
        isReadyRef.current = true;
        const dur = ws.getDuration();
        setDuration(dur);

        // Extract peaks data
        const decodedData = (ws as any).getDecodedData?.();
        if (decodedData) {
          peaksRef.current = decodedData.getChannelData(0);
          // Initial render
          requestRender();
        }

        onReady?.(dur);
      });

      ws.on("timeupdate", (time: number) => {
        setCurrentTime(time);
        onTimeUpdate?.(time);
      });

      ws.on("play", () => {
        onPlay?.();
        startAnimationLoop();
      });

      ws.on("pause", () => {
        onPause?.();
        stopAnimationLoop();
        requestRender();
      });

      ws.on("finish", () => {
        onFinish?.();
        stopAnimationLoop();
      });

      ws.on("error", (err: Error) => {
        console.error("[OptimizedWaveform] Error:", err);
        setError(err);
        onError?.(err);
      });

      ws.load(audioUrl);

      return () => {
        stopAnimationLoop();
        if (renderRequestRef.current) cancelAnimationFrame(renderRequestRef.current);
        ws.destroy();
        wavesurferRef.current = null;
        peaksRef.current = null;
        isReadyRef.current = false;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioUrl]);

    // Re-render when scroll, zoom, or dimensions change
    useEffect(() => {
      if (isReadyRef.current && peaksRef.current) {
        requestRender();
      }
    }, [scrollOffset, zoomLevel, width, height, requestRender]);

    // Handle click on waveform
    const handleClick = useCallback(
      (e: MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current || duration === 0) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;

        // Convert click position to time
        const clickInZoomed = scrollOffset + clickX;
        const clickTime = (clickInZoomed / totalZoomedWidth) * duration;
        const clampedTime = Math.max(0, Math.min(clickTime, duration));

        // Use shared seek handler (handles onSeek callback + state update)
        handleSeek(clampedTime / duration);
        onClick?.(clampedTime);
      },
      [duration, scrollOffset, totalZoomedWidth, onClick, handleSeek]
    );

    return (
      <div className="relative" style={{ width, height }}>
        {/* Hidden container for WaveSurfer audio backend */}
        <div
          ref={hiddenContainerRef}
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
            opacity: 0,
            pointerEvents: "none",
          }}
        />

        {/* Error state display */}
        {error && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-red-50 rounded"
            style={{ zIndex: 10 }}
          >
            <div className="text-center px-4">
              <svg
                className="mx-auto h-8 w-8 text-red-400 mb-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p className="text-sm text-red-600 font-medium">
                Audio loading failed
              </p>
              <p className="text-xs text-red-500 mt-1 max-w-xs truncate">
                {error.message || "Unable to decode audio file"}
              </p>
            </div>
          </div>
        )}

        {/* Visible canvas - renders only visible portion at full resolution */}
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onClick={handleClick}
          style={{
            width: "100%",
            height: "100%",
            cursor: error ? "default" : "pointer",
            borderRadius: "4px",
            opacity: error ? 0.3 : 1,
          }}
        />
      </div>
    );
  }
);

OptimizedWaveform.displayName = "OptimizedWaveform";

export default OptimizedWaveform;
