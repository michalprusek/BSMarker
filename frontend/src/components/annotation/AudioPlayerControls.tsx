/**
 * Audio player controls component for BSMarker
 * Provides playback controls for annotation editor
 */

import React from 'react';
import { PlayIcon, PauseIcon } from '@heroicons/react/24/solid';

export interface AudioPlayerControlsProps {
  isPlaying: boolean;
  playbackSpeed: number;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onSpeedChange: () => void;
  onSeek?: (time: number) => void;
  className?: string;
}

export const AudioPlayerControls: React.FC<AudioPlayerControlsProps> = ({
  isPlaying,
  playbackSpeed,
  currentTime,
  duration,
  onPlayPause,
  onSpeedChange,
  onSeek,
  className = '',
}) => {
  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek || !duration) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const time = percent * duration;
    onSeek(time);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      {/* Play/Pause Button */}
      <button
        onClick={onPlayPause}
        className="p-2 rounded-full bg-blue-600 hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
      >
        {isPlaying ? (
          <PauseIcon className="h-5 w-5 text-white" />
        ) : (
          <PlayIcon className="h-5 w-5 text-white" />
        )}
      </button>

      {/* Playback Speed */}
      <button
        onClick={onSpeedChange}
        className="px-3 py-1 text-sm font-medium rounded bg-blue-100 hover:bg-blue-200 text-blue-700 transition-colors"
        title="Playback speed (click to cycle)"
      >
        {playbackSpeed}×
      </button>

      {/* Time Display */}
      <div className="flex items-center space-x-2 text-sm text-gray-600">
        <span className="font-mono">{formatTime(currentTime)}</span>
        <span>/</span>
        <span className="font-mono">{formatTime(duration)}</span>
      </div>

      {/* Progress Bar */}
      {onSeek && (
        <div className="flex-1 max-w-xs">
          <div
            className="relative h-2 bg-gray-200 rounded-full cursor-pointer group"
            onClick={handleProgressClick}
          >
            <div
              className="absolute inset-y-0 left-0 bg-blue-600 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-600 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `${progressPercent}%`, marginLeft: '-6px' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioPlayerControls;