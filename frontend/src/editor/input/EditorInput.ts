import type { EditorEngine } from "../EditorEngine";
import { EditorBox, isTimeSegment } from "../core/boxes";
import { EditActions, moveBoxes } from "../edit/EditActions";
import { CURSOR_FOR_HANDLE, Handle, Hit, hitTest, snapTime } from "../edit/geometry";
import { Draft } from "../edit/draft";

export type Zone = "spectrogram" | "lane" | "waveform";

export interface InputElements {
  /** Wrapper around spectrogram, lane and waveform (all share the same x axis). */
  plotArea: HTMLElement;
  /** The spectrogram part of the plot (y axis = frequency). */
  spectrogram: HTMLElement;
  /** The time lane below the spectrogram; the waveform is everything below it. */
  lane: HTMLElement;
  minimap: HTMLElement;
  ruler: HTMLElement;
  freqAxis: HTMLElement;
}

export interface InputCallbacks {
  save: () => void;
  editLabel: () => void;
}

/** Pointer movement (px) below which a press counts as a click. */
const CLICK_SLOP = 4;
/** Smallest box (px on screen) a drag creates; smaller drags are clicks. */
const MIN_DRAW_PX = 3;
const ZOOM_STEP = 1.5;
/** Wheel zoom sensitivity; deltas are clamped so a mouse notch ≈ ×1.27. */
const WHEEL_ZOOM_SPEED = 0.004;
const WHEEL_DELTA_CLAMP = 60;
/** Pan speed when dragging past the plot edge (fraction of the overshoot per event). */
const EDGE_PAN = 0.5;

type Point = { x: number; y: number };

type Gesture =
  | { type: "pending"; id: number; start: Point; zone: Zone; hit: Hit; shift: boolean; forceDraw: boolean }
  | { type: "pan"; id: number; last: Point; zone: Zone | "ruler" | "freqAxis" }
  | { type: "draw"; id: number; start: Point; zone: Zone; startTime: number }
  | { type: "marquee"; id: number; start: Point; zone: Zone; additive: boolean }
  | { type: "move"; id: number; start: Point; zone: Zone; originals: EditorBox[] }
  | { type: "resize"; id: number; zone: Zone; handle: Handle; original: EditorBox };

export const isFormControl = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A" || el.isContentEditable;
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * All pointer and keyboard input of the editor. There are no modes: what a
 * drag does depends on where it starts —
 *
 *   empty spectrogram      draw a box            (Ctrl/⌘ + drag: draw even over a box)
 *   empty lane, waveform   draw a time segment   (full frequency range; boxes are not grabbable on the waveform)
 *   box                    move (Shift: lock direction)
 *   box edge / corner      resize
 *   Shift + empty          selection rectangle
 *   middle button, ruler, frequency axis, minimap   pan
 *
 * Every gesture previews live, can be cancelled with Esc, and is one undo step.
 * Alt while dragging disables snapping to other boxes' edges.
 */
export class EditorInput {
  private gesture: Gesture | null = null;
  private minimapDrag: { id: number; grabOffset: number } | null = null;
  private readonly actions: EditActions;
  private readonly listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];

  constructor(
    private readonly engine: EditorEngine,
    private readonly el: InputElements,
    private readonly callbacks: InputCallbacks,
  ) {
    this.actions = new EditActions(engine.doc, engine.view.duration, engine.view.nyquist);

    this.on(el.plotArea, "wheel", this.onWheel, { passive: false });
    this.on(el.plotArea, "pointerdown", this.onPointerDown);
    this.on(el.plotArea, "pointermove", this.onPointerMove);
    this.on(el.plotArea, "pointerup", this.onPointerUp);
    this.on(el.plotArea, "pointercancel", this.onPointerCancel);
    this.on(el.plotArea, "pointerleave", this.onPointerLeave);
    this.on(el.plotArea, "dblclick", this.onDoubleClick);
    this.on(el.plotArea, "auxclick", preventMiddleClickPaste);

    this.on(el.ruler, "wheel", this.onAxisWheel, { passive: false });
    this.on(el.ruler, "pointerdown", this.onAxisDown);
    this.on(el.ruler, "dblclick", () => engine.fitAll());
    this.on(el.freqAxis, "wheel", this.onAxisWheel, { passive: false });
    this.on(el.freqAxis, "pointerdown", this.onAxisDown);
    this.on(el.freqAxis, "dblclick", () => engine.resetFrequency());
    for (const axis of [el.ruler, el.freqAxis]) {
      this.on(axis, "pointermove", this.onPointerMove);
      this.on(axis, "pointerup", this.onPointerUp);
      this.on(axis, "pointercancel", this.onPointerCancel);
    }

    this.on(el.minimap, "pointerdown", this.onMinimapDown);
    this.on(el.minimap, "pointermove", this.onMinimapMove);
    this.on(el.minimap, "pointerup", this.onMinimapUp);
    this.on(el.minimap, "pointercancel", this.onMinimapUp);
    this.on(window, "keydown", this.onKeyDown);
  }

  get editActions(): EditActions {
    return this.actions;
  }

  destroy(): void {
    this.listeners.forEach(([target, type, fn, opts]) => target.removeEventListener(type, fn, opts));
    this.listeners.length = 0;
  }

  private on<E extends Event>(target: EventTarget, type: string, fn: (e: E) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn as EventListener, opts);
    this.listeners.push([target, type, fn as EventListener, opts]);
  }

  // ------------------------------------------------------------------ helpers

  private get view() {
    return this.engine.view;
  }

  private get doc() {
    return this.engine.doc;
  }

  /**
   * Pointer position relative to the plot (x) and to the spectrogram (y).
   * The zone is found from the position, not the event target, which is the
   * whole plot while the pointer is captured.
   */
  private locate(e: MouseEvent): Point & { zone: Zone } {
    const plot = this.el.plotArea.getBoundingClientRect();
    const spec = this.el.spectrogram.getBoundingClientRect();
    const lane = this.el.lane.getBoundingClientRect();
    const zone: Zone = e.clientY < spec.bottom ? "spectrogram" : e.clientY < lane.bottom ? "lane" : "waveform";
    return { x: e.clientX - plot.left, y: e.clientY - spec.top, zone };
  }

  /** You can only grab what you can see: boxes are drawn on the spectrogram and the lane, not the waveform. */
  private hitAt(p: Point, zone: Zone): Hit {
    if (zone === "waveform") return null;
    return hitTest(this.view, this.engine.index, this.doc.selectedIds, p.x, p.y, zone === "lane");
  }

  private timeAt(x: number): number {
    return clamp(this.view.xToTime(x), 0, this.view.duration);
  }

  private freqAt(y: number): number {
    return clamp(this.view.yToFreq(y), 0, this.view.nyquist);
  }

  /** Snap a time to nearby box edges unless Alt is held. */
  private snap(t: number, e: MouseEvent, exclude: ReadonlySet<string> = new Set()) {
    if (e.altKey) return { time: t, guide: null };
    return snapTime(this.view, this.engine.index, t, exclude);
  }

  private setCursor(cursor: string): void {
    this.el.plotArea.style.cursor = cursor;
  }

  // -------------------------------------------------------------------- wheel

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.el.plotArea.clientHeight : 1;
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    const { x, y, zone } = this.locate(e);

    if (e.ctrlKey || e.metaKey) {
      this.engine.zoomTimeAt(x, zoomFactor(dy));
    } else if (e.altKey) {
      if (zone === "spectrogram") this.engine.zoomFreqAt(y, zoomFactor(dy));
    } else if (e.shiftKey) {
      // Browsers may already map Shift+wheel to deltaX.
      this.engine.panByPx(0, dy || dx);
    } else {
      this.engine.panByPx(dx + dy, 0);
    }
  };

  /** Over the ruler the wheel zooms time; over the frequency axis it zooms frequency. */
  private onAxisWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : 1;
    const dy = (e.deltaY || e.deltaX) * unit;
    if (e.currentTarget === this.el.ruler) {
      const rect = this.el.ruler.getBoundingClientRect();
      this.engine.zoomTimeAt(e.clientX - rect.left, zoomFactor(dy));
    } else {
      const rect = this.el.freqAxis.getBoundingClientRect();
      this.engine.zoomFreqAt(e.clientY - rect.top, zoomFactor(dy));
    }
  };

  // ------------------------------------------------------------------ pointer

  private onAxisDown = (e: PointerEvent): void => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    target.style.cursor = "grabbing";
    this.gesture = {
      type: "pan",
      id: e.pointerId,
      last: { x: e.clientX, y: e.clientY },
      zone: target === this.el.ruler ? "ruler" : "freqAxis",
    };
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.gesture) return;
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    const p = this.locate(e);
    this.el.plotArea.setPointerCapture(e.pointerId);

    if (e.button === 1) {
      this.gesture = { type: "pan", id: e.pointerId, last: { x: e.clientX, y: e.clientY }, zone: p.zone };
      this.setCursor("grabbing");
      return;
    }
    this.gesture = {
      type: "pending",
      id: e.pointerId,
      start: p,
      zone: p.zone,
      hit: e.ctrlKey || e.metaKey ? null : this.hitAt(p, p.zone),
      shift: e.shiftKey,
      forceDraw: e.ctrlKey || e.metaKey,
    };
  };

  private onPointerMove = (e: PointerEvent): void => {
    const g = this.gesture;
    if (!g || g.id !== e.pointerId) {
      if (e.currentTarget === this.el.plotArea) this.updateHover(e);
      return;
    }
    if (g.type === "pan") {
      const dx = e.clientX - g.last.x;
      const dy = e.clientY - g.last.y;
      g.last = { x: e.clientX, y: e.clientY };
      // Content follows the pointer; the ruler pans only time, the frequency axis only frequency.
      const panTime = g.zone !== "freqAxis";
      const panFreq = g.zone === "spectrogram" || g.zone === "freqAxis";
      this.engine.panByPx(panTime ? -dx : 0, panFreq ? -dy : 0);
      return;
    }

    const p = this.locate(e);
    if (g.type === "pending") {
      if (Math.hypot(p.x - g.start.x, p.y - g.start.y) < CLICK_SLOP) return;
      this.startDrag(g, e);
    }
    this.autoPan(p.x);
    this.updateDrag(this.locate(e), e);
  };

  private onPointerUp = (e: PointerEvent): void => {
    const g = this.gesture;
    if (!g || g.id !== e.pointerId) return;
    this.releaseCapture(e);
    this.gesture = null;

    switch (g.type) {
      case "pending":
        this.click(g);
        break;
      case "draw":
        this.finishDraw(g, this.locate(e), e);
        break;
      case "marquee":
        this.finishMarquee(g, this.locate(e));
        break;
      case "move":
      case "resize":
        this.doc.commit();
        this.engine.setDraft(null);
        break;
      case "pan":
        break;
    }
    this.updateHover(e);
  };

  private onPointerCancel = (e: PointerEvent): void => {
    if (!this.gesture || this.gesture.id !== e.pointerId) return;
    this.releaseCapture(e);
    this.cancelGesture();
  };

  private onPointerLeave = (): void => {
    if (!this.gesture) this.engine.setHover(null, null, false, null);
  };

  private onDoubleClick = (e: MouseEvent): void => {
    const p = this.locate(e);
    const hit = this.hitAt(p, p.zone);
    if (!hit) return;
    this.doc.select([hit.box.id]);
    this.engine.playSelection();
  };

  private releaseCapture(e: PointerEvent): void {
    const target = e.currentTarget as HTMLElement;
    if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
    this.el.ruler.style.cursor = "";
    this.el.freqAxis.style.cursor = "";
  }

  private updateHover(e: MouseEvent): void {
    const p = this.locate(e);
    const hit = this.hitAt(p, p.zone);
    this.engine.setHover(p.x, p.y, p.zone === "spectrogram", hit ? hit.box.id : null);
    if (hit?.kind === "handle") this.setCursor(CURSOR_FOR_HANDLE[hit.handle]);
    else if (hit?.kind === "body") this.setCursor("move");
    else this.setCursor("crosshair");
  }

  /** While drawing/moving past the plot edge, scroll the view along. */
  private autoPan(x: number): void {
    const g = this.gesture;
    if (!g || g.type === "pan" || g.type === "pending") return;
    if (x < 0) this.engine.panByPx(x * EDGE_PAN);
    else if (x > this.view.width) this.engine.panByPx((x - this.view.width) * EDGE_PAN);
  }

  // ------------------------------------------------------------- gestures

  private click(g: Extract<Gesture, { type: "pending" }>): void {
    if (g.hit) {
      this.doc.select([g.hit.box.id], g.shift ? "toggle" : "replace");
      return;
    }
    if (!g.shift) this.doc.clearSelection();
    this.engine.seek(this.timeAt(g.start.x));
  }

  private startDrag(g: Extract<Gesture, { type: "pending" }>, e: PointerEvent): void {
    const { id, start, zone, hit } = g;
    if (hit?.kind === "handle") {
      if (!this.doc.isSelected(hit.box.id)) this.doc.select([hit.box.id]);
      this.doc.begin();
      this.gesture = { type: "resize", id, zone, handle: hit.handle, original: hit.box };
      this.setCursor(CURSOR_FOR_HANDLE[hit.handle]);
    } else if (hit?.kind === "body") {
      if (!this.doc.isSelected(hit.box.id)) this.doc.select([hit.box.id], g.shift ? "add" : "replace");
      this.doc.begin();
      this.gesture = { type: "move", id, start, zone, originals: this.doc.selection };
      this.setCursor("move");
    } else if (g.shift && !g.forceDraw) {
      this.gesture = { type: "marquee", id, start, zone, additive: true };
    } else {
      const snapped = this.snap(this.timeAt(start.x), e);
      this.gesture = { type: "draw", id, start, zone, startTime: snapped.time };
    }
  }

  private updateDrag(p: Point, e: PointerEvent): void {
    const g = this.gesture;
    if (!g) return;
    switch (g.type) {
      case "draw": {
        const snapped = this.snap(this.timeAt(p.x), e);
        this.engine.setDraft(this.drawDraft(g, p, snapped.time), snapped.guide);
        break;
      }
      case "marquee":
        this.engine.setDraft(this.rectDraft("marquee", g.zone, g.start, p));
        break;
      case "move":
        this.updateMove(g, p, e);
        break;
      case "resize":
        this.updateResize(g, p, e);
        break;
    }
  }

  private drawDraft(g: Extract<Gesture, { type: "draw" }>, p: Point, time: number): Draft {
    const timeOnly = g.zone !== "spectrogram";
    const f0 = this.freqAt(g.start.y);
    const f1 = this.freqAt(p.y);
    return {
      kind: "box",
      start: Math.min(g.startTime, time),
      end: Math.max(g.startTime, time),
      fLow: timeOnly ? null : Math.min(f0, f1),
      fHigh: timeOnly ? null : Math.max(f0, f1),
    };
  }

  private rectDraft(kind: Draft["kind"], zone: Zone, a: Point, b: Point): Draft {
    const timeOnly = zone !== "spectrogram";
    const t0 = this.timeAt(a.x);
    const t1 = this.timeAt(b.x);
    const f0 = this.freqAt(a.y);
    const f1 = this.freqAt(b.y);
    return {
      kind,
      start: Math.min(t0, t1),
      end: Math.max(t0, t1),
      fLow: timeOnly ? null : Math.min(f0, f1),
      fHigh: timeOnly ? null : Math.max(f0, f1),
    };
  }

  private finishDraw(g: Extract<Gesture, { type: "draw" }>, p: Point, e: PointerEvent): void {
    this.engine.setDraft(null);
    const draft = this.drawDraft(g, p, this.snap(this.timeAt(p.x), e).time);
    const wide = this.view.timeToX(draft.end) - this.view.timeToX(draft.start) >= MIN_DRAW_PX;
    const tall = draft.fLow === null || this.view.freqToY(draft.fLow) - this.view.freqToY(draft.fHigh!) >= MIN_DRAW_PX;
    if (wide && tall) this.doc.add(draft);
  }

  private finishMarquee(g: Extract<Gesture, { type: "marquee" }>, p: Point): void {
    this.engine.setDraft(null);
    const r = this.rectDraft("marquee", g.zone, g.start, p);
    const ids: string[] = [];
    this.engine.index.forEachInRange(r.start, r.end, (box) => {
      if (r.fLow !== null && !isTimeSegment(box) && (box.fHigh! < r.fLow || box.fLow! > r.fHigh!)) return;
      ids.push(box.id);
    });
    this.doc.select(ids, g.additive ? "add" : "replace");
  }

  private updateMove(g: Extract<Gesture, { type: "move" }>, p: Point, e: PointerEvent): void {
    let dxPx = p.x - g.start.x;
    let dyPx = g.zone === "spectrogram" ? p.y - g.start.y : 0;
    if (e.shiftKey) {
      // Lock to the dominant direction, like Figma.
      if (Math.abs(dxPx) >= Math.abs(dyPx)) dyPx = 0;
      else dxPx = 0;
    }
    let dt = dxPx / this.view.pxPerSec;
    const df = -(dyPx / this.view.height) * (this.view.f1 - this.view.f0);

    // Snap whichever end of the moved group is closer to another box edge.
    let guide: number | null = null;
    if (dxPx !== 0 && !e.altKey) {
      const ids = new Set(g.originals.map((b) => b.id));
      const start = Math.min(...g.originals.map((b) => b.start)) + dt;
      const end = Math.max(...g.originals.map((b) => b.end)) + dt;
      const a = snapTime(this.view, this.engine.index, start, ids);
      const b = snapTime(this.view, this.engine.index, end, ids);
      const da = a.guide === null ? Infinity : Math.abs(a.time - start);
      const db = b.guide === null ? Infinity : Math.abs(b.time - end);
      if (da <= db && a.guide !== null) {
        dt += a.time - start;
        guide = a.guide;
      } else if (b.guide !== null) {
        dt += b.time - end;
        guide = b.guide;
      }
    }

    const moved = moveBoxes(g.originals, dt, df, this.view.duration, this.view.nyquist);
    this.doc.update(moved.keys(), (box) => moved.get(box.id)!);
    this.engine.setDraft(null, guide);
  }

  private updateResize(g: Extract<Gesture, { type: "resize" }>, p: Point, e: PointerEvent): void {
    const o = g.original;
    let { start, end } = o;
    let fLow = o.fLow;
    let fHigh = o.fHigh;
    let guide: number | null = null;

    if (g.handle.includes("w") || g.handle.includes("e")) {
      const snapped = this.snap(this.timeAt(p.x), e, new Set([o.id]));
      guide = snapped.guide;
      if (g.handle.includes("w")) start = snapped.time;
      else end = snapped.time;
    }
    if (!isTimeSegment(o) && g.zone === "spectrogram") {
      if (g.handle.includes("n")) fHigh = this.freqAt(p.y);
      if (g.handle.includes("s")) fLow = this.freqAt(p.y);
    }

    // Dragging an edge past the opposite one flips the box (like Figma);
    // keep at least one pixel of size so the box never disappears.
    const minDt = 1 / this.view.pxPerSec;
    const s = Math.min(start, end);
    const t = Math.max(Math.max(start, end), s + minDt);
    let lo = fLow;
    let hi = fHigh;
    if (lo !== null && hi !== null) {
      const minDf = (this.view.f1 - this.view.f0) / this.view.height;
      [lo, hi] = [Math.min(lo, hi), Math.max(Math.max(lo, hi), Math.min(lo, hi) + minDf)];
    }
    this.doc.update([o.id], (box) => ({ ...box, start: s, end: t, fLow: lo, fHigh: hi }));
    this.engine.setDraft(null, guide);
  }

  private cancelGesture(): void {
    const g = this.gesture;
    this.gesture = null;
    if (!g) return;
    if (g.type === "move" || g.type === "resize") this.doc.cancel();
    this.engine.setDraft(null);
    this.setCursor("crosshair");
  }

  // ------------------------------------------------------------------ minimap

  private minimapTime(e: PointerEvent): number {
    const rect = this.el.minimap.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * this.view.duration;
  }

  private onMinimapDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    const t = this.minimapTime(e);
    const { t0, t1 } = this.view;
    // Grabbing the viewport rectangle keeps the grab point; clicking elsewhere centres on it.
    const grabOffset = t >= t0 && t <= t1 ? t - (t0 + t1) / 2 : 0;
    this.minimapDrag = { id: e.pointerId, grabOffset };
    this.el.minimap.setPointerCapture(e.pointerId);
    this.engine.panToTime(t - grabOffset);
  };

  private onMinimapMove = (e: PointerEvent): void => {
    if (!this.minimapDrag || this.minimapDrag.id !== e.pointerId) return;
    this.engine.panToTime(this.minimapTime(e) - this.minimapDrag.grabOffset);
  };

  private onMinimapUp = (e: PointerEvent): void => {
    if (!this.minimapDrag || this.minimapDrag.id !== e.pointerId) return;
    this.minimapDrag = null;
    if (this.el.minimap.hasPointerCapture(e.pointerId)) this.el.minimap.releasePointerCapture(e.pointerId);
  };

  // ----------------------------------------------------------------- keyboard

  private onKeyDown = (e: KeyboardEvent): void => {
    if (isFormControl(e.target)) return;
    // AltGr (Ctrl+Alt on Windows) types characters like # or @ on Czech keyboards.
    if (e.altKey && (e.ctrlKey || e.getModifierState?.("AltGraph"))) return;
    const handled = e.ctrlKey || e.metaKey ? this.handleCommandKey(e) : this.handleKey(e);
    if (handled) e.preventDefault();
  };

  /** Ctrl/⌘ shortcuts — the usual editing commands. */
  private handleCommandKey(e: KeyboardEvent): boolean {
    const { doc, actions } = this;
    const zoom = zoomKey(e);
    if (zoom) {
      this.engine.zoomTimeCentered(zoom > 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
      return true;
    }
    if (e.code === "Digit0") {
      this.engine.fitAll();
      return true;
    }
    switch (letterOf(e)) {
      case "Z":
        if (e.shiftKey) doc.redo();
        else doc.undo();
        return true;
      case "Y":
        doc.redo();
        return true;
      case "C":
        actions.copy();
        return true;
      case "X":
        actions.cut();
        return true;
      case "V":
        actions.paste(this.engine.player.position);
        return true;
      case "D":
        actions.duplicate();
        return true;
      case "A":
        actions.selectAll();
        return true;
      case "S":
        this.callbacks.save();
        return true;
      default:
        return false;
    }
  }

  private handleKey(e: KeyboardEvent): boolean {
    const { engine, doc, actions, view } = this;
    const hasSelection = doc.selectedIds.size > 0;

    // Letters are labels: with a selection they relabel it, otherwise they
    // choose the label for the next boxes you draw.
    const letter = e.altKey ? null : letterOf(e);
    if (letter) {
      if (hasSelection) actions.setLabel(letter);
      else doc.setActiveLabel(letter);
      return true;
    }
    const zoom = zoomKey(e);
    if (zoom) {
      engine.zoomTimeCentered(zoom > 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
      return true;
    }

    switch (e.code) {
      case "Space":
        if (!e.repeat) engine.togglePlay();
        return true;
      case "Enter":
      case "NumpadEnter":
        engine.playSelection(e.shiftKey || undefined);
        return true;
      case "Escape":
        if (this.gesture) this.cancelGesture();
        else if (engine.player.isPlaying) engine.stop();
        else doc.clearSelection();
        return true;
      case "Tab":
        engine.selectAdjacent(e.shiftKey ? -1 : 1);
        return true;
      case "Delete":
      case "Backspace":
        actions.deleteSelection();
        return true;
      case "F2":
        if (hasSelection) this.callbacks.editLabel();
        return true;
      case "Digit0":
        engine.fitAll();
        return true;
      case "Digit1":
        if (!e.shiftKey) return false;
        engine.fitAll();
        return true;
      case "Digit2":
        if (!e.shiftKey) return false;
        engine.zoomToSelection();
        return true;
      case "ArrowLeft":
      case "ArrowRight": {
        const sign = e.code === "ArrowLeft" ? -1 : 1;
        const px = e.shiftKey ? 10 : 1;
        if (hasSelection) actions.nudge((sign * px) / view.pxPerSec, 0);
        else engine.panByPx(sign * view.width * (e.shiftKey ? 0.8 : 0.2));
        return true;
      }
      case "ArrowUp":
      case "ArrowDown": {
        if (!hasSelection) return false;
        const sign = e.code === "ArrowUp" ? 1 : -1;
        const px = e.shiftKey ? 10 : 1;
        actions.nudge(0, (sign * px * (view.f1 - view.f0)) / view.height);
        return true;
      }
      case "Home":
        engine.panToTime(0);
        return true;
      case "End":
        engine.panToTime(view.duration);
        return true;
      default:
        return false;
    }
  }
}

/**
 * The letter a key types. Uses the character (e.key) so that layouts which
 * move letters around — Czech/German QWERTZ swaps Z and Y — label and undo
 * correctly; falls back to the physical key for non-Latin layouts.
 */
export function letterOf(e: KeyboardEvent): string | null {
  if (/^[a-z]$/i.test(e.key)) return e.key.toUpperCase();
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  return null;
}

/** +1 / −1 for zoom keys by character (on Czech layouts "+" is on the 1 key). */
export function zoomKey(e: KeyboardEvent): 1 | -1 | 0 {
  if (e.key === "+" || e.key === "=" || e.code === "NumpadAdd") return 1;
  if (e.key === "-" || e.code === "NumpadSubtract") return -1;
  return 0;
}

const zoomFactor = (dy: number): number =>
  Math.exp(-clamp(dy, -WHEEL_DELTA_CLAMP, WHEEL_DELTA_CLAMP) * WHEEL_ZOOM_SPEED);

const preventMiddleClickPaste = (e: MouseEvent): void => {
  if (e.button === 1) e.preventDefault();
};
