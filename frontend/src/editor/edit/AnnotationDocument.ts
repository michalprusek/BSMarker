import { EditorBox, NO_LABEL, byStart } from "../core/boxes";

export type BoxGeometry = Pick<EditorBox, "start" | "end" | "fLow" | "fHigh">;

const MAX_UNDO = 200;

export type SelectMode = "replace" | "add" | "toggle";

/**
 * The editable annotation state: boxes, selection, undo history and the
 * label given to newly drawn boxes.
 *
 * Box lists are immutable snapshots — every edit produces a new sorted array.
 * That makes undo/redo a matter of swapping arrays, and "unsaved changes" a
 * reference comparison with the last saved snapshot.
 *
 * Continuous gestures (move/resize) run inside a transaction: the live
 * updates are not recorded, and `commit()` adds a single undo step.
 */
export class AnnotationDocument {
  private boxesValue: EditorBox[];
  private selected = new Set<string>();
  private undoStack: EditorBox[][] = [];
  private redoStack: EditorBox[][] = [];
  private savedBoxes: EditorBox[];
  private txBase: EditorBox[] | null = null;
  private nextId = 1;
  private listeners = new Set<(contentChanged: boolean) => void>();

  /** Label assigned to newly drawn boxes (the last label the user chose). */
  activeLabel = NO_LABEL;

  /**
   * @param readOnly no edits at all (e.g. no permission to save) — every
   *   editing method becomes a no-op, whatever part of the UI calls it.
   */
  constructor(boxes: EditorBox[], readonly readOnly = false) {
    this.boxesValue = [...boxes].sort(byStart);
    this.savedBoxes = this.boxesValue;
  }

  // ------------------------------------------------------------------ reading

  get boxes(): EditorBox[] {
    return this.boxesValue;
  }

  get selectedIds(): ReadonlySet<string> {
    return this.selected;
  }

  get selection(): EditorBox[] {
    return this.boxesValue.filter((b) => this.selected.has(b.id));
  }

  isSelected(id: string): boolean {
    return this.selected.has(id);
  }

  /**
   * The boxes without the gesture in progress — what may be saved. A half
   * finished drag is never persisted, even if the page is left mid-drag.
   */
  get committed(): EditorBox[] {
    return this.txBase ?? this.boxesValue;
  }

  /** Committed changes that are not on the server yet. */
  get isDirty(): boolean {
    return this.committed !== this.savedBoxes;
  }

  /** Replace everything (e.g. restoring a local backup); one undo step. */
  replaceAll(boxes: EditorBox[]): void {
    if (this.readOnly) return;
    this.setBoxes([...boxes]);
    this.pruneSelection();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0 && !this.txBase;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0 && !this.txBase;
  }

  get inTransaction(): boolean {
    return this.txBase !== null;
  }

  subscribe(listener: (contentChanged: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------------------------------------------------------------- selection

  select(ids: string[], mode: SelectMode = "replace"): void {
    const next = mode === "replace" ? new Set<string>() : new Set(this.selected);
    for (const id of ids) {
      if (mode === "toggle" && next.has(id)) next.delete(id);
      else next.add(id);
    }
    if (sameSet(next, this.selected)) return;
    this.selected = next;
    this.emit(false);
  }

  clearSelection(): void {
    this.select([]);
  }

  setActiveLabel(label: string): void {
    if (this.readOnly || this.activeLabel === label) return;
    this.activeLabel = label;
    this.emit(false);
  }

  // ------------------------------------------------------------------ editing

  /** Adds a box with the active label and selects it. Returns its id. */
  add(geometry: BoxGeometry, label = this.activeLabel): string | null {
    if (this.readOnly) return null;
    const id = this.newId();
    this.setBoxes([...this.boxesValue, { ...geometry, id, label, confidence: null, extraMetadata: null }]);
    this.selected = new Set([id]);
    this.emit(false);
    return id;
  }

  /** Adds copies of boxes (new ids) and selects them. */
  addCopies(boxes: EditorBox[]): string[] {
    if (this.readOnly) return [];
    const copies = boxes.map((b) => ({ ...b, id: this.newId() }));
    this.setBoxes([...this.boxesValue, ...copies]);
    this.selected = new Set(copies.map((b) => b.id));
    this.emit(false);
    return copies.map((b) => b.id);
  }

  /** Replaces the given boxes with `fn(box)`. */
  update(ids: Iterable<string>, fn: (box: EditorBox) => EditorBox): void {
    if (this.readOnly) return;
    const set = new Set(ids);
    let changed = false;
    const next = this.boxesValue.map((b) => {
      if (!set.has(b.id)) return b;
      const updated = fn(b);
      if (updated !== b) changed = true;
      return updated;
    });
    if (changed) this.setBoxes(next);
  }

  remove(ids: Iterable<string>): void {
    if (this.readOnly) return;
    const set = new Set(ids);
    if (set.size === 0) return;
    this.setBoxes(this.boxesValue.filter((b) => !set.has(b.id)));
    let selectionChanged = false;
    set.forEach((id) => {
      selectionChanged = this.selected.delete(id) || selectionChanged;
    });
    if (selectionChanged) this.emit(false);
  }

  setLabel(ids: Iterable<string>, label: string): void {
    this.update(ids, (b) => (b.label === label ? b : { ...b, label }));
    this.setActiveLabel(label);
  }

  // ------------------------------------------------------------- transactions

  begin(): void {
    if (!this.txBase) this.txBase = this.boxesValue;
  }

  commit(): void {
    if (!this.txBase) return;
    const base = this.txBase;
    this.txBase = null;
    const changed = base !== this.boxesValue;
    if (changed) this.pushUndo(base);
    // Content listeners (autosave) skip live transaction updates, so report the result now.
    this.emit(changed);
  }

  /** Reverts everything done since `begin()` (e.g. Esc during a drag). */
  cancel(): void {
    if (!this.txBase) return;
    this.boxesValue = this.txBase;
    this.txBase = null;
    this.emit(true);
  }

  undo(): void {
    if (!this.canUndo) return;
    this.redoStack.push(this.boxesValue);
    this.boxesValue = this.undoStack.pop()!;
    this.pruneSelection();
    this.emit(true);
  }

  redo(): void {
    if (!this.canRedo) return;
    this.undoStack.push(this.boxesValue);
    this.boxesValue = this.redoStack.pop()!;
    this.pruneSelection();
    this.emit(true);
  }

  /** Called by the autosaver once `snapshot` is stored on the server. */
  markSaved(snapshot: EditorBox[]): void {
    this.savedBoxes = snapshot;
    this.emit(false);
  }

  // ---------------------------------------------------------------- internals

  private setBoxes(next: EditorBox[]): void {
    const sorted = next.sort(byStart);
    if (!this.txBase) this.pushUndo(this.boxesValue);
    this.boxesValue = sorted;
    this.emit(true);
  }

  private pushUndo(snapshot: EditorBox[]): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  private pruneSelection(): void {
    const ids = new Set(this.boxesValue.map((b) => b.id));
    this.selected = new Set(Array.from(this.selected).filter((id) => ids.has(id)));
  }

  private newId(): string {
    return `new-${this.nextId++}`;
  }

  private emit(contentChanged: boolean): void {
    this.listeners.forEach((l) => l(contentChanged));
  }
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  let same = true;
  a.forEach((v) => {
    if (!b.has(v)) same = false;
  });
  return same;
}
