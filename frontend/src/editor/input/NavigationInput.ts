import type { EditorEngine } from "../EditorEngine";

export type Zone = "spectrogram" | "lane" | "waveform";

export interface InputElements {
  /** Wrapper around spectrogram, lane and waveform (all share the same x axis). */
  plotArea: HTMLElement;
  /** The spectrogram part of the plot (y axis = frequency). */
  spectrogram: HTMLElement;
  minimap: HTMLElement;
}

/** Pointer movement (px) below which a press counts as a click. */
const CLICK_SLOP = 4;
const ZOOM_STEP = 1.5;
/** Wheel zoom sensitivity; deltas are clamped so a mouse notch ≈ ×1.27. */
const WHEEL_ZOOM_SPEED = 0.004;
const WHEEL_DELTA_CLAMP = 60;

/** Keys typed into form controls (and Tab moving between them) belong to the control. */
const isFormControl = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A" || el.isContentEditable;
};

/**
 * Navigation controls (current phase: viewing only — no box editing yet).
 *
 *   wheel / two-finger swipe      pan in time
 *   Shift + wheel                  pan in frequency
 *   Ctrl/⌘ + wheel, pinch          zoom time around the cursor
 *   Alt + wheel                    zoom frequency around the cursor
 *   drag (left or middle button)   pan
 *   click                          select box / set playback cursor
 *   double-click on a box          play the box
 */
export class NavigationInput {
  private drag: { id: number; x: number; y: number; lastX: number; lastY: number; moved: boolean; zone: Zone } | null = null;
  private minimapDrag: { id: number; grabOffset: number } | null = null;

  constructor(
    private readonly engine: EditorEngine,
    private readonly el: InputElements,
  ) {
    el.plotArea.addEventListener("wheel", this.onWheel, { passive: false });
    el.plotArea.addEventListener("pointerdown", this.onPointerDown);
    el.plotArea.addEventListener("pointermove", this.onPointerMove);
    el.plotArea.addEventListener("pointerup", this.onPointerUp);
    el.plotArea.addEventListener("pointercancel", this.onPointerUp);
    el.plotArea.addEventListener("pointerleave", this.onPointerLeave);
    el.plotArea.addEventListener("dblclick", this.onDoubleClick);
    el.plotArea.addEventListener("auxclick", preventMiddleClickPaste);
    el.minimap.addEventListener("pointerdown", this.onMinimapDown);
    el.minimap.addEventListener("pointermove", this.onMinimapMove);
    el.minimap.addEventListener("pointerup", this.onMinimapUp);
    el.minimap.addEventListener("pointercancel", this.onMinimapUp);
    window.addEventListener("keydown", this.onKeyDown);
  }

  destroy(): void {
    const { plotArea, minimap } = this.el;
    plotArea.removeEventListener("wheel", this.onWheel);
    plotArea.removeEventListener("pointerdown", this.onPointerDown);
    plotArea.removeEventListener("pointermove", this.onPointerMove);
    plotArea.removeEventListener("pointerup", this.onPointerUp);
    plotArea.removeEventListener("pointercancel", this.onPointerUp);
    plotArea.removeEventListener("pointerleave", this.onPointerLeave);
    plotArea.removeEventListener("dblclick", this.onDoubleClick);
    plotArea.removeEventListener("auxclick", preventMiddleClickPaste);
    minimap.removeEventListener("pointerdown", this.onMinimapDown);
    minimap.removeEventListener("pointermove", this.onMinimapMove);
    minimap.removeEventListener("pointerup", this.onMinimapUp);
    minimap.removeEventListener("pointercancel", this.onMinimapUp);
    window.removeEventListener("keydown", this.onKeyDown);
  }

  // ------------------------------------------------------------------ helpers

  /** Pointer position relative to the plot (x) and to the spectrogram (y). */
  private locate(e: MouseEvent): { x: number; y: number; zone: Zone } {
    const plot = this.el.plotArea.getBoundingClientRect();
    const spec = this.el.spectrogram.getBoundingClientRect();
    const x = e.clientX - plot.left;
    const y = e.clientY - spec.top;
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-zone]");
    const zone = (target?.dataset.zone as Zone | undefined) ?? "spectrogram";
    return { x, y, zone };
  }

  // -------------------------------------------------------------------- wheel

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.el.plotArea.clientHeight : 1;
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    const { x, y, zone } = this.locate(e);

    if (e.ctrlKey || e.metaKey) {
      this.engine.zoomTimeAt(x, Math.exp(-clamp(dy, WHEEL_DELTA_CLAMP) * WHEEL_ZOOM_SPEED));
    } else if (e.altKey) {
      if (zone === "spectrogram") {
        this.engine.zoomFreqAt(y, Math.exp(-clamp(dy, WHEEL_DELTA_CLAMP) * WHEEL_ZOOM_SPEED));
      }
    } else if (e.shiftKey) {
      // Browsers may already map Shift+wheel to deltaX.
      this.engine.panByPx(0, dy || dx);
    } else {
      this.engine.panByPx(dx + dy, 0);
    }
  };

  // ------------------------------------------------------------------ pointer

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    const { x, y, zone } = this.locate(e);
    this.el.plotArea.setPointerCapture(e.pointerId);
    this.drag = { id: e.pointerId, x, y, lastX: x, lastY: y, moved: false, zone };
  };

  private onPointerMove = (e: PointerEvent): void => {
    const { x, y, zone } = this.locate(e);
    const drag = this.drag;
    if (!drag || drag.id !== e.pointerId) {
      this.engine.setHover(x, y, zone === "spectrogram");
      return;
    }
    if (!drag.moved && Math.hypot(x - drag.x, y - drag.y) < CLICK_SLOP) return;
    if (!drag.moved) {
      drag.moved = true;
      this.el.plotArea.style.cursor = "grabbing";
    }
    // Content follows the pointer; only the spectrogram pans in frequency.
    const dy = drag.zone === "spectrogram" ? y - drag.lastY : 0;
    this.engine.panByPx(-(x - drag.lastX), -dy);
    drag.lastX = x;
    drag.lastY = y;
    this.engine.setHover(x, y, drag.zone === "spectrogram");
  };

  private onPointerUp = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.id !== e.pointerId) return;
    this.drag = null;
    this.el.plotArea.style.cursor = "";
    if (this.el.plotArea.hasPointerCapture(e.pointerId)) this.el.plotArea.releasePointerCapture(e.pointerId);
    if (drag.moved || e.type === "pointercancel" || e.button !== 0) return;

    const box = drag.zone === "spectrogram"
      ? this.engine.boxAtSpectrogram(drag.x, drag.y)
      : this.engine.boxAtTime(drag.x);
    if (box) {
      this.engine.select(box.id);
    } else {
      this.engine.select(null);
      this.engine.seek(this.engine.view.xToTime(drag.x));
    }
  };

  private onPointerLeave = (): void => {
    if (!this.drag) this.engine.setHover(null, null, false);
  };

  private onDoubleClick = (e: MouseEvent): void => {
    const { x, y, zone } = this.locate(e);
    const box = zone === "spectrogram" ? this.engine.boxAtSpectrogram(x, y) : this.engine.boxAtTime(x);
    if (!box) return;
    this.engine.select(box.id);
    this.engine.playSelection();
  };

  // ------------------------------------------------------------------ minimap

  private minimapTime(e: PointerEvent): number {
    const rect = this.el.minimap.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * this.engine.view.duration;
  }

  private onMinimapDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    const t = this.minimapTime(e);
    const { t0, t1 } = this.engine.view;
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
    if (isFormControl(e.target) || e.ctrlKey || e.metaKey) return;
    const engine = this.engine;
    const view = engine.view;
    let handled = true;

    switch (e.code) {
      case "Space":
        if (!e.repeat) engine.togglePlay();
        break;
      case "Enter":
        engine.playSelection();
        break;
      case "Escape":
        if (engine.player.isPlaying) engine.stop();
        else engine.select(null);
        break;
      case "Tab":
        engine.selectAdjacent(e.shiftKey ? -1 : 1);
        break;
      case "Equal":
      case "NumpadAdd":
        engine.zoomTimeCentered(ZOOM_STEP);
        break;
      case "Minus":
      case "NumpadSubtract":
        engine.zoomTimeCentered(1 / ZOOM_STEP);
        break;
      case "Digit0":
        engine.fitAll();
        break;
      case "Digit1":
        if (e.shiftKey) engine.fitAll();
        else handled = false;
        break;
      case "Digit2":
        if (e.shiftKey) engine.zoomToSelection();
        else handled = false;
        break;
      case "ArrowLeft":
        engine.panByPx(-view.width * (e.shiftKey ? 0.8 : 0.2));
        break;
      case "ArrowRight":
        engine.panByPx(view.width * (e.shiftKey ? 0.8 : 0.2));
        break;
      case "Home":
        engine.panToTime(0);
        break;
      case "End":
        engine.panToTime(view.duration);
        break;
      case "KeyF":
        engine.resetFrequency();
        break;
      case "KeyL":
        engine.toggleLoop();
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };
}

const clamp = (v: number, limit: number): number => Math.max(-limit, Math.min(limit, v));

const preventMiddleClickPaste = (e: MouseEvent): void => {
  if (e.button === 1) e.preventDefault();
};
