import { EditorBox } from "../core/boxes";
import { AnnotationDocument } from "./AnnotationDocument";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

/** Save shortly after the user stops editing. */
const DEBOUNCE_MS = 1500;
/** Retry delays after a failed save. */
const RETRY_MS = [2000, 5000, 15000, 30000];
/** After leaving a recording, keep retrying this many times before giving up. */
const BACKGROUND_ATTEMPTS = 6;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Saves the document automatically: debounced after edits, strictly one
 * request at a time (the backend replaces all boxes, so overlapping requests
 * must never happen), and again if the user kept editing meanwhile. Failed
 * saves are retried with back-off. Only committed changes are saved, never
 * a drag in progress.
 */
export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private inFlightSnapshot: EditorBox[] | null = null;
  private failures = 0;
  private status: SaveStatus = "saved";
  private unsubscribe: () => void;
  private detached = false;

  constructor(
    private readonly doc: AnnotationDocument,
    private readonly save: (boxes: EditorBox[]) => Promise<void>,
    private onStatus: (status: SaveStatus) => void,
  ) {
    this.unsubscribe = doc.subscribe((contentChanged) => {
      if (!contentChanged || doc.inTransaction) return;
      if (doc.isDirty) {
        this.setStatus(this.inFlight ? "saving" : "unsaved");
        this.schedule(DEBOUNCE_MS);
      } else if (!this.inFlight) {
        this.setStatus("saved"); // e.g. undo back to the saved state
      }
    });
  }

  /** Is exactly this snapshot being sent right now? (Avoids a duplicate keepalive save.) */
  isSending(snapshot: EditorBox[]): boolean {
    return this.inFlightSnapshot === snapshot;
  }

  /** Save now (Ctrl+S). Resolves when the save attempt finished (successfully or not). */
  async flush(): Promise<void> {
    this.clearTimer();
    // Several callers may be waiting for the same request; only one may start the next.
    while (this.inFlight) await this.inFlight;
    if (!this.doc.isDirty) return;

    const snapshot = this.doc.committed;
    this.setStatus("saving");
    this.inFlightSnapshot = snapshot;
    this.inFlight = this.save(snapshot)
      .then(() => {
        this.failures = 0;
        this.doc.markSaved(snapshot);
        if (this.doc.isDirty) {
          this.setStatus("unsaved");
          this.schedule(DEBOUNCE_MS);
        } else {
          this.setStatus("saved");
        }
      })
      .catch((error) => {
        console.error("Saving annotations failed:", error);
        this.setStatus("error");
        this.schedule(RETRY_MS[Math.min(this.failures, RETRY_MS.length - 1)]);
        this.failures++;
      })
      .finally(() => {
        this.inFlight = null;
        this.inFlightSnapshot = null;
      });
    await this.inFlight;
  }

  /**
   * The editor closed (another recording, another page): stop reporting to
   * the UI and keep trying in the background. Resolves true once everything
   * is saved, false if it finally gave up.
   */
  async detach(): Promise<boolean> {
    this.detached = true;
    this.onStatus = () => undefined;
    this.clearTimer();
    this.unsubscribe();
    for (let attempt = 0; attempt < BACKGROUND_ATTEMPTS; attempt++) {
      await this.flush();
      this.clearTimer(); // we drive the retries ourselves now
      if (!this.doc.isDirty) return true;
      await delay(RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]);
    }
    return false;
  }

  private schedule(ms: number): void {
    this.clearTimer();
    if (this.detached) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private setStatus(status: SaveStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.onStatus(status);
  }
}
