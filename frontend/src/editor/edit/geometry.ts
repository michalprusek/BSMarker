import { Viewport } from "../core/Viewport";
import { BoxIndex, EditorBox, isTimeSegment } from "../core/boxes";
import { FIX_GAP } from "./conflicts";

/** Distance (CSS px) within which an edge or corner can be grabbed. */
export const GRAB_PX = 5;
/** Distance (CSS px) within which a dragged edge snaps to another box edge. */
export const SNAP_PX = 6;

/** Which edges a resize moves: w/e = start/end time, n/s = top/bottom frequency. */
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type Hit =
  | { kind: "handle"; box: EditorBox; handle: Handle }
  | { kind: "body"; box: EditorBox }
  | null;

export interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Screen rectangle of a box on the spectrogram (time segments span the full height). */
export function boxRect(view: Viewport, box: EditorBox): Rect {
  return {
    x0: view.timeToX(box.start),
    x1: view.timeToX(box.end),
    y0: box.fHigh === null ? 0 : view.freqToY(box.fHigh),
    y1: box.fLow === null ? view.height : view.freqToY(box.fLow),
  };
}

/**
 * What is under the pointer. `timeOnly` is used for the time lane and the
 * waveform, where only the time extent of boxes matters.
 *
 * Priority: selected boxes before others (so you can always grab what you
 * see highlighted), then handles before bodies, then the smallest box.
 */
export function hitTest(
  view: Viewport,
  index: BoxIndex,
  selected: ReadonlySet<string>,
  x: number,
  y: number,
  timeOnly: boolean,
): Hit {
  let best: Hit = null;
  let bestScore = Infinity;
  const tol = GRAB_PX / view.pxPerSec;

  index.forEachInRange(view.xToTime(x) - tol, view.xToTime(x) + tol, (box) => {
    const r = timeOnly ? { ...boxRect(view, box), y0: -Infinity, y1: Infinity } : boxRect(view, box);
    if (y < r.y0 - GRAB_PX || y > r.y1 + GRAB_PX) return;

    const handle = handleAt(r, x, y, !timeOnly && !isTimeSegment(box));
    const inside = x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
    if (!handle && !inside) return;

    // Lower score wins.
    const area = Math.max(1, (r.x1 - r.x0) * Math.min(1e6, r.y1 - r.y0));
    const score = (selected.has(box.id) ? 0 : 2e12) + (handle ? 0 : 1e12) + area;
    if (score < bestScore) {
      bestScore = score;
      best = handle ? { kind: "handle", box, handle } : { kind: "body", box };
    }
  });
  return best;
}

function handleAt(r: Rect, x: number, y: number, vertical: boolean): Handle | null {
  const w = Math.abs(x - r.x0) <= GRAB_PX;
  const e = Math.abs(x - r.x1) <= GRAB_PX;
  const n = vertical && Math.abs(y - r.y0) <= GRAB_PX;
  const s = vertical && Math.abs(y - r.y1) <= GRAB_PX;
  const withinX = x >= r.x0 - GRAB_PX && x <= r.x1 + GRAB_PX;
  const withinY = y >= r.y0 - GRAB_PX && y <= r.y1 + GRAB_PX;
  // Very narrow boxes: prefer the edge the pointer is closer to.
  const west = w && (!e || Math.abs(x - r.x0) < Math.abs(x - r.x1));
  const east = e && !west;
  if (n && west) return "nw";
  if (n && east) return "ne";
  if (s && west) return "sw";
  if (s && east) return "se";
  if (west && withinY) return "w";
  if (east && withinY) return "e";
  if (n && withinX) return "n";
  if (s && withinX) return "s";
  return null;
}

export const CURSOR_FOR_HANDLE: Record<Handle, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

/** Which edge of a box is being placed: its start, its end, or not known yet. */
export type EdgeSide = "start" | "end" | "any";

/**
 * Snaps an edge near a neighbouring box to the closest *valid* position:
 * a start edge goes FIX_GAP after the neighbour's end, an end edge FIX_GAP
 * before the neighbour's start — so snapping never creates a conflict.
 * Returns the (possibly unchanged) time and the neighbour edge to highlight.
 */
export function snapTime(
  view: Viewport,
  index: BoxIndex,
  t: number,
  exclude: ReadonlySet<string>,
  side: EdgeSide = "any",
): { time: number; guide: number | null } {
  const tol = SNAP_PX / view.pxPerSec;
  let best: { time: number; guide: number } | null = null;
  const consider = (time: number, guide: number) => {
    if (Math.abs(time - t) <= tol && (!best || Math.abs(time - t) < Math.abs(best.time - t))) best = { time, guide };
  };
  index.forEachInRange(t - tol - FIX_GAP, t + tol + FIX_GAP, (box) => {
    if (exclude.has(box.id)) return;
    if (side !== "end") consider(box.end + FIX_GAP, box.end);
    if (side !== "start") consider(box.start - FIX_GAP, box.start);
  });
  const found = best as { time: number; guide: number } | null;
  return found ? found : { time: t, guide: null };
}
