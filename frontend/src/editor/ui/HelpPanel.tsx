import React from "react";

const SECTIONS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Annotate",
    rows: [
      ["Drag on empty spectrogram", "New box"],
      ["Drag in the lane / waveform", "New time segment (full frequency range)"],
      ["Ctrl/⌘ + drag", "New box even on top of another box"],
      ["A – Z", "Label the selection (without selection: label for new boxes)"],
      ["F2", "Type a longer label"],
      ["Drag a box", "Move (Shift: keep direction)"],
      ["Drag an edge or corner", "Resize"],
      ["Alt while dragging", "Don't snap to other boxes"],
      ["← → / ↑ ↓", "Nudge selection by 1 px (Shift: 10 px)"],
      ["Delete", "Delete selection"],
      ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"],
      ["Ctrl+C / X / V / D", "Copy / cut / paste at cursor / duplicate"],
      ["Esc", "Cancel drag · stop · deselect"],
      ["F8 / Shift+F8", "Next / previous conflict (overlap, gap < 10 ms, nested box)"],
    ],
  },
  {
    title: "Select",
    rows: [
      ["Click", "Select box / move playback cursor"],
      ["Shift + click", "Add to / remove from selection"],
      ["Shift + drag", "Select boxes in a rectangle"],
      ["Ctrl+A", "Select all"],
      ["Tab / Shift+Tab", "Next / previous box"],
    ],
  },
  {
    title: "Listen",
    rows: [
      ["Space", "Play / pause"],
      ["Enter / double-click box", "Play selection (or visible range)"],
      ["Shift+Enter", "Play selection in a loop"],
    ],
  },
  {
    title: "Navigate",
    rows: [
      ["Scroll / two-finger swipe", "Pan in time"],
      ["Ctrl/⌘ + scroll, pinch", "Zoom time at cursor"],
      ["Alt + scroll", "Zoom frequency at cursor"],
      ["Scroll on ruler / frequency axis", "Zoom that axis"],
      ["Drag ruler, axis, minimap; middle button", "Pan"],
      ["+ / −, 0", "Zoom in / out, whole recording"],
      ["Shift+2", "Zoom to selection"],
      ["Double-click frequency axis", "Reset frequency zoom"],
      ["Page Up / Page Down", "Previous / next recording (changes are saved)"],
    ],
  },
];

export const HelpPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="absolute right-3 top-3 w-[26rem] max-h-[calc(100%-1.5rem)] overflow-y-auto bg-white shadow-lg border border-gray-200 rounded-lg p-4 text-xs z-20">
    <div className="flex justify-between items-center mb-2">
      <h3 className="font-semibold text-sm">Controls</h3>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
    </div>
    {SECTIONS.map((section) => (
      <div key={section.title} className="mb-3">
        <div className="font-semibold text-gray-500 uppercase tracking-wide text-[10px] mb-1">{section.title}</div>
        <table className="w-full">
          <tbody>
            {section.rows.map(([key, action]) => (
              <tr key={key}>
                <td className="py-0.5 pr-3 text-gray-500 whitespace-nowrap align-top">{key}</td>
                <td className="py-0.5">{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ))}
  </div>
);
