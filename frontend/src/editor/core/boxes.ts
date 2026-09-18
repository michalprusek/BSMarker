import { BoundingBox } from "../../types";
import { LABEL_COLORS } from "../../utils/constants";

/**
 * An annotation box in physical units only. Pixel coordinates from the
 * legacy API are ignored — they depend on the screen of whoever drew the box.
 */
export interface EditorBox {
  id: string;
  start: number; // s
  end: number; // s
  /** null = the box spans the full frequency range */
  fLow: number | null; // Hz
  fHigh: number | null; // Hz
  label: string;
  colorIndex: number;
}

export const NO_LABEL = "None";

export function fromApiBoxes(apiBoxes: BoundingBox[]): EditorBox[] {
  const sorted = apiBoxes
    .filter((b) => Number.isFinite(b.start_time) && Number.isFinite(b.end_time) && b.end_time > b.start_time)
    .sort((a, b) => a.start_time - b.start_time);

  const colors = new Map<string, number>([[NO_LABEL, 0]]);
  return sorted.map((b, i) => {
    const label = b.label || NO_LABEL;
    if (!colors.has(label)) colors.set(label, 1 + ((colors.size - 1) % (LABEL_COLORS.length - 1)));
    return {
      id: b.id !== undefined ? String(b.id) : `new-${i}`,
      start: b.start_time,
      end: b.end_time,
      fLow: b.min_frequency ?? null,
      fHigh: b.max_frequency ?? null,
      label,
      colorIndex: colors.get(label)!,
    };
  });
}

/**
 * Boxes sorted by start time with fast lookup of the ones overlapping a time
 * range (binary search + the longest box duration as look-back window).
 */
export class BoxIndex {
  private readonly maxDuration: number;

  constructor(readonly boxes: EditorBox[]) {
    this.maxDuration = boxes.reduce((m, b) => Math.max(m, b.end - b.start), 0);
  }

  /** Calls `fn` for every box overlapping [t0, t1], in start-time order. */
  forEachInRange(t0: number, t1: number, fn: (box: EditorBox, index: number) => void): void {
    const boxes = this.boxes;
    let lo = 0;
    let hi = boxes.length;
    const from = t0 - this.maxDuration;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (boxes[mid].start < from) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < boxes.length && boxes[i].start <= t1; i++) {
      if (boxes[i].end >= t0) fn(boxes[i], i);
    }
  }

  /** Topmost (latest-starting, shortest) box containing the point; `freq` null ignores frequency. */
  hitTest(time: number, freq: number | null, timeTolerance = 0): EditorBox | null {
    let best: EditorBox | null = null;
    this.forEachInRange(time - timeTolerance, time + timeTolerance, (box) => {
      if (freq !== null && box.fLow !== null && box.fHigh !== null) {
        if (freq < box.fLow || freq > box.fHigh) return;
      }
      if (!best || box.end - box.start < best.end - best.start) best = box;
    });
    return best;
  }

  indexOf(id: string): number {
    return this.boxes.findIndex((b) => b.id === id);
  }
}
