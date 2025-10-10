import React, { useState } from "react";
import { BaseModal, ModalBody, ModalFooter } from "./shared/BaseModal";

interface ContrastModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentContrast: number;
  onContrastChange: (contrast: number) => void;
}

const ContrastModal: React.FC<ContrastModalProps> = ({
  isOpen,
  onClose,
  currentContrast,
  onContrastChange,
}) => {
  const [tempContrast, setTempContrast] = useState(currentContrast);

  // Update temp contrast when modal opens with new value
  React.useEffect(() => {
    if (isOpen) {
      setTempContrast(currentContrast);
    }
  }, [isOpen, currentContrast]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setTempContrast(value);
    onContrastChange(value);
  };

  const handleReset = () => {
    setTempContrast(1.0);
    onContrastChange(1.0);
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Adjust Contrast"
      description="Adjust the contrast of the spectrogram for better visibility"
      size="md"
    >
      <ModalBody>
        <div className="space-y-4">
          {/* Contrast value display */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">
              Contrast Level
            </label>
            <span className="text-lg font-semibold text-gray-900">
              {tempContrast.toFixed(2)}
            </span>
          </div>

          {/* Slider */}
          <div className="space-y-2">
            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.1"
              value={tempContrast}
              onChange={handleSliderChange}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((tempContrast - 0.5) / 4.5) * 100}%, #e5e7eb ${((tempContrast - 0.5) / 4.5) * 100}%, #e5e7eb 100%)`,
              }}
            />
            {/* Range labels */}
            <div className="flex justify-between text-xs text-gray-500">
              <span>0.5 (Low)</span>
              <span>1.0 (Normal)</span>
              <span>5.0 (High)</span>
            </div>
          </div>

          {/* Visual indicator */}
          <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-600">
              <strong>Tip:</strong> Higher contrast makes peaks stand out more,
              while lower contrast softens the image. Adjust to your preference
              for optimal annotation visibility.
            </p>
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <button
          onClick={handleReset}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
        >
          Reset to Default
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Close
        </button>
      </ModalFooter>
    </BaseModal>
  );
};

export default ContrastModal;
