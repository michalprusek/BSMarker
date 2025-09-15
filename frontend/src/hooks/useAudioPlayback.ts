/**
 * Audio playback management hook for BSMarker
 * Handles WaveSurfer.js integration and playback controls
 */

import { useState, useCallback, useRef, useEffect } from "react";
import WaveSurfer from "wavesurfer.js";
import { logger } from "../lib/logger";

const PLAYBACK_SPEEDS = [1, 2, 4, 8, 16];

export interface UseAudioPlaybackProps {
  audioUrl?: string;
  onTimeUpdate?: (time: number) => void;
  onReady?: () => void;
}

export interface UseAudioPlaybackReturn {
  // State
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackSpeed: number;
  isReady: boolean;

  // Controls
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  seek: (time: number) => void;
  seekToPercent: (percent: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  cyclePlaybackSpeed: () => void;

  // Refs
  wavesurferRef: React.MutableRefObject<WaveSurfer | null>;
  waveformRef: React.RefObject<HTMLDivElement>;
}

export const useAudioPlayback = ({
  audioUrl,
  onTimeUpdate,
  onReady,
}: UseAudioPlaybackProps): UseAudioPlaybackReturn => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeedState] = useState(1);
  const [isReady, setIsReady] = useState(false);

  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveformRef.current || !audioUrl) return;

    try {
      // Clean up existing instance
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
      }

      // Create new instance
      const wavesurfer = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: "#3b82f6",
        progressColor: "#1e40af",
        cursorColor: "#ef4444",
        barWidth: 2,
        barRadius: 3,
        height: 80,
        normalize: true,
        backend: "WebAudio",
      });

      // Set up event handlers
      wavesurfer.on("ready", () => {
        setDuration(wavesurfer.getDuration());
        setIsReady(true);
        logger.info("WaveSurfer ready", "AudioPlayback");
        onReady?.();
      });

      wavesurfer.on("play", () => {
        setIsPlaying(true);
        startTimeUpdate();
      });

      wavesurfer.on("pause", () => {
        setIsPlaying(false);
        stopTimeUpdate();
      });

      wavesurfer.on("finish", () => {
        setIsPlaying(false);
        setCurrentTime(duration);
        stopTimeUpdate();
      });

      wavesurfer.on("error", (error) => {
        logger.error("WaveSurfer error", "AudioPlayback", error);
        setIsReady(false);
      });

      // Load audio
      wavesurfer.load(audioUrl);
      wavesurferRef.current = wavesurfer;

      logger.debug("WaveSurfer initialized", "AudioPlayback", { audioUrl });
    } catch (error) {
      logger.error("Failed to initialize WaveSurfer", "AudioPlayback", error);
    }

    return () => {
      stopTimeUpdate();
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
    };
  }, [audioUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Time update animation loop
  const startTimeUpdate = useCallback(() => {
    const updateTime = () => {
      if (wavesurferRef.current && wavesurferRef.current.isPlaying()) {
        const time = wavesurferRef.current.getCurrentTime();
        setCurrentTime(time);
        onTimeUpdate?.(time);
        animationFrameRef.current = requestAnimationFrame(updateTime);
      }
    };
    updateTime();
  }, [onTimeUpdate]);

  const stopTimeUpdate = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  // Playback controls
  const play = useCallback(() => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.play();
      logger.debug("Audio play", "AudioPlayback");
    }
  }, [isReady]);

  const pause = useCallback(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.pause();
      logger.debug("Audio pause", "AudioPlayback");
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.playPause();
      logger.debug("Audio play/pause toggle", "AudioPlayback");
    }
  }, [isReady]);

  const seek = useCallback(
    (time: number) => {
      if (wavesurferRef.current && duration > 0) {
        const position = time / duration;
        wavesurferRef.current.seekTo(position);
        setCurrentTime(time);
        onTimeUpdate?.(time);
        logger.debug(`Audio seek to ${time}s`, "AudioPlayback");
      }
    },
    [duration, onTimeUpdate],
  );

  const seekToPercent = useCallback(
    (percent: number) => {
      if (wavesurferRef.current) {
        wavesurferRef.current.seekTo(percent);
        const time = percent * duration;
        setCurrentTime(time);
        onTimeUpdate?.(time);
        logger.debug(`Audio seek to ${percent * 100}%`, "AudioPlayback");
      }
    },
    [duration, onTimeUpdate],
  );

  const setPlaybackSpeed = useCallback((speed: number) => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setPlaybackRate(speed);
      setPlaybackSpeedState(speed);
      logger.debug(`Playback speed set to ${speed}x`, "AudioPlayback");
    }
  }, []);

  const cyclePlaybackSpeed = useCallback(() => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    const nextSpeed = PLAYBACK_SPEEDS[nextIndex];
    setPlaybackSpeed(nextSpeed);
  }, [playbackSpeed, setPlaybackSpeed]);

  return {
    // State
    isPlaying,
    currentTime,
    duration,
    playbackSpeed,
    isReady,

    // Controls
    play,
    pause,
    togglePlayPause,
    seek,
    seekToPercent,
    setPlaybackSpeed,
    cyclePlaybackSpeed,

    // Refs
    wavesurferRef,
    waveformRef,
  };
};
