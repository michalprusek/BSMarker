import React, { useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/solid";
import { recordingService } from "../../services/api";
import { Recording } from "../../types";
import { BUTTON, keepFocus } from "./Toolbar";

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
}

/** "‹ 28 / 1011 ›" and the Finished switch. */
export const RecordingNav: React.FC<RecordingNavProps> = ({ recording, neighbours, onNavigate }) => {
  const [finished, setFinished] = useState(!!recording.is_finished);
  const [busy, setBusy] = useState(false);
  useEffect(() => setFinished(!!recording.is_finished), [recording]);

  const toggleFinished = async () => {
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
    <div className="flex items-center gap-1 text-xs text-gray-600">
      <button
        className={BUTTON}
        disabled={!neighbours?.prev}
        onMouseDown={keepFocus}
        onClick={() => neighbours?.prev && onNavigate(neighbours.prev)}
        title="Previous recording (Page Up)"
      >
        <ChevronLeftIcon className="h-4 w-4" />
      </button>
      <span className="tabular-nums w-20 text-center">
        {neighbours && neighbours.index >= 0 ? `${neighbours.index + 1} / ${neighbours.total}` : "…"}
      </span>
      <button
        className={BUTTON}
        disabled={!neighbours?.next}
        onMouseDown={keepFocus}
        onClick={() => neighbours?.next && onNavigate(neighbours.next)}
        title="Next recording (Page Down)"
      >
        <ChevronRightIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onMouseDown={keepFocus}
        onClick={toggleFinished}
        disabled={busy}
        className={`ml-2 px-2 py-1 rounded-full border text-xs font-medium ${
          finished ? "bg-green-100 border-green-300 text-green-800" : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
        }`}
        title="Mark this recording as finished"
      >
        {finished ? "✓ Finished" : "Mark finished"}
      </button>
    </div>
  );
};
