import React from "react";
import { EditorEngine, EditorSnapshot } from "../EditorEngine";
import { isTimeSegment } from "../core/boxes";
import { formatDuration, formatTime } from "../render/ticks";
import { ConflictNotice } from "./ConflictCard";
import { LabelChip } from "./LabelChip";
import { Tip } from "./Tip";
import { keepFocus } from "./Toolbar";

const khz = (hz: number) => `${(hz / 1000).toFixed(2)} kHz`;

interface StatusBarProps {
  engine: EditorEngine | null;
  snap: EditorSnapshot | null;
  /** Show what's wrong with the selected conflicting box (off while a popup or review owns the screen). */
  showConflict: boolean;
  onEditLabel: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({ engine, snap, showConflict, onEditLabel }) => {
  if (!snap) return <div className="h-8 border-t border-gray-200 shrink-0" />;
  const { hover, selection, conflicts } = snap;

  return (
    <div className="h-8 border-t border-gray-200 shrink-0 flex items-center gap-6 px-3 text-xs text-gray-600 tabular-nums whitespace-nowrap">
      <Tip title="Under the cursor" body="Time and frequency at the mouse position.">
        <span className="w-40 shrink-0">
          {hover ? `${formatTime(hover.time, 0.001)}${hover.freq !== null ? ` · ${khz(hover.freq)}` : ""}` : "—"}
        </span>
      </Tip>

      {selection.length === 1 ? (
        <span className="flex items-center gap-2 text-gray-800">
          <Tip
            title={`Label ${selection[0].label}`}
            body="Press a letter A–Z to relabel, or click to type a longer label."
            keys="F2"
          >
            <LabelChip label={selection[0].label} onClick={onEditLabel} title="" />
          </Tip>
          {formatTime(selection[0].start, 0.001)} – {formatTime(selection[0].end, 0.001)}
          <span className="text-gray-500">({formatDuration(selection[0].end - selection[0].start)})</span>
          {!isTimeSegment(selection[0]) && (
            <span className="text-gray-500">{khz(selection[0].fLow!)} – {khz(selection[0].fHigh!)}</span>
          )}
        </span>
      ) : selection.length > 1 ? (
        <span className="text-gray-800">
          {selection.length} boxes selected · press a letter to label them all
        </span>
      ) : (
        <span className="text-gray-500 truncate">
          {snap.boxCount} boxes · {snap.readOnly ? "read-only" : "drag on the spectrogram to add one"} · Tab to step through
        </span>
      )}

      <div className="flex-1" />
      {engine && showConflict && snap.focusedConflict ? (
        <ConflictNotice engine={engine} conflict={snap.focusedConflict} total={conflicts.length} />
      ) : conflicts.length > 0 ? (
        <Tip
          title="Conflicts"
          body="Overlapping boxes, gaps under 10 ms and boxes inside other boxes. Click to go to the next one."
          keys="F8"
        >
          <button
            onMouseDown={keepFocus}
            onClick={() => engine?.focusConflict(1)}
            className="text-red-700 font-medium hover:underline"
          >
            ⚠ {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"}
          </button>
        </Tip>
      ) : (
        snap.boxCount > 0 && <span className="text-green-700">✓ no conflicts</span>
      )}
      {snap.pendingTiles > 0 && <span className="text-gray-400">computing spectrogram…</span>}
      <Tip title="Visible time span" body="Scroll with Ctrl/⌘ or pinch to zoom; 0 shows the whole recording.">
        <span className="w-24 text-right">view {formatDuration(snap.t1 - snap.t0)}</span>
      </Tip>
    </div>
  );
};
