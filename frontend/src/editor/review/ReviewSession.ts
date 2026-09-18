import { EditorBox } from "../core/boxes";
import { AnnotationDocument } from "../edit/AnnotationDocument";

/** What a review needs from the editor (kept small so it can be tested without a browser). */
export interface ReviewHost {
  readonly doc: AnnotationDocument;
  readonly duration: number;
  /** Play [start, end) once. */
  play(start: number, end: number): void;
  stop(): void;
  isPlaying(): boolean;
  /** Bring a time range into view. */
  focus(start: number, end: number): void;
  /** Called on playback state changes; returns an unsubscribe function. */
  onPlaybackChange(listener: () => void): () => void;
}

export interface ReviewState {
  active: boolean;
  /** 0-based position of the current box; −1 before the first one. */
  index: number;
  total: number;
  /** The box being reviewed (null if it was deleted). */
  current: EditorBox | null;
  /** Label the review is limited to, or null for all boxes. */
  label: string | null;
  autoAdvance: boolean;
  /** Seconds of audio played before and after each box. */
  context: number;
  /** Set when the review has gone through every box. */
  summary: ReviewSummary | null;
}

export interface ReviewSummary {
  reviewed: number;
  changed: number;
  deleted: number;
}

/** Pause between boxes when advancing automatically (s). */
const AUTO_ADVANCE_PAUSE_MS = 600;
export const CONTEXT_CHOICES = [0, 0.15, 0.3, 0.5];

const sameBox = (a: EditorBox, b: EditorBox) =>
  a.start === b.start &&
  a.end === b.end &&
  a.fLow === b.fLow &&
  a.fHigh === b.fHigh &&
  a.label === b.label;

/**
 * Listen-through review: goes box by box, plays each one with a little
 * context before and after, and stops — Space goes on to the next box.
 * Editing works as usual meanwhile; the summary counts what changed.
 */
export class ReviewSession {
  private ids: string[] = [];
  private originals = new Map<string, EditorBox>();
  private state: ReviewState = {
    active: false,
    index: -1,
    total: 0,
    current: null,
    label: null,
    autoAdvance: false,
    context: 0.15,
    summary: null,
  };
  private listeners = new Set<() => void>();
  /** Playback of the current box: requested → started → (ended). */
  private playback: "idle" | "requested" | "started" = "idle";
  private advanceTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribePlayback: () => void;
  private unsubscribeDoc: () => void;

  constructor(private readonly host: ReviewHost) {
    this.unsubscribePlayback = host.onPlaybackChange(this.handlePlayback);
    // Relabelling or resizing the current box should show up in the bar.
    this.unsubscribeDoc = host.doc.subscribe(() => {
      if (this.state.active) this.update({ current: this.currentBox() });
    });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): ReviewState => this.state;

  /** Review `boxes` (in the given order), optionally described as one label. */
  start(boxes: EditorBox[], label: string | null = null): void {
    if (boxes.length === 0) return;
    this.clearTimer();
    this.ids = boxes.map((b) => b.id);
    this.originals = new Map(boxes.map((b) => [b.id, b]));
    this.update({
      active: true,
      index: -1,
      total: boxes.length,
      current: null,
      label,
      summary: null,
    });
    this.next();
  }

  /** Go to the next box and play it; after the last one, show the summary. */
  next(): void {
    this.step(1);
  }

  previous(): void {
    this.step(-1);
  }

  /** Play the current box again. */
  replay(): void {
    const box = this.currentBox();
    if (box) this.playBox(box);
  }

  setAutoAdvance(autoAdvance: boolean): void {
    this.update({ autoAdvance });
  }

  setContext(context: number): void {
    this.update({ context });
  }

  /** Leave the review (Esc). */
  end(): void {
    this.clearTimer();
    if (this.playback !== "idle") this.host.stop();
    this.playback = "idle";
    this.update({ active: false, current: null, summary: null });
  }

  /** Close the summary shown after the last box. */
  dismissSummary(): void {
    this.update({ summary: null });
  }

  destroy(): void {
    this.clearTimer();
    this.unsubscribePlayback();
    this.unsubscribeDoc();
    this.listeners.clear();
  }

  // --------------------------------------------------------------- internals

  private step(direction: 1 | -1): void {
    if (!this.state.active) return;
    this.clearTimer();
    let index = this.state.index;
    // Skip boxes deleted since the review started.
    do index += direction;
    while (
      index >= 0 &&
      index < this.ids.length &&
      !this.boxById(this.ids[index])
    );

    if (index >= this.ids.length) {
      this.finish();
      return;
    }
    if (index < 0) return; // already at the first box
    const box = this.boxById(this.ids[index])!;
    this.update({ index, current: box });
    this.host.doc.select([box.id]);
    const pad = this.state.context;
    this.host.focus(box.start - pad, box.end + pad);
    this.playBox(box);
  }

  private playBox(box: EditorBox): void {
    this.clearTimer();
    const pad = this.state.context;
    this.playback = "requested";
    this.host.play(
      Math.max(0, box.start - pad),
      Math.min(this.host.duration, box.end + pad),
    );
  }

  private handlePlayback = (): void => {
    const playing = this.host.isPlaying();
    if (this.playback === "requested" && playing) this.playback = "started";
    // Only a playback that actually ran can "finish" (audio may still be starting up).
    if (this.playback !== "started" || playing) return;
    this.playback = "idle";
    if (this.state.active && this.state.autoAdvance) {
      this.advanceTimer = setTimeout(() => this.next(), AUTO_ADVANCE_PAUSE_MS);
    }
  };

  private finish(): void {
    let changed = 0;
    let deleted = 0;
    this.originals.forEach((original, id) => {
      const now = this.boxById(id);
      if (!now) deleted++;
      else if (!sameBox(original, now)) changed++;
    });
    this.playback = "idle";
    this.update({
      active: false,
      current: null,
      summary: { reviewed: this.ids.length, changed, deleted },
    });
  }

  private currentBox(): EditorBox | null {
    const id = this.ids[this.state.index];
    return id ? this.boxById(id) : null;
  }

  private boxById(id: string): EditorBox | null {
    return this.host.doc.boxes.find((b) => b.id === id) ?? null;
  }

  private clearTimer(): void {
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
  }

  private update(patch: Partial<ReviewState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
}
