/**
 * Annotation toolbar component for BSMarker
 * Provides tools for annotation mode selection and manipulation
 */

import React from 'react';
import {
  PencilIcon,
  CursorArrowRaysIcon,
  HandRaisedIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
} from '@heroicons/react/24/outline';

export type AnnotationTool = 'draw' | 'select' | 'pan';

export interface AnnotationToolbarProps {
  currentTool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  selectedCount: number;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  canDelete?: boolean;
  canDuplicate?: boolean;
  className?: string;
  orientation?: 'horizontal' | 'vertical';
}

export const AnnotationToolbar: React.FC<AnnotationToolbarProps> = ({
  currentTool,
  onToolChange,
  selectedCount,
  onDelete,
  onDuplicate,
  onSelectAll,
  onClearSelection,
  canDelete = true,
  canDuplicate = true,
  className = '',
  orientation = 'vertical',
}) => {
  const tools: Array<{
    id: AnnotationTool;
    icon: React.ElementType;
    label: string;
    tooltip: string;
  }> = [
    {
      id: 'draw',
      icon: PencilIcon,
      label: 'Draw',
      tooltip: 'Draw bounding boxes (D)',
    },
    {
      id: 'select',
      icon: CursorArrowRaysIcon,
      label: 'Select',
      tooltip: 'Select and edit boxes (S)',
    },
    {
      id: 'pan',
      icon: HandRaisedIcon,
      label: 'Pan',
      tooltip: 'Pan the view (H)',
    },
  ];

  const containerClass = orientation === 'horizontal' 
    ? 'flex flex-row items-center space-x-2' 
    : 'flex flex-col items-center space-y-2';

  const buttonBaseClass = 'p-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500';
  
  return (
    <div className={`${containerClass} ${className}`}>
      {/* Tool Selection */}
      <div className={orientation === 'horizontal' ? 'flex space-x-1' : 'space-y-1'}>
        {tools.map(tool => {
          const Icon = tool.icon;
          const isActive = currentTool === tool.id;
          
          return (
            <button
              key={tool.id}
              onClick={() => onToolChange(tool.id)}
              className={`
                ${buttonBaseClass}
                ${isActive 
                  ? 'bg-blue-500 text-white hover:bg-blue-600' 
                  : 'bg-white text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }
              `}
              title={tool.tooltip}
              aria-label={tool.label}
              aria-pressed={isActive}
            >
              <Icon className="h-5 w-5" />
            </button>
          );
        })}
      </div>

      {/* Separator */}
      <div className={orientation === 'horizontal' 
        ? 'w-px h-8 bg-gray-300' 
        : 'w-8 h-px bg-gray-300'
      } />

      {/* Selection Actions */}
      {selectedCount > 0 && (
        <div className={orientation === 'horizontal' ? 'flex items-center space-x-1' : 'space-y-1'}>
          {/* Selected Count Badge */}
          <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-sm font-medium">
            {selectedCount} selected
          </div>

          {/* Delete Selected */}
          {canDelete && onDelete && (
            <button
              onClick={onDelete}
              className={`${buttonBaseClass} text-red-600 hover:bg-red-50 hover:text-red-700`}
              title="Delete selected (Delete/Backspace)"
              aria-label="Delete selected"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          )}

          {/* Duplicate Selected */}
          {canDuplicate && onDuplicate && (
            <button
              onClick={onDuplicate}
              className={`${buttonBaseClass} text-gray-600 hover:bg-gray-100 hover:text-gray-900`}
              title="Duplicate selected (Ctrl+D)"
              aria-label="Duplicate selected"
            >
              <ClipboardDocumentIcon className="h-5 w-5" />
            </button>
          )}

          {/* Clear Selection */}
          {onClearSelection && (
            <button
              onClick={onClearSelection}
              className={`${buttonBaseClass} text-gray-600 hover:bg-gray-100 hover:text-gray-900`}
              title="Clear selection (Escape)"
              aria-label="Clear selection"
            >
              <ArrowsPointingInIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      {/* Select All */}
      {selectedCount === 0 && onSelectAll && (
        <button
          onClick={onSelectAll}
          className={`${buttonBaseClass} text-gray-600 hover:bg-gray-100 hover:text-gray-900`}
          title="Select all (Ctrl+A)"
          aria-label="Select all"
        >
          <ArrowsPointingOutIcon className="h-5 w-5" />
        </button>
      )}
    </div>
  );
};

export default AnnotationToolbar;