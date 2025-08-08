import React from 'react';
import { TrashIcon } from '@heroicons/react/24/outline';
import { BoundingBox } from '../types';
import clsx from 'clsx';

interface BoundingBoxListProps {
  boxes: BoundingBox[];
  onDelete: (index: number) => void;
  onSelect: (box: BoundingBox | null) => void;
  selectedBox: BoundingBox | null;
}

const BoundingBoxList: React.FC<BoundingBoxListProps> = ({
  boxes,
  onDelete,
  onSelect,
  selectedBox,
}) => {
  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900 mb-2">Annotations</h2>
      {boxes.length === 0 ? (
        <p className="text-sm text-gray-500">No annotations yet. Draw a bounding box on the spectrogram to start.</p>
      ) : (
        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Label
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time Range
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Frequency Range
                </th>
                <th className="relative px-3 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {boxes.map((box, index) => (
                <tr
                  key={index}
                  className={clsx(
                    'cursor-pointer hover:bg-gray-50',
                    selectedBox === box && 'bg-blue-50'
                  )}
                  onClick={() => onSelect(box)}
                >
                  <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {box.label}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                    {box.start_time.toFixed(2)}s - {box.end_time.toFixed(2)}s
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                    {box.min_frequency?.toFixed(0)}Hz - {box.max_frequency?.toFixed(0)}Hz
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(index);
                      }}
                      className="text-red-600 hover:text-red-900"
                    >
                      <TrashIcon className="h-5 w-5" />
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