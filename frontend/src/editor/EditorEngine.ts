import { Viewport } from "./core/Viewport";
import { BoxIndex, EditorBox } from "./core/boxes";
import { AudioPlayer } from "./audio/AudioPlayer";
import { DecodedAudio } from "./audio/loadAudio";
import { AnnotationDocument } from "./edit/AnnotationDocument";
import { Draft } from "./edit/draft";
import { TileScheduler, ReadyTile } from "./dsp/TileScheduler";
import { WaveformPeaks } from "./dsp/WaveformPeaks";
import { DbLevels, autoLevels } from "./dsp/levels";
import { FftSize, TileId, chooseLevel, hopForLevel, maxLevel, tileIndexRange } from "./dsp/tiles";
import { SpectrogramRenderer } from "./render/SpectrogramRenderer";
import { PaletteName, backgroundColor } from "./render/palettes";
import {
  EnvelopeBuffers, OverlayState, drawBoxes, drawFreqAxis, drawMinimap, drawTimeLane, drawTimeRuler,
  drawWaveform, prepareCanvas, renderMinimapCache,
} from "./render/draw2d";

export interface EditorElements {
  root: HTMLElement;
  spectrogram: HTMLCanvasElement; // WebGL
  overlay: HTMLCanvasElement; // boxes on top of the spectrogram
  freqAxis: HTMLCanvasElement;
  ruler: HTMLCanvasElement;
  lane: HTMLCanvasElement;
  waveform: HTMLCanvasElement;
  minimap: HTMLCanvasElement;
  playhead: HTMLElement; // spans spectrogram + lane + waveform
  hoverLine: HTMLElement;
}

export interface EditorSettings {
  fftSize: FftSize;
  palette: PaletteName;
  levels: DbLevels;
  followPlayback: boolean;
}

/** Plain snapshot for the React UI (toolbar, readouts). */
export interface EditorSnapshot {
  duration: number;
  sampleRate: number;
  t0: number;
  t1: number;
  f0: number;
  f1: number;
  playing: boolean;
  position: number;
  playbackRate: number;
  loop: boolean;
  hover: { time: number; freq: number | null } | null;
  /** Selected boxes, in time order. */
  selection: EditorBox[];
  boxCount: number;
  activeLabel: string;
  /** Labels used in this recording, sorted. */
  labels: string[];
  canUndo: boolean;
  canRedo: boolean;
  pendingTiles: number;
  workers: number;
  /** Time resolution of the displayed columns (s) */
  columnHop: number;
  /** Main-thread time of the slowest recent frame (ms) — performance diagnostics. */
  frameMs: number;
  /** Unrecoverable problem to show to the user (e.g. spectrogram workers failed). */
  error: string | null;
  settings: EditorSettings;
}

/** Tiles to prefetch on each side of the viewport, in viewport widths. */
const PREFETCH_VIEWPORTS = 1;
/** How many recent tiles are used to pick automatic contrast levels. */
const AUTO_LEVEL_SAMPLE_TILES = 8;
const SNAPSHOT_INTERVAL_MS = 80;

/**
 * Imperative core of the annotation editor: viewport, spectrogram, audio and
 * drawing. Boxes and selection live in the AnnotationDocument; the engine
 * renders them plus the preview of the gesture in progress (draft, snap
 * guide). React only mounts it and renders controls.
 */
export class EditorEngine {
  readonly view: Viewport;
  readonly player: AudioPlayer;
  private readonly peaks: WaveformPeaks;
  private readonly scheduler: TileScheduler;
  private readonly spectrogram: SpectrogramRenderer;
  private readonly envelope = new EnvelopeBuffers();
  private readonly minimapCache = document.createElement("canvas");
  private readonly resizeObserver: ResizeObserver;
  private readonly totalSamples: number;
  private readonly unsubscribeDoc: () => void;

  private indexValue: BoxIndex;
  private hoveredId: string | null = null;
  private hover: { time: number; freq: number | null } | null = null;
  private draft: Draft | null = null;
  private snapGuide: number | null = null;
  private loop = false;
  private settings: EditorSettings;
  /** Most recent tile data, kept for automatic contrast. */
  private recentTiles: Uint8Array[] = [];
  private levelsChosen = false;
  private error: string | null = null;

  private dpr = window.devicePixelRatio || 1;
  private rafId = 0;
  private dirtyView = true; // everything that depends on the viewport
  private dirtySpectrogram = true;
  private dirtyOverlay = true; // boxes / selection / hover / draft
  private dirtyMinimap = true;
  private lastVersion = -1;
  private listeners = new Set<() => void>();
  private snapshot: EditorSnapshot;
  private lastSnapshotAt = 0;
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null;
  private slowestFrameMs = 0;
  private destroyed = false;

  constructor(
    private readonly el: EditorElements,
    audio: DecodedAudio,
    readonly doc: AnnotationDocument,
    settings: Partial<EditorSettings> = {},
  ) {
    this.totalSamples = audio.pcm.length;
    this.view = new Viewport(audio.duration, audio.sampleRate);
    this.player = new AudioPlayer(audio.buffer);
    this.player.onStateChange = () => this.invalidate("playback");
    this.peaks = new WaveformPeaks(audio.pcm);
    this.indexValue = new BoxIndex(doc.boxes);
    this.settings = {
      fftSize: 1024,
      palette: "inverted-gray",
      levels: { floor: -100, ceil: -30 },
      followPlayback: true,
      ...settings,
    };

    this.unsubscribeDoc = doc.subscribe((contentChanged) => {
      if (contentChanged) this.indexValue = new BoxIndex(doc.boxes);
      this.dirtyOverlay = true;
      this.schedule();
      // Live drag updates only need throttled readouts; discrete edits update at once.
      if (doc.inTransaction) this.scheduleSnapshot();
      else this.publishSnapshot();
    });

    this.spectrogram = new SpectrogramRenderer(el.spectrogram, () => {
      this.dirtySpectrogram = true;
      this.lastVersion = -1;
      this.schedule();
    });
    this.spectrogram.setPalette(this.settings.palette);
    this.spectrogram.setLevels(this.settings.levels.floor, this.settings.levels.ceil);
    el.spectrogram.style.background = backgroundColor(this.settings.palette);

    this.scheduler = new TileScheduler(
      audio.pcm,
      (key) => this.spectrogram.has(key),
      (tile) => this.handleTile(tile),
    );
    this.scheduler.onFatalError = (message) => {
      this.error = message;
      this.publishSnapshot();
    };

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(el.root);
    this.handleResize();
    this.view.fitAll();
    this.snapshot = this.buildSnapshot();
    this.schedule();
  }

  // ---------------------------------------------------------------- React glue

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): EditorSnapshot => this.snapshot;

  get index(): BoxIndex {
    return this.indexValue;
  }

  // ------------------------------------------------------------ view settings

  setFftSize(fftSize: FftSize): void {
    this.settings = { ...this.settings, fftSize };
    this.lastVersion = -1; // re-request tiles
    this.invalidate("view");
    this.publishSnapshot();
  }

  setPalette(palette: PaletteName): void {
    this.settings = { ...this.settings, palette };
    this.spectrogram.setPalette(palette);
    this.el.spectrogram.style.background = backgroundColor(palette);
    this.invalidate("spectrogram");
  }

  setLevels(levels: DbLevels): void {
    this.levelsChosen = true;
    this.settings = { ...this.settings, levels };
    this.spectrogram.setLevels(levels.floor, levels.ceil);
    this.invalidate("spectrogram");
  }

  /** Pick contrast from the background noise of the recently computed tiles. */
  autoLevels(): void {
    this.setLevels(autoLevels(this.recentTiles));
  }

  setFollowPlayback(followPlayback: boolean): void {
    this.settings = { ...this.settings, followPlayback };
    this.invalidate("playback");
  }

  // ----------------------------------------------------------------- playback

  toggleLoop(): void {
    this.loop = !this.loop;
    this.invalidate("playback");
  }

  setPlaybackRate(rate: number): void {
    this.player.setPlaybackRate(rate);
  }

  /** Time range covered by the selected boxes, or null. */
  get selectionRange(): [number, number] | null {
    const selection = this.doc.selection;
    if (selection.length === 0) return null;
    return [Math.min(...selection.map((b) => b.start)), Math.max(...selection.map((b) => b.end))];
  }

  togglePlay(): void {
    if (this.player.isPlaying) {
      this.player.pause();
      return;
    }
    const range = this.selectionRange;
    const from = this.player.position;
    // With the cursor inside the selection, play just the selection.
    if (range && from >= range[0] && from < range[1]) this.player.play(range[0], range[1], this.loop, from);
    else this.player.play(from);
  }

  /** Play the selection (or the visible range when nothing is selected). */
  playSelection(loop = this.loop): void {
    const [start, end] = this.selectionRange ?? [this.view.t0, this.view.t1];
    this.player.play(start, end, loop);
  }

  stop(): void {
    this.player.stop();
  }

  seek(time: number): void {
    this.player.seek(time);
  }

  // --------------------------------------------------------------- navigation

  zoomTimeAt(x: number, factor: number): void {
    this.view.zoomTimeAt(x, factor);
    this.userNavigated();
  }

  zoomTimeCentered(factor: number): void {
    // Keep the playhead in place when it is visible, like DAWs do.
    const pos = this.player.position;
    const x = pos >= this.view.t0 && pos <= this.view.t1 ? this.view.timeToX(pos) : this.view.width / 2;
    this.zoomTimeAt(x, factor);
  }

  zoomFreqAt(y: number, factor: number): void {
    this.view.zoomFreqAt(y, factor);
    this.userNavigated();
  }

  panByPx(dx: number, dy = 0): void {
    this.view.panByPx(dx, dy);
    this.userNavigated();
  }

  panToTime(centerTime: number): void {
    const half = this.view.visibleDuration / 2;
    this.view.setTimeRange(centerTime - half, centerTime + half);
    this.userNavigated();
  }

  fitAll(): void {
    this.view.fitAll();
    this.userNavigated();
  }

  resetFrequency(): void {
    this.view.setFreqRange(0, this.view.nyquist);
    this.userNavigated();
  }

  zoomToSelection(): void {
    const range = this.selectionRange;
    if (!range) return;
    const pad = (range[1] - range[0]) * 0.5;
    this.view.setTimeRange(range[0] - pad, range[1] + pad);
    this.userNavigated();
  }

  /** Bring a time range into view without changing the zoom unless it doesn't fit. */
  reveal(start: number, end: number): void {
    if (start >= this.view.t0 && end <= this.view.t1) return;
    if (end - start > this.view.visibleDuration * 0.8) {
      const pad = (end - start) * 0.5;
      this.view.setTimeRange(start - pad, end + pad);
    } else {
      const half = this.view.visibleDuration / 2;
      const center = (start + end) / 2;
      this.view.setTimeRange(center - half, center + half);
    }
    this.userNavigated();
  }

  /** Select the next (+1) or previous (−1) box in time and bring it into view. */
  selectAdjacent(direction: 1 | -1): void {
    const list = this.doc.boxes;
    if (list.length === 0) return;
    const selection = this.doc.selection;
    let next: number;
    if (selection.length > 0) {
      const anchor = direction > 0 ? selection[selection.length - 1] : selection[0];
      next = Math.min(list.length - 1, Math.max(0, list.indexOf(anchor) + direction));
    } else {
      // Start from the playhead position.
      const pos = this.player.position;
      next = direction > 0 ? list.findIndex((b) => b.start >= pos) : findLastIndex(list, (b) => b.start < pos);
      if (next < 0) next = direction > 0 ? list.length - 1 : 0;
    }
    const box = list[next];
    this.doc.select([box.id]);
    this.player.seek(box.start);
    this.reveal(box.start, box.end);
  }

  // ------------------------------------------------- gesture feedback (input)

  setHover(x: number | null, y: number | null, overSpectrogram: boolean, hoveredId: string | null): void {
    if (x === null) {
      this.hover = null;
      this.el.hoverLine.style.display = "none";
    } else {
      this.hover = { time: this.view.xToTime(x), freq: overSpectrogram && y !== null ? this.view.yToFreq(y) : null };
      this.el.hoverLine.style.display = "block";
      this.el.hoverLine.style.transform = `translateX(${x}px)`;
    }
    if (hoveredId !== this.hoveredId) {
      this.hoveredId = hoveredId;
      this.dirtyOverlay = true;
      this.schedule();
    }
    this.scheduleSnapshot();
  }

  /** Preview of a box being drawn or a selection rectangle. */
  setDraft(draft: Draft | null, snapGuide: number | null = null): void {
    this.draft = draft;
    this.snapGuide = snapGuide;
    this.dirtyOverlay = true;
    this.schedule();
  }

  // -------------------------------------------------------------- lifecycle

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.rafId);
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
    this.unsubscribeDoc();
    this.resizeObserver.disconnect();
    this.scheduler.destroy();
    this.spectrogram.destroy();
    this.player.destroy();
    this.listeners.clear();
  }

  // --------------------------------------------------------------- internals

  private userNavigated(): void {
    // Stop following playback when the user deliberately looks elsewhere.
    if (this.player.isPlaying) {
      const pos = this.player.position;
      if (pos < this.view.t0 || pos > this.view.t1) this.settings = { ...this.settings, followPlayback: false };
    }
    this.invalidate("view");
  }

  private invalidate(what: "view" | "spectrogram" | "overlay" | "playback"): void {
    if (what === "view") this.dirtyView = true;
    if (what === "spectrogram") this.dirtySpectrogram = true;
    if (what === "overlay") this.dirtyOverlay = true;
    this.schedule();
    // Continuous view changes are throttled; discrete commands update the UI at once
    // (controlled inputs such as sliders must not lag behind the user).
    if (what === "view") this.scheduleSnapshot();
    else this.publishSnapshot();
  }

  private schedule(): void {
    if (this.rafId || this.destroyed) return;
    this.rafId = requestAnimationFrame(this.frame);
  }

  private frame = (): void => {
    this.rafId = 0;
    if (this.destroyed) return;
    const started = performance.now();

    if (this.player.isPlaying) {
      const pos = this.player.position;
      if (this.settings.followPlayback) this.view.ensureVisible(pos);
      this.schedule(); // keep animating the playhead
      this.scheduleSnapshot();
    }

    const viewChanged = this.view.version !== this.lastVersion || this.dirtyView;
    if (viewChanged) {
      this.lastVersion = this.view.version;
      this.dirtyView = false;
      this.requestTiles();
      this.drawAxesAndWaveform();
      this.dirtySpectrogram = true;
      this.dirtyOverlay = true;
    }
    if (this.dirtySpectrogram) {
      this.dirtySpectrogram = false;
      this.spectrogram.draw(this.view, this.drawParams());
    }
    if (this.dirtyOverlay) {
      this.dirtyOverlay = false;
      this.drawOverlay();
    }
    if (this.dirtyMinimap) {
      this.dirtyMinimap = false;
      renderMinimapCache(
        this.minimapCache, this.el.minimap.clientWidth, this.el.minimap.clientHeight, this.dpr,
        this.view.duration, this.view.sampleRate, this.peaks,
      );
    }
    this.drawMinimap();
    this.positionPlayhead();
    this.slowestFrameMs = Math.max(this.slowestFrameMs, performance.now() - started);
  };

  private drawParams() {
    const { fftSize } = this.settings;
    return {
      fftSize,
      level: this.currentLevel(),
      maxLevel: maxLevel(fftSize, this.totalSamples),
      sampleRate: this.view.sampleRate,
      totalSamples: this.totalSamples,
    };
  }

  private currentLevel(): number {
    return chooseLevel(this.settings.fftSize, this.view.sampleRate, this.view.pxPerSec, this.dpr, this.totalSamples);
  }

  /** Visible tiles first (centre-out), then the neighbours for smooth panning. */
  private requestTiles(): void {
    const { fftSize } = this.settings;
    const level = this.currentLevel();
    const { t0, t1, visibleDuration, sampleRate } = this.view;
    const range = (a: number, b: number) => tileIndexRange(fftSize, level, sampleRate, this.totalSamples, a, b);

    const [first, last] = range(t0, t1);
    const center = (first + last) / 2;
    const visible: TileId[] = [];
    for (let i = first; i <= last; i++) visible.push({ fftSize, level, index: i });
    visible.sort((a, b) => Math.abs(a.index - center) - Math.abs(b.index - center));

    const margin = visibleDuration * PREFETCH_VIEWPORTS;
    const [pf, pl] = range(Math.max(0, t0 - margin), t1 + margin);
    const prefetch: TileId[] = [];
    for (let d = 1; first - d >= pf || last + d <= pl; d++) {
      if (last + d <= pl) prefetch.push({ fftSize, level, index: last + d });
      if (first - d >= pf) prefetch.push({ fftSize, level, index: first - d });
    }
    this.scheduler.request([...visible, ...prefetch]);
  }

  private handleTile(tile: ReadyTile): void {
    this.spectrogram.addTile(tile);
    this.recentTiles.push(tile.data);
    if (this.recentTiles.length > AUTO_LEVEL_SAMPLE_TILES) this.recentTiles.shift();
    if (!this.levelsChosen && (this.recentTiles.length >= AUTO_LEVEL_SAMPLE_TILES || this.scheduler.pendingCount === 0)) {
      this.autoLevels();
    }
    this.dirtySpectrogram = true;
    this.schedule();
    this.scheduleSnapshot();
  }

  private handleResize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const w = this.el.spectrogram.clientWidth;
    const h = this.el.spectrogram.clientHeight;
    this.spectrogram.resize(w, h, this.dpr);
    this.view.setSize(w, h);
    this.dirtyView = true;
    this.dirtyMinimap = true;
    this.schedule();
  }

  private drawAxesAndWaveform(): void {
    const { el, view, dpr } = this;
    const ruler = prepareCanvas(el.ruler, dpr);
    if (ruler) drawTimeRuler(ruler, view, el.ruler.clientHeight);
    const axis = prepareCanvas(el.freqAxis, dpr);
    if (axis) drawFreqAxis(axis, view, el.freqAxis.clientWidth);
    const wave = prepareCanvas(el.waveform, dpr);
    if (wave) drawWaveform(wave, view, this.peaks, el.waveform.clientHeight, this.envelope);
  }

  private drawOverlay(): void {
    const { el, view, dpr } = this;
    const state: OverlayState = {
      index: this.indexValue,
      selected: this.doc.selectedIds,
      hoveredId: this.hoveredId,
      draft: this.draft,
      snapGuide: this.snapGuide,
    };
    const overlay = prepareCanvas(el.overlay, dpr);
    if (overlay) drawBoxes(overlay, view, state);
    const lane = prepareCanvas(el.lane, dpr);
    if (lane) drawTimeLane(lane, view, state, el.lane.clientHeight);
  }

  private drawMinimap(): void {
    const ctx = prepareCanvas(this.el.minimap, this.dpr);
    if (ctx) {
      drawMinimap(ctx, this.minimapCache, this.view, this.indexValue, this.el.minimap.clientWidth, this.el.minimap.clientHeight);
    }
  }

  private positionPlayhead(): void {
    const x = this.view.timeToX(this.player.position);
    const visible = x >= -1 && x <= this.view.width + 1;
    this.el.playhead.style.display = visible ? "block" : "none";
    if (visible) this.el.playhead.style.transform = `translateX(${x}px)`;
  }

  private scheduleSnapshot(): void {
    if (this.snapshotTimer) return;
    const wait = Math.max(0, SNAPSHOT_INTERVAL_MS - (performance.now() - this.lastSnapshotAt));
    this.snapshotTimer = setTimeout(() => this.publishSnapshot(), wait);
  }

  private publishSnapshot(): void {
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
    this.snapshotTimer = null;
    if (this.destroyed) return;
    this.lastSnapshotAt = performance.now();
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((l) => l());
  }

  private buildSnapshot(): EditorSnapshot {
    const v = this.view;
    const labels = Array.from(new Set(this.doc.boxes.map((b) => b.label))).sort();
    return {
      duration: v.duration,
      sampleRate: v.sampleRate,
      t0: v.t0,
      t1: v.t1,
      f0: v.f0,
      f1: v.f1,
      playing: this.player.isPlaying,
      position: this.player.position,
      playbackRate: this.player.playbackRate,
      loop: this.loop,
      hover: this.hover,
      selection: this.doc.selection,
      boxCount: this.doc.boxes.length,
      activeLabel: this.doc.activeLabel,
      labels,
      canUndo: this.doc.canUndo,
      canRedo: this.doc.canRedo,
      pendingTiles: this.scheduler.pendingCount,
      workers: this.scheduler.workerCount,
      columnHop: hopForLevel(this.settings.fftSize, this.currentLevel()) / v.sampleRate,
      frameMs: this.takeSlowestFrame(),
      error: this.error,
      settings: this.settings,
    };
  }

  private takeSlowestFrame(): number {
    const ms = this.slowestFrameMs;
    this.slowestFrameMs = 0;
    return ms;
  }
}

function findLastIndex<T>(list: T[], predicate: (item: T) => boolean): number {
  for (let i = list.length - 1; i >= 0; i--) if (predicate(list[i])) return i;
  return -1;
}
