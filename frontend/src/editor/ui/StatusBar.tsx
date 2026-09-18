import React from "react";
import { EditorSnapshot } from "../EditorEngine";
import { isTimeSegment } from "../core/boxes";
import { formatDuration, formatTime } from "../render/ticks";
import { LabelChip } from "./LabelChip";

const khz = (hz: number) => `${(hz / 1000).toFixed(2)} kHz`;

export const StatusBar: React.FC<{ snap: EditorSnapshot | null; onEditLabel: () => void }> = ({ snap, onEditLabel }) => {
  if (!snap) return <div className="h-8 border-t border-gray-200 shrink-0" />;
  const { hover, selection } = snap;

  return (
    <div className="h-8 border-t border-gray-200 shrink-0 flex items-center gap-6 px-3 text-xs text-gray-600 tabular-nums">
      <span className="w-44 shrink-0">
        {hover ? `${formatTime(hover.time, 0.001)}${hover.freq !== null ? ` · ${khz(hover.freq)}` : ""}` : "—"}
      </span>

      {selection.length === 1 ? (
        <span className="flex items-center gap-2 text-gray-800">
          <LabelChip label={selection[0].label} onClick={onEditLabel} title="Type a label (F2) — or press a letter A–Z" />
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
        <span>
          {snap.boxCount} boxes · drag on the spectrogram to add one · Tab to step through
        </span>
      )}

      <div className="flex-1" />
      <span title="Time between spectrogram columns at this zoom / frequency bin width">
        column {formatDuration(snap.columnHop)} · Δf {(snap.sampleRate / snap.settings.fftSize).toFixed(0)} Hz
      </span>
      <span className="w-40 text-right" title="Spectrogram tiles being computed / main-thread time of the slowest recent frame">
        {snap.pendingTiles > 0 ? `computing ${snap.pendingTiles} tiles…` : `${snap.workers} workers`} · {snap.frameMs.toFixed(1)} ms
      </span>
    </div>
  );
};
