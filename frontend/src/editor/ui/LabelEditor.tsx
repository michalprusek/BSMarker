import React, { useEffect, useRef, useState } from "react";
import { useDismiss } from "./useDismiss";

interface LabelEditorProps {
  title: string;
  initial: string;
  suggestions: string[];
  onApply: (label: string) => void;
  onClose: () => void;
}

/** Small floating input for labels longer than one letter (F2). */
export const LabelEditor: React.FC<LabelEditorProps> = ({ title, initial, suggestions, onApply, onClose }) => {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // The spectrogram doesn't take focus, so blur alone misses clicks into it.
  useDismiss(panelRef, onClose);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div ref={panelRef} className="absolute left-1/2 top-3 -translate-x-1/2 z-30 bg-white border border-gray-200 shadow-lg rounded-lg p-3 w-72">
      <div className="text-xs text-gray-500 mb-1.5">{title}</div>
      <input
        ref={inputRef}
        list="editor-label-suggestions"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            onApply(value.trim());
            onClose();
          } else if (e.key === "Escape") {
            onClose();
          }
          e.stopPropagation();
        }}
        onBlur={onClose}
        className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <datalist id="editor-label-suggestions">
        {suggestions.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
      <div className="text-[11px] text-gray-400 mt-1.5">Enter to apply · Esc to cancel</div>
    </div>
  );
};
