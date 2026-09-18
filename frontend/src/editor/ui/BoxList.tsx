import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ExclamationTriangleIcon,
  PlayCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { EditorEngine, EditorSnapshot } from "../EditorEngine";
import { EditorBox, isTimeSegment } from "../core/boxes";
import { conflictedIds } from "../edit/conflicts";
import { formatDuration, formatTime } from "../render/ticks";
import { LabelChip } from "./LabelChip";
import { keepFocus } from "./Toolbar";
import { fixAllGapsWithReport } from "./ConflictCard";

interface BoxListProps {
  engine: EditorEngine;
  snap: EditorSnapshot;
  onClose: () => void;
  /** Start a listen-through review of the listed boxes (null label = all). */
  onReview: (boxes: EditorBox[], label: string | null) => void;
}

/**
 * Side panel listing the recording's boxes in time order: overview per
 * label, conflicts, and click-to-jump. The canvas and the list share one
 * selection.
 */
export const BoxList: React.FC<BoxListProps> = ({
  engine,
  snap,
  onClose,
  onReview,
}) => {
  const [filter, setFilter] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { boxes, conflicts } = snap;

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    boxes.forEach((b) => map.set(b.label, (map.get(b.label) ?? 0) + 1));
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [boxes]);
  const conflicted = useMemo(() => conflictedIds(conflicts), [conflicts]);
  const visible =
    filter === null ? boxes : boxes.filter((b) => b.label === filter);
  const selectedIds = useMemo(
    () => new Set(snap.selection.map((b) => b.id)),
    [snap.selection],
  );
  const gapCount = conflicts.filter((c) => c.kind === "gap").length;

  // Keep the (first) selected box visible in the list.
  const firstSelected = snap.selection[0]?.id;
  useEffect(() => {
    if (!firstSelected) return;
    listRef.current
      ?.querySelector(`[data-box-id="${CSS.escape(firstSelected)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [firstSelected]);

  const open = (box: EditorBox, toggle: boolean) => {
    engine.doc.select([box.id], toggle ? "toggle" : "replace");
    if (!toggle) {
      engine.seek(box.start);
      engine.reveal(box.start, box.end);
    }
  };

  return (
    <aside className="w-72 shrink-0 border-l border-gray-200 flex flex-col min-h-0 text-xs bg-white">
      <div className="flex items-center justify-between px-3 h-9 border-b border-gray-200">
        <span className="font-semibold text-sm">
          Boxes{" "}
          <span className="text-gray-400 font-normal">{boxes.length}</span>
        </span>
        <div className="flex-1" />
        <button
          className="flex items-center gap-1 px-2 py-0.5 mr-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-40"
          onMouseDown={keepFocus}
          disabled={visible.length === 0}
          onClick={() => onReview(visible, filter)}
          title={
            filter === null
              ? "Listen through all boxes, one by one"
              : `Listen through all ${filter} boxes — are they really the same syllable?`
          }
        >
          <PlayCircleIcon className="h-4 w-4" /> Review
          {filter !== null ? ` ${filter}` : ""}
        </button>
        <button
          className="p-1 rounded hover:bg-gray-100"
          onMouseDown={keepFocus}
          onClick={onClose}
          title="Close panel"
        >
          <XMarkIcon className="h-4 w-4 text-gray-500" />
        </button>
      </div>

      {conflicts.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-200 bg-red-50 flex items-center gap-2">
          <ExclamationTriangleIcon className="h-4 w-4 text-red-600 shrink-0" />
          <button
            className="text-red-700 underline text-left"
            onMouseDown={keepFocus}
            onClick={() => engine.focusConflict(1)}
            title="Go to the next conflict (F8)"
          >
            {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"}
          </button>
          <div className="flex-1" />
          {gapCount > 0 && !snap.readOnly && (
            <button
              className="px-2 py-0.5 rounded border border-red-300 bg-white text-red-700 hover:bg-red-100"
              onMouseDown={keepFocus}
              onClick={() => fixAllGapsWithReport(engine)}
            >
              Fix all gaps
            </button>
          )}
        </div>
      )}

      {counts.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-200 flex flex-wrap gap-1">
          <button
            className={`px-1.5 py-0.5 rounded border ${filter === null ? "border-gray-500 bg-gray-100" : "border-gray-200 text-gray-500"}`}
            onMouseDown={keepFocus}
            onClick={() => setFilter(null)}
          >
            All
          </button>
          {counts.map(([label, count]) => (
            <span
              key={label}
              className={`flex items-center gap-0.5 rounded ${filter === label ? "ring-2 ring-gray-500" : ""}`}
            >
              <LabelChip
                label={label}
                onClick={() => setFilter(filter === label ? null : label)}
                title={`Show only ${label}`}
              />
              <span className="text-gray-500 pr-1">{count}</span>
            </span>
          ))}
        </div>
      )}

      <div ref={listRef} className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="p-3 text-gray-400">
            No boxes yet — drag on the spectrogram to add one.
          </p>
        ) : (
          visible.map((box) => (
            <BoxRow
              key={box.id}
              box={box}
              selected={selectedIds.has(box.id)}
              conflicted={conflicted.has(box.id)}
              onClick={(toggle) => open(box, toggle)}
            />
          ))
        )}
      </div>
    </aside>
  );
};

const BoxRow = React.memo<{
  box: EditorBox;
  selected: boolean;
  conflicted: boolean;
  onClick: (toggle: boolean) => void;
}>(
  ({ box, selected, conflicted, onClick }) => (
    <div
      data-box-id={box.id}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => onClick(e.shiftKey || e.ctrlKey || e.metaKey)}
      className={`flex items-center gap-2 px-3 py-1 cursor-pointer tabular-nums border-l-2 ${
        selected
          ? "bg-amber-50 border-amber-500"
          : "border-transparent hover:bg-gray-50"
      }`}
    >
      <LabelChip label={box.label} />
      <span className="w-16">{formatTime(box.start, 0.001)}</span>
      <span className="w-14 text-gray-500">
        {formatDuration(box.end - box.start)}
      </span>
      <span className="flex-1 text-gray-400 truncate">
        {isTimeSegment(box)
          ? "all Hz"
          : `${(box.fLow! / 1000).toFixed(1)}–${(box.fHigh! / 1000).toFixed(1)}k`}
      </span>
      {conflicted && (
        <ExclamationTriangleIcon
          className="h-3.5 w-3.5 text-red-600"
          title="Conflict"
        />
      )}
    </div>
  ),
  // Re-render a row only when its own data changes.
  (a, b) =>
    a.box === b.box &&
    a.selected === b.selected &&
    a.conflicted === b.conflicted,
);
