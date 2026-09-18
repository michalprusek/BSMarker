import React, { useEffect, useState } from "react";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/solid";
import { recordingService } from "../../services/api";
import { Recording } from "../../types";
import { BUTTON, keepFocus } from "./Toolbar";
import { Tip } from "./Tip";

/** Same order as the project page's default list (newest first). */
const LIST_ORDER = { sort_by: "created_at", sort_order: "desc" } as const;
const PAGE_SIZE = 500;

/** Recording ids per project, loaded once per session. */
const idCache = new Map<number, Promise<number[]>>();

async function fetchAllIds(projectId: number): Promise<number[]> {
  const ids: number[] = [];
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const page = await recordingService.getRecordings(projectId, { ...LIST_ORDER, skip, limit: PAGE_SIZE });
    ids.push(...page.items.map((r) => r.id));
    if (ids.length >= page.pagination.total || page.items.length === 0) return ids;
  }
}

export function projectRecordingIds(projectId: number): Promise<number[]> {
  let ids = idCache.get(projectId);
  if (!ids) {
    ids = fetchAllIds(projectId);
    ids.catch(() => idCache.delete(projectId));
    idCache.set(projectId, ids);
  }
  return ids;
}

export interface Neighbours {
  index: number; // 0-based position in the project, −1 if unknown
  total: number;
  prev: number | null;
  next: number | null;
}

/** Position of a recording in its project and its neighbours. */
export function useNeighbours(recording: Recording | null): Neighbours | null {
  const [neighbours, setNeighbours] = useState<Neighbours | null>(null);
  useEffect(() => {
    setNeighbours(null);
    if (!recording) return;
    let cancelled = false;
    projectRecordingIds(recording.project_id)
      .then((ids) => {
        if (cancelled) return;
        const index = ids.indexOf(recording.id);
        setNeighbours({
          index,
          total: ids.length,
          prev: index > 0 ? ids[index - 1] : null,
          next: index >= 0 && index < ids.length - 1 ? ids[index + 1] : null,
        });
      })
      .catch((error) => console.error("Could not load the project's recordings:", error));
    return () => {
      cancelled = true;
    };
  }, [recording]);
  return neighbours;
}

interface RecordingNavProps {
  recording: Recording;
  neighbours: Neighbours | null;
  onNavigate: (recordingId: number) => void;
  /** Conflicts left in the recording — marking it finished asks first. */
  conflictCount: number;
}

/** "‹ 28 / 1011 ›" and the Finished switch. */
export const RecordingNav: React.FC<RecordingNavProps> = ({ recording, neighbours, onNavigate, conflictCount }) => {
  const [finished, setFinished] = useState(!!recording.is_finished);
  const [busy, setBusy] = useState(false);
  useEffect(() => setFinished(!!recording.is_finished), [recording]);

  const toggleFinished = async () => {
    if (!finished && conflictCount > 0) {
      const plural = conflictCount === 1 ? "conflict" : "conflicts";
      if (!window.confirm(`This recording still has ${conflictCount} ${plural} (F8 shows them). Mark it as finished anyway?`)) return;
    }
    setBusy(true);
    try {
      const updated = await recordingService.toggleFinished(recording.id);
      setFinished(!!updated.is_finished);
    } catch (error) {
      console.error("Could not change the finished state:", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-0.5 text-xs text-gray-600">
      <Tip title="Previous recording" body="Your changes are saved automatically." keys="PgUp">
        <button
          className={BUTTON}
          disabled={!neighbours?.prev}
          onMouseDown={keepFocus}
          onClick={() => neighbours?.prev && onNavigate(neighbours.prev)}
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
      </Tip>
      <Tip title="Position in the project" body="In the order of the project's recording list.">
        <span className="tabular-nums min-w-[4.5rem] text-center">
          {neighbours && neighbours.index >= 0 ? `${neighbours.index + 1} / ${neighbours.total}` : "…"}
        </span>
      </Tip>
      <Tip title="Next recording" body="Your changes are saved automatically." keys="PgDn">
        <button
          className={BUTTON}
          disabled={!neighbours?.next}
          onMouseDown={keepFocus}
          onClick={() => neighbours?.next && onNavigate(neighbours.next)}
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </Tip>
      <Tip
        title={finished ? "Finished" : "Mark as finished"}
        body={
          finished
            ? "This recording is marked as done in the project list. Click to mark it as not finished."
            : "Click when all syllables are annotated — the project list shows it as done."
        }
      >
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={toggleFinished}
          disabled={busy}
          className={`ml-1.5 flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-medium ${
            finished
              ? "bg-green-600 border-green-600 text-white hover:bg-green-700"
              : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          {finished ? (
            <>
              <CheckIcon className="h-3.5 w-3.5" /> Finished
            </>
          ) : (
            "Mark finished"
          )}
        </button>
      </Tip>
    </div>
  );
};
