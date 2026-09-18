/**
 * Viewport — the single source of truth for what part of the recording is visible.
 *
 * Everything is expressed in physical units (seconds, Hz). Pixels are always
 * derived, never stored, so annotations stay correct on any screen size or zoom.
 */

/** Smallest frequency span the user can zoom into (Hz). */
const MIN_FREQ_SPAN = 200;

export class Viewport {
  /** Plot area size in CSS pixels. */
  width = 1;
  height = 1;

  /** Time at the left edge of the plot (s). */
  t0 = 0;
  /** Horizontal scale (CSS px per second). */
  pxPerSec = 1;
  /** Visible frequency range (Hz), f0 at the bottom, f1 at the top. */
  f0 = 0;
  f1: number;

  /** Incremented on every change — cheap dirty check for renderers. */
  version = 0;
  private committed: number[] = [];

  constructor(
    readonly duration: number,
    readonly sampleRate: number,
  ) {
    this.f1 = this.nyquist;
  }

  get nyquist(): number {
    return this.sampleRate / 2;
  }

  get t1(): number {
    return this.t0 + this.width / this.pxPerSec;
  }

  get visibleDuration(): number {
    return this.width / this.pxPerSec;
  }

  /** Zoom-out limit: the whole recording fits the plot. */
  get minPxPerSec(): number {
    return this.width / this.duration;
  }

  /** Zoom-in limit: 2 samples per CSS pixel (≈24 px per ms at 48 kHz). */
  get maxPxPerSec(): number {
    return Math.max(this.minPxPerSec, this.sampleRate / 2);
  }

  get isFreqZoomed(): boolean {
    return this.f0 > 0 || this.f1 < this.nyquist;
  }

  timeToX(t: number): number {
    return (t - this.t0) * this.pxPerSec;
  }

  xToTime(x: number): number {
    return this.t0 + x / this.pxPerSec;
  }

  freqToY(f: number): number {
    return (1 - (f - this.f0) / (this.f1 - this.f0)) * this.height;
  }

  yToFreq(y: number): number {
    return this.f0 + (1 - y / this.height) * (this.f1 - this.f0);
  }

  setSize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    // Keep the same time span visible when the window is resized.
    const span = this.width > 1 ? this.visibleDuration : this.duration;
    this.width = width;
    this.height = height;
    this.pxPerSec = width / span;
    this.commit();
  }

  /** Zoom the time axis by `factor`, keeping the time under `x` fixed. */
  zoomTimeAt(x: number, factor: number): void {
    const anchor = this.xToTime(x);
    this.pxPerSec *= factor;
    this.clampScale();
    this.t0 = anchor - x / this.pxPerSec;
    this.commit();
  }

  /** Zoom the frequency axis by `factor`, keeping the frequency under `y` fixed. */
  zoomFreqAt(y: number, factor: number): void {
    const anchor = this.yToFreq(y);
    const ratio = y / this.height; // 0 = top
    let span = (this.f1 - this.f0) / factor;
    span = Math.min(this.nyquist, Math.max(MIN_FREQ_SPAN, span));
    this.f1 = anchor + ratio * span;
    this.f0 = this.f1 - span;
    this.commit();
  }

  panByPx(dx: number, dy = 0): void {
    this.t0 += dx / this.pxPerSec;
    if (dy !== 0) {
      const df = (dy / this.height) * (this.f1 - this.f0);
      this.f0 -= df;
      this.f1 -= df;
    }
    this.commit();
  }

  setTimeRange(start: number, end: number): void {
    this.pxPerSec = this.width / Math.max(end - start, 1e-6);
    this.clampScale();
    this.t0 = (start + end) / 2 - this.visibleDuration / 2;
    this.commit();
  }

  setFreqRange(f0: number, f1: number): void {
    this.f0 = f0;
    this.f1 = f1;
    this.commit();
  }

  /** Make sure `t` is visible, paging the view if needed (used to follow playback). */
  ensureVisible(t: number, marginRatio = 0.05): void {
    const margin = this.visibleDuration * marginRatio;
    if (t < this.t0 || t > this.t1 - margin) {
      this.t0 = t - margin;
      this.commit();
    }
  }

  fitAll(): void {
    this.pxPerSec = this.minPxPerSec;
    this.t0 = 0;
    this.f0 = 0;
    this.f1 = this.nyquist;
    this.commit();
  }

  private clampScale(): void {
    this.pxPerSec = Math.min(this.maxPxPerSec, Math.max(this.minPxPerSec, this.pxPerSec));
  }

  /** Clamp to valid ranges; bump `version` only if something actually changed. */
  private commit(): void {
    this.clampScale();
    const maxT0 = Math.max(0, this.duration - this.visibleDuration);
    this.t0 = Math.min(maxT0, Math.max(0, this.t0));

    const span = Math.min(this.nyquist, Math.max(MIN_FREQ_SPAN, this.f1 - this.f0));
    this.f0 = Math.min(this.nyquist - span, Math.max(0, this.f0));
    this.f1 = this.f0 + span;

    const state = [this.t0, this.pxPerSec, this.f0, this.f1, this.width, this.height];
    if (state.some((v, i) => v !== this.committed[i])) {
      this.committed = state;
      this.version++;
    }
  }
}
