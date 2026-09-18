import { Viewport } from "../core/Viewport";
import { BoxIndex, EditorBox } from "../core/boxes";
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

export function drawBoxes(
  ctx: CanvasRenderingContext2D,
  view: Viewport,
  index: BoxIndex,
  selectedId: string | null,
  hoveredId: string | null,
): void {
  ctx.font = FONT;
  ctx.textBaseline = "top";
  index.forEachInRange(view.t0, view.t1, (box) => {
    const x0 = view.timeToX(box.start);
    const x1 = view.timeToX(box.end);
    const y0 = box.fHigh === null ? 0 : view.freqToY(box.fHigh);
    const y1 = box.fLow === null ? view.height : view.freqToY(box.fLow);
    if (y1 < 0 || y0 > view.height) return;

    const color = LABEL_COLORS[box.colorIndex];
    const selected = box.id === selectedId;
    const hovered = box.id === hoveredId;
    ctx.fillStyle = color.fill;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.lineWidth = selected ? 2.5 : hovered ? 2 : 1.25;
    ctx.strokeStyle = selected ? SELECTED : color.stroke;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

    if (x1 - x0 > 24) drawLabel(ctx, box, x0, y0, x1 - x0, selected ? SELECTED : color.stroke);
  });
}

function drawLabel(ctx: CanvasRenderingContext2D, box: EditorBox, x: number, y: number, maxWidth: number, color: string): void {
  const text = box.label;
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
export function drawTimeLane(
  ctx: CanvasRenderingContext2D,
  view: Viewport,
  index: BoxIndex,
  height: number,
  selectedId: string | null,
): void {
  ctx.fillStyle = "#F3F4F6";
  ctx.fillRect(0, 0, view.width, height);
  index.forEachInRange(view.t0, view.t1, (box) => {
    const x0 = view.timeToX(box.start);
    const x1 = view.timeToX(box.end);
    const selected = box.id === selectedId;
    ctx.fillStyle = selected ? SELECTED : LABEL_COLORS[box.colorIndex].stroke;
    ctx.globalAlpha = selected ? 1 : 0.7;
    ctx.fillRect(x0, 2, Math.max(1, x1 - x0), height - 4);
  });
  ctx.globalAlpha = 1;
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
  index: BoxIndex,
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

  const pxPerSec = width / duration;
  index.forEachInRange(0, duration, (box) => {
    ctx.fillStyle = LABEL_COLORS[box.colorIndex].stroke;
    ctx.fillRect(box.start * pxPerSec, height - 4, Math.max(1, (box.end - box.start) * pxPerSec), 4);
  });
}

export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  cache: HTMLCanvasElement,
  view: Viewport,
  width: number,
  height: number,
): void {
  ctx.drawImage(cache, 0, 0, width, height);
  const pxPerSec = width / view.duration;
  const x0 = view.t0 * pxPerSec;
  const w = Math.max(4, view.visibleDuration * pxPerSec);
  ctx.fillStyle = "rgba(37, 99, 235, 0.12)";
  ctx.fillRect(x0, 0, w, height);
  ctx.strokeStyle = "#2563EB";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0 + 0.75, 0.75, w - 1.5, height - 1.5);
}
