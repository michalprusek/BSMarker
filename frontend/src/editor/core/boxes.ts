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
  /** null = the box spans the full frequency range (a time segment) */
  fLow: number | null; // Hz
  fHigh: number | null; // Hz
  label: string;
  /** Passed through unchanged so saving never drops them. */
  confidence: number | null;
  extraMetadata: Record<string, unknown> | null;
}

export const NO_LABEL = "None";

/**
 * Stable colour per label: letters A–Z (the syllable-type convention used
 * in this project) cycle through the palette in alphabetical order, so the
 * same letter has the same colour in every recording.
 */
export function colorIndexForLabel(label: string): number {
  if (!label || label === NO_LABEL) return 0;
  const slots = LABEL_COLORS.length - 1;
  if (/^[A-Z]$/.test(label)) return 1 + ((label.charCodeAt(0) - 65) % slots);
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  return 1 + (hash % slots);
}

export const isTimeSegment = (box: EditorBox): boolean => box.fLow === null || box.fHigh === null;

export const byStart = (a: EditorBox, b: EditorBox): number => a.start - b.start || a.end - b.end;

/** Same boxes (ignoring ids)? Used to tell whether a local backup adds anything. */
export function sameContent(a: EditorBox[], b: EditorBox[]): boolean {
  const key = (x: EditorBox) => [x.start, x.end, x.fLow, x.fHigh, x.label].join("|");
  const ka = a.map(key).sort();
  const kb = b.map(key).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

/** Boxes as the API returns them (or as we send them, e.g. from a local backup). */
type ApiBoxLike = Pick<BoundingBox, "id" | "start_time" | "end_time" | "label"> & {
  min_frequency?: number | null;
  max_frequency?: number | null;
  confidence?: number | null;
  extra_metadata?: Record<string, unknown> | null;
  metadata?: unknown;
};

export function fromApiBoxes(apiBoxes: ApiBoxLike[]): EditorBox[] {
  return apiBoxes
    .filter((b) => Number.isFinite(b.start_time) && Number.isFinite(b.end_time) && b.end_time > b.start_time)
    .map((b, i) => ({
      id: b.id !== undefined ? String(b.id) : `api-${i}`,
      start: b.start_time,
      end: b.end_time,
      fLow: b.min_frequency ?? null,
      fHigh: b.max_frequency ?? null,
      label: b.label || NO_LABEL,
      confidence: b.confidence ?? null,
      extraMetadata: b.extra_metadata ?? (b.metadata as Record<string, unknown> | null | undefined) ?? null,
    }))
    .sort(byStart);
}

/**
 * Legacy pixel fields are still required by the API. They are written in a
 * fixed reference frame (whole recording = 1000 px wide, 0 Hz–Nyquist = 400 px
 * high) so they are at least deterministic; time and frequency are authoritative.
 */
const LEGACY_WIDTH = 1000;
const LEGACY_HEIGHT = 400;

export interface ApiBoxPayload {
  x: number;
  y: number;
  width: number;
  height: number;
  start_time: number;
  end_time: number;
  min_frequency: number | null;
  max_frequency: number | null;
  label: string;
  confidence: number | null;
  extra_metadata: Record<string, unknown> | null;
}

export function toApiBoxes(boxes: EditorBox[], duration: number, nyquist: number): ApiBoxPayload[] {
  const px = (t: number) => (t / duration) * LEGACY_WIDTH;
  const py = (f: number) => (1 - f / nyquist) * LEGACY_HEIGHT;
  return boxes.map((b) => {
    const fLow = b.fLow ?? 0;
    const fHigh = b.fHigh ?? nyquist;
    return {
      x: px(b.start),
      y: py(fHigh),
      width: px(b.end) - px(b.start),
      height: py(fLow) - py(fHigh),
      start_time: b.start,
      end_time: b.end,
      min_frequency: b.fLow,
      max_frequency: b.fHigh,
      label: b.label,
      confidence: b.confidence,
      extra_metadata: b.extraMetadata,
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

  indexOf(id: string): number {
    return this.boxes.findIndex((b) => b.id === id);
  }
}
