import React from "react";
import toast from "react-hot-toast";
import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import { EditorEngine } from "../EditorEngine";
import { Conflict, MIN_GAP, fixAllGaps, fixGap } from "../edit/conflicts";
import { formatDuration } from "../render/ticks";
import { keepFocus } from "./Toolbar";

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

/** Shown while a box in conflict is selected: what is wrong and how to fix it. */
export const ConflictCard: React.FC<{
  engine: EditorEngine;
  conflict: Conflict;
  total: number;
}> = ({ engine, conflict, total }) => {
  const doc = engine.doc;
  const button = "px-2 py-1 rounded border text-xs font-medium";

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
    <div className="absolute left-1/2 top-[4.5rem] -translate-x-1/2 z-10 bg-white border border-red-200 shadow-lg rounded-lg px-3 py-2 flex items-center gap-3 text-xs">
      <ExclamationTriangleIcon className="h-5 w-5 text-red-600 shrink-0" />
      <span className="text-gray-800">{describe(conflict)}</span>
      {!engine.doc.readOnly && (
        <button
          className={`${button} border-red-300 bg-red-50 text-red-700 hover:bg-red-100`}
          onMouseDown={keepFocus}
          onClick={fix}
          title={
            conflict.kind === "nested"
              ? "Delete the inner box"
              : "Move both edges apart to leave a 12 ms gap"
          }
        >
          {conflict.kind === "nested"
            ? `Delete ${conflict.inner.label}`
            : "Fix gap"}
        </button>
      )}
      {total > 1 && (
        <>
          <button
            className={`${button} border-gray-300 hover:bg-gray-50`}
            onMouseDown={keepFocus}
            onClick={() => engine.focusConflict(1)}
            title="Next conflict (F8)"
          >
            Next ({total})
          </button>
          {!engine.doc.readOnly && (
            <button
              className={`${button} border-gray-300 hover:bg-gray-50`}
              onMouseDown={keepFocus}
              onClick={() => fixAllGapsWithReport(engine)}
              title="Fix every gap/overlap in this recording (one undo step)"
            >
              Fix all gaps
            </button>
          )}
        </>
      )}
    </div>
  );
};
