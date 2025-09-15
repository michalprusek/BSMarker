import React from "react";
import { XMarkIcon } from "@heroicons/react/24/solid";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: "Space", description: "Play/Pause audio" },
    { key: "←/→", description: "Pan horizontally left/right" },
    { key: ".", description: "Toggle annotation mode" },
    { key: "Backspace", description: "Delete selected bounding box" },
    { key: "Escape", description: "Deselect all / Exit annotation mode" },
    { key: "Ctrl/Cmd + Z", description: "Undo" },
    { key: "Ctrl/Cmd + Y", description: "Redo" },
    { key: "Ctrl/Cmd + Shift + Z", description: "Redo" },
    { key: "Ctrl/Cmd + C", description: "Copy selected box" },
    { key: "Ctrl/Cmd + V", description: "Paste box" },
    { key: "Ctrl/Cmd + S", description: "Save annotations" },
    { key: "Ctrl/Cmd + =", description: "Zoom in" },
    { key: "Ctrl/Cmd + -", description: "Zoom out" },
    { key: "Ctrl/Cmd + 0", description: "Reset zoom" },
    { key: "A-Z", description: "Quick label (when box selected)" },
    { key: "?", description: "Show this help" },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
          <div className="grid gap-2">
            {shortcuts.map((shortcut, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded"
              >
                <kbd className="px-2 py-1 text-sm font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">
                  {shortcut.key}
                </kbd>
                <span className="text-gray-700 ml-4 flex-1 text-right">
                  {shortcut.description}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Tip:</strong> Press{" "}
              <kbd className="px-1.5 py-0.5 text-xs font-semibold text-blue-800 bg-blue-100 border border-blue-200 rounded">
                ?
              </kbd>{" "}
              anytime to show this help.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsModal;
