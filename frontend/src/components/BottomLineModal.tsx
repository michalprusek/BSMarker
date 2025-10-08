import React, { useState, useEffect } from "react";
import { XMarkIcon, ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/solid";

interface BottomLineModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFrequency: number;
  maxFrequency: number;
  onSave: (frequency: number) => void;
  onDelete: () => void;
}

const BottomLineModal: React.FC<BottomLineModalProps> = ({
  isOpen,
  onClose,
  currentFrequency,
  maxFrequency,
  onSave,
  onDelete,
}) => {
  const [frequency, setFrequency] = useState(Math.round(currentFrequency));
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFrequency(Math.round(currentFrequency));
      setShowDeleteConfirm(false);
    }
  }, [isOpen, currentFrequency]);

  if (!isOpen) return null;

  const handleIncrement = () => {
    setFrequency((prev) => Math.min(prev + 1, Math.round(maxFrequency)));
  };

  const handleDecrement = () => {
    setFrequency((prev) => Math.max(prev - 1, 0));
  };

  const handleSave = () => {
    const constrainedFreq = Math.max(0, Math.min(frequency, Math.round(maxFrequency)));
    onSave(constrainedFreq);
    onClose();
  };

  const handleDelete = () => {
    onDelete();
    onClose();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === "" || value === "-") {
      setFrequency(0);
      return;
    }
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      setFrequency(Math.max(0, Math.min(num, Math.round(maxFrequency))));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Bottom Line Settings
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {!showDeleteConfirm ? (
            <>
              <p className="text-sm text-gray-600 mb-4">
                Adjust the frequency boundary for bounding boxes
              </p>

              {/* Frequency input with arrows */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Frequency (Hz)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={frequency}
                    onChange={handleInputChange}
                    min={0}
                    max={Math.round(maxFrequency)}
                    className="flex-1 px-4 py-2 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={handleIncrement}
                      disabled={frequency >= Math.round(maxFrequency)}
                      className="p-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                      title="Increase by 1 Hz"
                    >
                      <ChevronUpIcon className="h-5 w-5 text-gray-700" />
                    </button>
                    <button
                      onClick={handleDecrement}
                      disabled={frequency <= 0}
                      className="p-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                      title="Decrease by 1 Hz"
                    >
                      <ChevronDownIcon className="h-5 w-5 text-gray-700" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Range: 0 - {Math.round(maxFrequency)} Hz
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  Delete Bottom Line
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Delete confirmation */}
              <p className="text-sm text-gray-900 mb-6">
                Are you sure you want to delete the bottom line? This will remove the frequency boundary constraint.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BottomLineModal;
