/**
 * Zoom controls component for BSMarker
 * Provides zoom in/out/reset functionality for spectrogram view
 */

import React from 'react';
import { MagnifyingGlassPlusIcon, MagnifyingGlassMinusIcon } from '@heroicons/react/24/outline';

export interface ZoomControlsProps {
  zoomLevel: number;
  minZoom?: number;
  maxZoom?: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset?: () => void;
  className?: string;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoomLevel,
  minZoom = 0.5,
  maxZoom = 10,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  className = '',
}) => {
  const canZoomIn = zoomLevel < maxZoom;
  const canZoomOut = zoomLevel > minZoom;
  const zoomPercent = Math.round(zoomLevel * 100);

  return (
    <div className={`flex flex-col items-center space-y-2 ${className}`}>
      {/* Zoom In */}
      <button
        onClick={onZoomIn}
        disabled={!canZoomIn}
        className={`
          p-2 rounded-md transition-colors
          ${canZoomIn 
            ? 'hover:bg-gray-100 text-gray-600 hover:text-gray-900' 
            : 'text-gray-300 cursor-not-allowed'
          }
        `}
        title="Zoom In (Ctrl+=)"
      >
        <MagnifyingGlassPlusIcon className="h-5 w-5" />
      </button>

      {/* Zoom Level Display */}
      <div className="text-xs text-gray-500 font-medium">
        {zoomPercent}%
      </div>

      {/* Zoom Out */}
      <button
        onClick={onZoomOut}
        disabled={!canZoomOut}
        className={`
          p-2 rounded-md transition-colors
          ${canZoomOut 
            ? 'hover:bg-gray-100 text-gray-600 hover:text-gray-900' 
            : 'text-gray-300 cursor-not-allowed'
          }
        `}
        title="Zoom Out (Ctrl+-)"
      >
        <MagnifyingGlassMinusIcon className="h-5 w-5" />
      </button>

      {/* Reset Zoom */}
      {onZoomReset && zoomLevel !== 1 && (
        <button
          onClick={onZoomReset}
          className="px-2 py-1 text-xs rounded-md hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
          title="Reset Zoom (Ctrl+0)"
        >
          Reset
        </button>
      )}
    </div>
  );
};

export default ZoomControls;