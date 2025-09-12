import React, { useState } from 'react';
import { TrashIcon, PencilIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { BoundingBox } from '../types';
import clsx from 'clsx';

interface BoundingBoxListProps {
  boxes: BoundingBox[];
  onDelete: (index: number) => void;
  onSelect: (box: BoundingBox | null) => void;
  selectedBox: BoundingBox | null;
  onUpdateLabel?: (index: number, newLabel: string) => void;
  selectedBoxes?: Set<number>;
  onSelectMultiple?: (indices: Set<number>) => void;
}

const BoundingBoxList: React.FC<BoundingBoxListProps> = ({
  boxes,
  onDelete,
  onSelect,
  selectedBox,
  onUpdateLabel,
  selectedBoxes = new Set(),
  onSelectMultiple,
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState('');

  const handleEditStart = (index: number, currentLabel: string) => {
    setEditingIndex(index);
    setEditingLabel(currentLabel);
  };

  const handleEditSave = () => {
    if (editingIndex !== null && onUpdateLabel) {
      onUpdateLabel(editingIndex, editingLabel);
    }
    setEditingIndex(null);
    setEditingLabel('');
  };

  const handleEditCancel = () => {
    setEditingIndex(null);
    setEditingLabel('');
  };

  const handleSelectAll = () => {
    if (onSelectMultiple) {
      const allIndices = new Set(boxes.map((_, index) => index));
      onSelectMultiple(allIndices);
    }
  };

  const handleUnselectAll = () => {
    if (onSelectMultiple) {
      onSelectMultiple(new Set());
    }
  };

  const handleCheckboxChange = (index: number) => {
    if (onSelectMultiple) {
      const newSelection = new Set(selectedBoxes);
      if (newSelection.has(index)) {
        newSelection.delete(index);
      } else {
        newSelection.add(index);
      }
      onSelectMultiple(newSelection);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-medium text-gray-900">Annotations</h2>
        {boxes.length > 0 && onSelectMultiple && (
          <div className="flex gap-2">
            <button
              onClick={handleSelectAll}
              className="px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-500 hover:bg-blue-50 rounded-md transition-colors"
            >
              Select All
            </button>
            <button
              onClick={handleUnselectAll}
              className="px-3 py-1 text-xs font-medium text-gray-600 hover:text-gray-500 hover:bg-gray-50 rounded-md transition-colors"
            >
              Unselect All
            </button>
          </div>
        )}
      </div>
      
      {boxes.length === 0 ? (
        <p className="text-sm text-gray-500">No annotations yet. Draw a bounding box on the spectrogram to start.</p>
      ) : (
        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                {onSelectMultiple && (
                  <th className="px-2 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedBoxes.size === boxes.length && boxes.length > 0}
                      onChange={() => {
                        if (selectedBoxes.size === boxes.length) {
                          handleUnselectAll();
                        } else {
                          handleSelectAll();
                        }
                      }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  </th>
                )}
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Label
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time Range
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Frequency Range
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {boxes.map((box, index) => (
                <tr
                  key={index}
                  className={clsx(
                    'cursor-pointer hover:bg-gray-50',
                    selectedBox === box && 'bg-blue-50',
                    selectedBoxes.has(index) && 'bg-blue-50/50'
                  )}
                  onClick={() => onSelect(box)}
                >
                  {onSelectMultiple && (
                    <td className="px-2 py-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedBoxes.has(index)}
                        onChange={() => handleCheckboxChange(index)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                  )}
                  <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {editingIndex === index ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editingLabel}
                          onChange={(e) => setEditingLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleEditSave();
                            } else if (e.key === 'Escape') {
                              handleEditCancel();
                            }
                          }}
                          className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                        <button
                          onClick={handleEditSave}
                          className="p-1 text-green-600 hover:text-green-700"
                        >
                          <CheckIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={handleEditCancel}
                          className="p-1 text-gray-600 hover:text-gray-700"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span>{box.label}</span>
                        {onUpdateLabel && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditStart(index, box.label || 'None');
                            }}
                            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                          >
                            <PencilIcon className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                    {box.start_time.toFixed(2)}s - {box.end_time.toFixed(2)}s
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                    {box.min_frequency?.toFixed(0)}Hz - {box.max_frequency?.toFixed(0)}Hz
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(index);
                      }}
                      className="inline-flex items-center px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                    >
                      <TrashIcon className="h-4 w-4 mr-1" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default BoundingBoxList;