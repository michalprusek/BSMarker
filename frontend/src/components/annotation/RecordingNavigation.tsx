/**
 * Recording navigation component for BSMarker
 * Provides navigation between recordings in a project
 */

import React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';

export interface RecordingNavigationProps {
  currentIndex: number;
  totalRecordings: number;
  recordingName?: string;
  onPrevious: () => void;
  onNext: () => void;
  onJumpTo?: (index: number) => void;
  className?: string;
}

export const RecordingNavigation: React.FC<RecordingNavigationProps> = ({
  currentIndex,
  totalRecordings,
  recordingName,
  onPrevious,
  onNext,
  onJumpTo,
  className = '',
}) => {
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < totalRecordings - 1;

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onJumpTo) {
      const value = parseInt((e.target as HTMLInputElement).value, 10);
      if (value >= 1 && value <= totalRecordings) {
        onJumpTo(value - 1);
      }
    }
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {/* Previous Button */}
      <button
        onClick={onPrevious}
        disabled={!canGoPrevious}
        className={`
          p-1 rounded-md transition-colors
          ${canGoPrevious 
            ? 'hover:bg-gray-100 text-gray-600 hover:text-gray-900' 
            : 'text-gray-300 cursor-not-allowed'
          }
        `}
        title="Previous recording (←)"
        aria-label="Previous recording"
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>

      {/* Recording Counter */}
      <div className="flex items-center space-x-1 text-sm">
        {onJumpTo ? (
          <input
            type="number"
            min="1"
            max={totalRecordings}
            value={currentIndex + 1}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              if (value >= 1 && value <= totalRecordings) {
                onJumpTo(value - 1);
              }
            }}
            onKeyPress={handleKeyPress}
            className="w-12 px-1 py-0.5 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Recording number"
          />
        ) : (
          <span className="font-medium">{currentIndex + 1}</span>
        )}
        <span className="text-gray-400">/</span>
        <span className="font-medium">{totalRecordings}</span>
      </div>

      {/* Next Button */}
      <button
        onClick={onNext}
        disabled={!canGoNext}
        className={`
          p-1 rounded-md transition-colors
          ${canGoNext 
            ? 'hover:bg-gray-100 text-gray-600 hover:text-gray-900' 
            : 'text-gray-300 cursor-not-allowed'
          }
        `}
        title="Next recording (→)"
        aria-label="Next recording"
      >
        <ChevronRightIcon className="h-5 w-5" />
      </button>

      {/* Recording Name */}
      {recordingName && (
        <>
          <div className="w-px h-5 bg-gray-300" />
          <div className="text-sm text-gray-700 max-w-xs truncate" title={recordingName}>
            <span className="font-medium">{recordingName}</span>
          </div>
        </>
      )}
    </div>
  );
};

export default RecordingNavigation;