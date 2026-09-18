import { EditorBox } from "../core/boxes";
import { AnnotationDocument } from "./AnnotationDocument";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

/** Save shortly after the user stops editing. */
const DEBOUNCE_MS = 1500;
/** Retry delays after a failed save. */
const RETRY_MS = [2000, 5000, 15000, 30000];

/**
 * Saves the document automatically: debounced after edits, one request at a
 * time, and again if the user kept editing while a save was in flight.
 * Failed saves are retried with back-off and reported through `onStatus`.
 */
export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private failures = 0;
  private status: SaveStatus = "saved";
  private unsubscribe: () => void;
  private destroyed = false;

  constructor(
    private readonly doc: AnnotationDocument,
    private readonly save: (boxes: EditorBox[]) => Promise<void>,
    private readonly onStatus: (status: SaveStatus) => void,
  ) {
    this.unsubscribe = doc.subscribe((contentChanged) => {
      if (!contentChanged) return;
      if (doc.isDirty) {
        this.setStatus(this.inFlight ? "saving" : "unsaved");
        // Don't save half-finished drags; the commit will trigger another change.
        if (!doc.inTransaction) this.schedule(DEBOUNCE_MS);
      } else if (!this.inFlight) {
        this.setStatus("saved"); // e.g. undo back to the saved state
      }
    });
  }

  get currentStatus(): SaveStatus {
    return this.status;
  }

  /** Save now (Ctrl+S, leaving the page). Resolves when everything is stored. */
  async flush(): Promise<void> {
    this.clearTimer();
    if (this.inFlight) await this.inFlight;
    if (!this.doc.isDirty || this.destroyed) return;

    const snapshot = this.doc.boxes;
    this.setStatus("saving");
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
      });
    await this.inFlight;
  }

  destroy(): void {
    this.destroyed = true;
    this.clearTimer();
    this.unsubscribe();
  }

  private schedule(delay: number): void {
    this.clearTimer();
    if (this.destroyed) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
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
