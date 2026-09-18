import React from "react";
import toast from "react-hot-toast";
import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import { EditorEngine } from "../EditorEngine";
import { Conflict, MIN_GAP, fixAllGaps, fixGap } from "../edit/conflicts";
import { formatDuration } from "../render/ticks";
import { keepFocus } from "./Toolbar";
import { Tip } from "./Tip";

const describe = (c: Conflict): string => {
  if (c.kind === "nested")
    return `Box ${c.inner.label} lies inside box ${c.outer.label}.`;
  const gap = c.b.start - c.a.end;
  const minimum = `${MIN_GAP * 1000} ms`;
  if (gap < -0.0005)
    return `Boxes ${c.a.label} and ${c.b.label} overlap by ${formatDuration(-gap)}.`;
  if (gap < 0.0005)
    return `Boxes ${c.a.label} and ${c.b.label} touch — they need a gap of at least ${minimum}.`;
  return `Only ${formatDuration(gap)} between ${c.a.label} and ${c.b.label} (minimum ${minimum}).`;
};

/** Fix every gap in one undo step and tell the user what happened. */
export function fixAllGapsWithReport(engine: EditorEngine): void {
  const { fixed, remaining } = fixAllGaps(engine.doc);
  toast.success(
    `Fixed ${fixed} gap${fixed === 1 ? "" : "s"}.` +
      (remaining
        ? ` ${remaining} conflict${remaining === 1 ? "" : "s"} need your decision.`
        : "") +
      " Ctrl+Z to undo.",
  );
}

/**
 * Shown in the status bar while a box in conflict is selected: what is wrong
 * and how to fix it. Lives there rather than over the plot so it never hides
 * the spectrogram.
 */
export const ConflictNotice: React.FC<{
  engine: EditorEngine;
  conflict: Conflict;
  total: number;
}> = ({ engine, conflict, total }) => {
  const doc = engine.doc;
  const button = "px-2 py-0.5 rounded border text-xs font-medium";

  const fix = () => {
    if (conflict.kind === "nested") {
      doc.remove([conflict.inner.id]);
      return;
    }
    if (!fixGap(doc, conflict))
      toast.error(
        "Can't fix automatically — a box would become too short. Adjust the edges by hand.",
      );
  };

  return (
    <div className="flex items-center gap-2 h-6 pl-2 pr-1 rounded bg-red-50 border border-red-200 min-w-0">
      <ExclamationTriangleIcon className="h-4 w-4 text-red-600 shrink-0" />
      <span className="text-gray-800 truncate">{describe(conflict)}</span>
      {!doc.readOnly && (
        <Tip
          title={
            conflict.kind === "nested"
              ? `Delete box ${conflict.inner.label}`
              : "Fix gap"
          }
          body={
            conflict.kind === "nested"
              ? "Removes the inner box. Ctrl+Z brings it back."
              : "Moves both edges apart to leave a 12 ms gap. Ctrl+Z undoes it."
          }
        >
          <button
            className={`${button} border-red-300 bg-white text-red-700 hover:bg-red-100`}
            onMouseDown={keepFocus}
            onClick={fix}
          >
            {conflict.kind === "nested"
              ? `Delete ${conflict.inner.label}`
              : "Fix gap"}
          </button>
        </Tip>
      )}
      {total > 1 && (
        <Tip
          title="Next conflict"
          body={`${total} conflicts in this recording.`}
          keys="F8"
        >
          <button
            className={`${button} border-gray-300 bg-white hover:bg-gray-50`}
            onMouseDown={keepFocus}
            onClick={() => engine.focusConflict(1)}
          >
            Next ({total})
          </button>
        </Tip>
      )}
      {total > 1 && !doc.readOnly && (
        <Tip
          title="Fix all gaps"
          body="Moves box edges apart so every pair keeps a 12 ms gap. Nested boxes are left for you. One Ctrl+Z undoes it all."
        >
          <button
            className={`${button} border-gray-300 bg-white hover:bg-gray-50`}
            onMouseDown={keepFocus}
            onClick={() => fixAllGapsWithReport(engine)}
          >
            Fix all
          </button>
        </Tip>
      )}
    </div>
  );
};
