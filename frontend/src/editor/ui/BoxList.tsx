import React, { useEffect, useMemo, useRef, useState } from "react";
import { LABEL_COLORS } from "../../utils/constants";
import {
  ExclamationTriangleIcon,
  PlayCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { EditorEngine, EditorSnapshot } from "../EditorEngine";
import { EditorBox, colorIndexForLabel, isTimeSegment } from "../core/boxes";
import { conflictedIds } from "../edit/conflicts";
import { formatDuration, formatTime } from "../render/ticks";
import { LabelChip } from "./LabelChip";
import { keepFocus } from "./Toolbar";
import { fixAllGapsWithReport } from "./ConflictCard";
import { Tip } from "./Tip";

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
        <Tip
          title={filter === null ? "Review all boxes" : `Review only ${filter}`}
          body={
            filter === null
              ? "Listen through the boxes one by one and relabel with a letter. Pick a label below to review just that one."
              : `Listen through all ${filter} boxes one by one — are they really the same syllable?`
          }
        >
          <button
            className="flex items-center gap-1 px-2 py-0.5 mr-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-40"
            onMouseDown={keepFocus}
            disabled={visible.length === 0}
            onClick={() => onReview(visible, filter)}
          >
            <PlayCircleIcon className="h-4 w-4" /> Review
            {filter !== null ? ` only ${filter}` : ""}
          </button>
        </Tip>
        <Tip
          title="Close panel"
          body="The ☰ button in the toolbar opens it again."
        >
          <button
            className="p-1 rounded hover:bg-gray-100"
            onMouseDown={keepFocus}
            onClick={onClose}
          >
            <XMarkIcon className="h-4 w-4 text-gray-500" />
          </button>
        </Tip>
      </div>

      {conflicts.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-200 bg-red-50 flex items-center gap-2">
          <ExclamationTriangleIcon className="h-4 w-4 text-red-600 shrink-0" />
          <Tip
            title="Go to the next conflict"
            body="Overlapping boxes, gaps under 10 ms and boxes inside other boxes."
            keys="F8"
          >
            <button
              className="text-red-700 underline text-left"
              onMouseDown={keepFocus}
              onClick={() => engine.focusConflict(1)}
            >
              {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"}
            </button>
          </Tip>
          <div className="flex-1" />
          {gapCount > 0 && !snap.readOnly && (
            <Tip
              title="Fix all gaps"
              body="Moves box edges apart so every pair keeps a 12 ms gap. Nested boxes are left for you. One Ctrl+Z undoes it all."
            >
              <button
                className="px-2 py-0.5 rounded border border-red-300 bg-white text-red-700 hover:bg-red-100"
                onMouseDown={keepFocus}
                onClick={() => fixAllGapsWithReport(engine)}
              >
                Fix all gaps
              </button>
            </Tip>
          )}
        </div>
      )}

      {counts.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-200 flex flex-wrap gap-1">
          <button
            className={`px-1.5 h-5 rounded border text-[11px] ${filter === null ? "border-gray-500 bg-gray-100 text-gray-800" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
            onMouseDown={keepFocus}
            onClick={() => setFilter(null)}
            title="Show all boxes"
          >
            All {boxes.length}
          </button>
          {counts.map(([label, count]) => (
            <FilterChip
              key={label}
              label={label}
              count={count}
              active={filter === label}
              dimmed={filter !== null && filter !== label}
              onClick={() => setFilter(filter === label ? null : label)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 px-3 h-6 border-b border-gray-100 text-[11px] text-gray-400">
        <span className="min-w-[1.5rem]">Label</span>
        <span className="w-16">Start</span>
        <span className="w-14">Length</span>
        <span className="flex-1">kHz</span>
      </div>

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

/** Label filter: letter in its box colour with the count, one compact pill. */
const FilterChip: React.FC<{
  label: string;
  count: number;
  active: boolean;
  dimmed: boolean;
  onClick: () => void;
}> = ({ label, count, active, dimmed, onClick }) => (
  <button
    type="button"
    onMouseDown={keepFocus}
    onClick={onClick}
    title={active ? "Show all labels again" : `Show only ${label} (${count})`}
    className={`flex items-center h-5 rounded overflow-hidden border text-[11px] font-semibold ${
      active ? "border-gray-800 ring-1 ring-gray-800" : "border-transparent"
    } ${dimmed ? "opacity-40 hover:opacity-80" : ""}`}
  >
    <span
      className="px-1 text-white h-full flex items-center"
      style={{ background: LABEL_COLORS[colorIndexForLabel(label)].stroke }}
    >
      {label}
    </span>
    <span className="px-1 bg-gray-100 text-gray-600 font-normal h-full flex items-center tabular-nums">
      {count}
    </span>
  </button>
);

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
          : `${(box.fLow! / 1000).toFixed(1)}–${(box.fHigh! / 1000).toFixed(1)}`}
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
