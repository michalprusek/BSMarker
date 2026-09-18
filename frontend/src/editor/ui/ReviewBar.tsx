import React from "react";
import {
  ArrowPathIcon,
  BackwardIcon,
  CheckCircleIcon,
  ForwardIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import {
  CONTEXT_CHOICES,
  ReviewSession,
  ReviewState,
} from "../review/ReviewSession";
import { formatDuration, formatTime } from "../render/ticks";
import { LabelChip } from "./LabelChip";
import { keepFocus } from "./Toolbar";

const BUTTON =
  "flex items-center gap-1 px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 text-xs";

/** Shown during a listen-through review: where we are and what the keys do. */
export const ReviewBar: React.FC<{
  session: ReviewSession;
  state: ReviewState;
}> = ({ session, state }) => {
  const box = state.current;
  return (
    <div className="absolute left-1/2 top-[4.5rem] -translate-x-1/2 z-10 bg-white border border-blue-200 shadow-lg rounded-lg px-3 py-2 flex items-center gap-3 text-xs whitespace-nowrap">
      <span className="font-semibold text-blue-700 tabular-nums">
        Review {state.index + 1} / {state.total}
      </span>
      {state.label !== null && (
        <span className="flex items-center gap-1 text-gray-500">
          only <LabelChip label={state.label} />
        </span>
      )}
      {box ? (
        <span className="flex items-center gap-1.5 tabular-nums text-gray-700">
          <LabelChip label={box.label} title="Press a letter to relabel" />
          {formatTime(box.start, 0.001)} · {formatDuration(box.end - box.start)}
        </span>
      ) : (
        <span className="text-gray-400">box deleted</span>
      )}

      <div className="h-5 w-px bg-gray-200" />
      <button
        className={BUTTON}
        onMouseDown={keepFocus}
        onClick={() => session.previous()}
        title="Previous box (Shift+Space)"
      >
        <BackwardIcon className="h-3.5 w-3.5" />
      </button>
      <button
        className={`${BUTTON} border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100`}
        onMouseDown={keepFocus}
        onClick={() => session.next()}
        title="Next box (Space)"
      >
        <ForwardIcon className="h-3.5 w-3.5" /> Next{" "}
        <kbd className="text-[10px] text-blue-400">Space</kbd>
      </button>
      <button
        className={BUTTON}
        onMouseDown={keepFocus}
        onClick={() => session.replay()}
        title="Play this box again (Enter)"
      >
        <ArrowPathIcon className="h-3.5 w-3.5" /> Replay{" "}
        <kbd className="text-[10px] text-gray-400">Enter</kbd>
      </button>

      <label
        className="flex items-center gap-1 text-gray-600"
        title="Audio played before and after each box, to hear whether a syllable is cut off"
      >
        context
        <select
          className="border border-gray-300 rounded px-1 py-0.5 bg-white"
          value={state.context}
          onChange={(e) => session.setContext(Number(e.target.value))}
        >
          {CONTEXT_CHOICES.map((c) => (
            <option key={c} value={c}>
              {c === 0 ? "none" : `${c * 1000} ms`}
            </option>
          ))}
        </select>
      </label>
      <label
        className="flex items-center gap-1 text-gray-600"
        title="Go on to the next box automatically after a short pause"
      >
        <input
          type="checkbox"
          checked={state.autoAdvance}
          onChange={(e) => session.setAutoAdvance(e.target.checked)}
        />
        auto
      </label>
      <button
        className="p-1 rounded hover:bg-gray-100"
        onMouseDown={keepFocus}
        onClick={() => session.end()}
        title="End review (Esc)"
      >
        <XMarkIcon className="h-4 w-4 text-gray-500" />
      </button>
    </div>
  );
};

/** Shown after the last box. */
export const ReviewSummaryCard: React.FC<{
  session: ReviewSession;
  state: ReviewState;
}> = ({ session, state }) => {
  const s = state.summary!;
  return (
    <div className="absolute left-1/2 top-[4.5rem] -translate-x-1/2 z-10 bg-white border border-green-200 shadow-lg rounded-lg px-4 py-2 flex items-center gap-3 text-xs whitespace-nowrap">
      <CheckCircleIcon className="h-5 w-5 text-green-600" />
      <span className="text-gray-800">
        Review finished: <b>{s.reviewed}</b> boxes · {s.changed} changed ·{" "}
        {s.deleted} deleted
      </span>
      <button
        className={BUTTON}
        onMouseDown={keepFocus}
        onClick={() => session.dismissSummary()}
      >
        Done
      </button>
    </div>
  );
};
