import { EditorBox, isTimeSegment } from "../core/boxes";
import { AnnotationDocument } from "./AnnotationDocument";

/**
 * Moves boxes by (dt, df), clamped as a group so that no box leaves the
 * recording (0…duration, 0…nyquist) and relative positions are preserved.
 * Time segments only move in time.
 */
export function moveBoxes(
  boxes: EditorBox[],
  dt: number,
  df: number,
  duration: number,
  nyquist: number,
): Map<string, EditorBox> {
  const minStart = Math.min(...boxes.map((b) => b.start));
  const maxEnd = Math.max(...boxes.map((b) => b.end));
  const t = clampDelta(dt, -minStart, duration - maxEnd);

  const banded = boxes.filter((b) => !isTimeSegment(b));
  let f = df;
  if (banded.length > 0) {
    const minLow = Math.min(...banded.map((b) => b.fLow!));
    const maxHigh = Math.max(...banded.map((b) => b.fHigh!));
    f = clampDelta(df, -minLow, nyquist - maxHigh);
  }

  const moved = new Map<string, EditorBox>();
  for (const b of boxes) {
    moved.set(b.id, {
      ...b,
      start: b.start + t,
      end: b.end + t,
      fLow: b.fLow === null || isTimeSegment(b) ? b.fLow : b.fLow + f,
      fHigh: b.fHigh === null || isTimeSegment(b) ? b.fHigh : b.fHigh + f,
    });
  }
  return moved;
}

/**
 * Clamp a move so boxes don't leave the allowed range — but never push boxes
 * that are already outside it (old data has some) along an axis the user is
 * not moving: a zero delta always stays zero.
 */
function clampDelta(delta: number, min: number, max: number): number {
  return Math.min(Math.max(0, max), Math.max(Math.min(0, min), delta));
}

/** Clipboard and keyboard edit commands on the current selection. */
export class EditActions {
  private clipboard: EditorBox[] = [];

  constructor(
    private readonly doc: AnnotationDocument,
    private readonly duration: number,
    private readonly nyquist: number,
  ) {}

  deleteSelection(): void {
    this.doc.remove(this.doc.selectedIds);
  }

  selectAll(): void {
    this.doc.select(this.doc.boxes.map((b) => b.id));
  }

  copy(): void {
    this.clipboard = this.doc.selection;
  }

  cut(): void {
    this.copy();
    this.deleteSelection();
  }

  /** Paste so the earliest copied box starts at `time`, keeping relative layout. */
  paste(time: number): void {
    if (this.clipboard.length === 0) return;
    const start = Math.min(...this.clipboard.map((b) => b.start));
    this.addShifted(this.clipboard, time - start);
  }

  /** Duplicate the selection right after itself on the time axis. */
  duplicate(): void {
    const selection = this.doc.selection;
    if (selection.length === 0) return;
    const start = Math.min(...selection.map((b) => b.start));
    const end = Math.max(...selection.map((b) => b.end));
    this.addShifted(selection, end - start);
  }

  /** Nudge the selection by a time/frequency delta (arrow keys). */
  nudge(dt: number, df: number): void {
    const selection = this.doc.selection;
    if (selection.length === 0) return;
    const moved = moveBoxes(selection, dt, df, this.duration, this.nyquist);
    this.doc.update(moved.keys(), (b) => moved.get(b.id)!);
  }

  setLabel(label: string): void {
    const trimmed = label.trim();
    if (!trimmed) return;
    this.doc.setLabel(this.doc.selectedIds, trimmed);
  }

  private addShifted(boxes: EditorBox[], dt: number): void {
    const moved = moveBoxes(boxes, dt, 0, this.duration, this.nyquist);
    this.doc.addCopies(Array.from(moved.values()));
  }
}
