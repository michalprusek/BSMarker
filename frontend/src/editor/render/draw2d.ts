import { Viewport } from "../core/Viewport";
import { BoxIndex, EditorBox, colorIndexForLabel } from "../core/boxes";
import { Draft } from "../edit/draft";
import { Rect, boxRect } from "../edit/geometry";
import { WaveformPeaks } from "../dsp/WaveformPeaks";
import { LABEL_COLORS } from "../../utils/constants";
import { formatFrequency, formatTime, niceStep } from "./ticks";

const FONT = "11px ui-sans-serif, system-ui, -apple-system, sans-serif";
const AXIS_TEXT = "#4B5563";
const AXIS_LINE = "#D1D5DB";
const SELECTED = "#F59E0B";

/** Sizes the backing store for the device pixel ratio and returns a context in CSS pixels. */
export function prepareCanvas(canvas: HTMLCanvasElement, dpr: number): CanvasRenderingContext2D | null {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const bw = Math.max(1, Math.round(w * dpr));
  const bh = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

export function drawTimeRuler(ctx: CanvasRenderingContext2D, view: Viewport, height: number): void {
  const step = niceStep(view.pxPerSec, 80);
  const minor = step / 5;
  ctx.font = FONT;
  ctx.textBaseline = "top";
  ctx.fillStyle = AXIS_TEXT;
  ctx.strokeStyle = AXIS_LINE;
  ctx.beginPath();
  ctx.moveTo(0, height - 0.5);
  ctx.lineTo(view.width, height - 0.5);

  const firstMinor = Math.floor(view.t0 / minor);
  const lastMinor = Math.ceil(view.t1 / minor);
  for (let i = firstMinor; i <= lastMinor; i++) {
    const x = Math.round(view.timeToX(i * minor)) + 0.5;
    const isMajor = i % 5 === 0;
    ctx.moveTo(x, height);
    ctx.lineTo(x, height - (isMajor ? 10 : 4));
    if (isMajor) ctx.fillText(formatTime(i * minor, step), x + 3, 3);
  }
  ctx.stroke();
}

export function drawFreqAxis(ctx: CanvasRenderingContext2D, view: Viewport, width: number): void {
  const pxPerHz = view.height / (view.f1 - view.f0);
  const step = niceStep(pxPerHz, 28);
  ctx.font = FONT;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = AXIS_TEXT;
  ctx.strokeStyle = AXIS_LINE;
  ctx.beginPath();
  ctx.moveTo(width - 0.5, 0);
  ctx.lineTo(width - 0.5, view.height);
  for (let f = Math.ceil(view.f0 / step) * step; f <= view.f1; f += step) {
    const y = Math.round(view.freqToY(f)) + 0.5;
    ctx.moveTo(width - 6, y);
    ctx.lineTo(width, y);
    if (y > 6 && y < view.height - 4) ctx.fillText(formatFrequency(f, step), width - 8, y);
  }
  ctx.stroke();
}

/** Reusable per-pixel buffers for the waveform envelope. */
export class EnvelopeBuffers {
  min = new Float32Array(0);
  max = new Float32Array(0);
  ensure(n: number): void {
    if (this.min.length !== n) {
      this.min = new Float32Array(n);
      this.max = new Float32Array(n);
    }
  }
}

export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  view: Viewport,
  peaks: WaveformPeaks,
  height: number,
  buffers: EnvelopeBuffers,
): void {
  const width = Math.ceil(view.width);
  buffers.ensure(width);
  const samplesPerPx = view.sampleRate / view.pxPerSec;
  peaks.envelope(view.t0 * view.sampleRate, samplesPerPx, buffers.min, buffers.max);

  const mid = height / 2;
  const scale = (height / 2 - 2) / peaks.peak;
  ctx.fillStyle = "#F9FAFB";
  ctx.fillRect(0, 0, view.width, height);
  ctx.strokeStyle = AXIS_LINE;
  ctx.beginPath();
  ctx.moveTo(0, mid + 0.5);
  ctx.lineTo(view.width, mid + 0.5);
  ctx.stroke();

  ctx.fillStyle = "#3B82F6";
  for (let x = 0; x < width; x++) {
    const top = mid - buffers.max[x] * scale;
    const bottom = mid - buffers.min[x] * scale;
    ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
  }
}

export interface OverlayState {
  index: BoxIndex;
  selected: ReadonlySet<string>;
  hoveredId: string | null;
  draft: Draft | null;
  snapGuide: number | null;
}

const HANDLE_SIZE = 7;

export function drawBoxes(ctx: CanvasRenderingContext2D, view: Viewport, state: OverlayState): void {
  ctx.font = FONT;
  ctx.textBaseline = "top";
  const selectedRects: Rect[] = [];

  state.index.forEachInRange(view.t0, view.t1, (box) => {
    const r = boxRect(view, box);
    if (r.y1 < 0 || r.y0 > view.height) return;
    const color = LABEL_COLORS[colorIndexForLabel(box.label)];
    const selected = state.selected.has(box.id);
    const hovered = box.id === state.hoveredId;

    ctx.fillStyle = color.fill;
    ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    ctx.lineWidth = selected ? 2 : hovered ? 2 : 1.25;
    ctx.strokeStyle = selected ? SELECTED : color.stroke;
    ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    if (selected) selectedRects.push(r);
    drawLabel(ctx, box.label, r.x0, r.y0, Math.max(r.x1 - r.x0, 14), selected ? SELECTED : color.stroke);
  });

  // Handles on top of every box, so they are never hidden by a neighbour.
  for (const r of selectedRects) drawHandles(ctx, r, r.y0 > 0 || r.y1 < view.height);

  if (state.draft) {
    const d = state.draft;
    const r = boxRect(view, { start: d.start, end: d.end, fLow: d.fLow, fHigh: d.fHigh } as EditorBox);
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    if (d.kind === "marquee") {
      ctx.fillStyle = "rgba(37, 99, 235, 0.08)";
      ctx.strokeStyle = "#2563EB";
    } else {
      ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
      ctx.strokeStyle = SELECTED;
    }
    ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    ctx.setLineDash([]);
  }
  if (state.snapGuide !== null) drawGuide(ctx, view, state.snapGuide, view.height);
}

function drawHandles(ctx: CanvasRenderingContext2D, r: Rect, vertical: boolean): void {
  const xm = (r.x0 + r.x1) / 2;
  const ym = (r.y0 + r.y1) / 2;
  const points: [number, number][] = [[r.x0, ym], [r.x1, ym]];
  if (vertical) points.push([r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1], [xm, r.y0], [xm, r.y1]);
  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = SELECTED;
  ctx.lineWidth = 1.5;
  const h = HANDLE_SIZE / 2;
  for (const [x, y] of points) {
    ctx.fillRect(x - h, y - h, HANDLE_SIZE, HANDLE_SIZE);
    ctx.strokeRect(x - h, y - h, HANDLE_SIZE, HANDLE_SIZE);
  }
}

function drawGuide(ctx: CanvasRenderingContext2D, view: Viewport, time: number, height: number): void {
  const x = Math.round(view.timeToX(time)) + 0.5;
  ctx.strokeStyle = "#EC4899";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, color: string): void {
  const width = Math.min(maxWidth, ctx.measureText(text).width + 6);
  const ty = Math.max(0, y - 15);
  ctx.fillStyle = color;
  ctx.fillRect(x, ty, width, 14);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, ty, width, 14);
  ctx.clip();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(text, x + 3, ty + 1.5);
  ctx.restore();
}

/** Boxes flattened onto the time axis — gaps and overlaps are visible at a glance. */
export function drawTimeLane(ctx: CanvasRenderingContext2D, view: Viewport, state: OverlayState, height: number): void {
  ctx.fillStyle = "#F3F4F6";
  ctx.fillRect(0, 0, view.width, height);
  state.index.forEachInRange(view.t0, view.t1, (box) => {
    const x0 = view.timeToX(box.start);
    const x1 = view.timeToX(box.end);
    const selected = state.selected.has(box.id);
    const hovered = box.id === state.hoveredId;
    ctx.fillStyle = selected ? SELECTED : LABEL_COLORS[colorIndexForLabel(box.label)].stroke;
    ctx.globalAlpha = selected || hovered ? 1 : 0.65;
    ctx.fillRect(x0, 2, Math.max(1, x1 - x0), height - 4);
  });
  ctx.globalAlpha = 1;
  if (state.draft) {
    const x0 = view.timeToX(state.draft.start);
    const x1 = view.timeToX(state.draft.end);
    ctx.fillStyle = state.draft.kind === "marquee" ? "rgba(37, 99, 235, 0.35)" : "rgba(245, 158, 11, 0.6)";
    ctx.fillRect(x0, 0, x1 - x0, height);
  }
  if (state.snapGuide !== null) drawGuide(ctx, view, state.snapGuide, height);
}

/**
 * Minimap of the whole recording. The static part (envelope + box ticks) is
 * rendered once into `cache`; per frame we only blit it and draw the viewport.
 */
export function renderMinimapCache(
  cache: HTMLCanvasElement,
  width: number,
  height: number,
  dpr: number,
  duration: number,
  sampleRate: number,
  peaks: WaveformPeaks,
): void {
  cache.width = Math.max(1, Math.round(width * dpr));
  cache.height = Math.max(1, Math.round(height * dpr));
  const ctx = cache.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#F9FAFB";
  ctx.fillRect(0, 0, width, height);

  const n = Math.ceil(width);
  const min = new Float32Array(n);
  const max = new Float32Array(n);
  peaks.envelope(0, (duration * sampleRate) / width, min, max);
  const mid = height / 2;
  const scale = (height / 2 - 1) / peaks.peak;
  ctx.fillStyle = "#9CA3AF";
  for (let x = 0; x < n; x++) {
    const top = mid - max[x] * scale;
    ctx.fillRect(x, top, 1, Math.max(1, (max[x] - min[x]) * scale));
  }
}

/** Minimap: cached envelope + live box ticks + the current viewport. */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  cache: HTMLCanvasElement,
  view: Viewport,
  index: BoxIndex,
  width: number,
  height: number,
): void {
  ctx.drawImage(cache, 0, 0, width, height);
  const pxPerSec = width / view.duration;
  index.forEachInRange(0, view.duration, (box) => {
    ctx.fillStyle = LABEL_COLORS[colorIndexForLabel(box.label)].stroke;
    ctx.fillRect(box.start * pxPerSec, height - 4, Math.max(1, (box.end - box.start) * pxPerSec), 4);
  });
  const x0 = view.t0 * pxPerSec;
  const w = Math.max(4, view.visibleDuration * pxPerSec);
  ctx.fillStyle = "rgba(37, 99, 235, 0.12)";
  ctx.fillRect(x0, 0, w, height);
  ctx.strokeStyle = "#2563EB";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0 + 0.75, 0.75, w - 1.5, height - 1.5);
}
