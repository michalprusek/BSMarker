import { Viewport } from "./core/Viewport";
import { BoxIndex, EditorBox } from "./core/boxes";
import { AudioPlayer } from "./audio/AudioPlayer";
import { DecodedAudio } from "./audio/loadAudio";
import { TileScheduler, ReadyTile } from "./dsp/TileScheduler";
import { WaveformPeaks } from "./dsp/WaveformPeaks";
import { DbLevels, autoLevels } from "./dsp/levels";
import {
  FftSize, TileId, chooseLevel, hopForLevel, maxLevel, tileIndexRange,
} from "./dsp/tiles";
import { SpectrogramRenderer } from "./render/SpectrogramRenderer";
import { PaletteName, backgroundColor } from "./render/palettes";
import {
  EnvelopeBuffers, drawBoxes, drawFreqAxis, drawMinimap, drawTimeLane, drawTimeRuler,
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
  pxPerSec: number;
  f0: number;
  f1: number;
  isFreqZoomed: boolean;
  playing: boolean;
  position: number;
  playbackRate: number;
  loop: boolean;
  hover: { time: number; freq: number | null } | null;
  selectedBox: EditorBox | null;
  boxCount: number;
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
 * Imperative core of the annotation editor. React only mounts it and renders
 * controls; all per-frame work (drawing, playhead, input) happens here, off
 * the React render path.
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

  private boxes: BoxIndex;
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private hover: { time: number; freq: number | null } | null = null;
  private loop = false;
  private settings: EditorSettings;
  /** Most recent tile data, kept for automatic contrast. */
  private recentTiles: Uint8Array[] = [];
  private levelsChosen = false;

  private dpr = window.devicePixelRatio || 1;
  private rafId = 0;
  private dirtyView = true; // everything that depends on the viewport
  private dirtySpectrogram = true;
  private dirtyOverlay = true; // boxes / selection / hover
  private dirtyMinimap = true;
  private lastVersion = -1;
  private listeners = new Set<() => void>();
  private snapshot: EditorSnapshot;
  private lastSnapshotAt = 0;
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private slowestFrameMs = 0;
  private error: string | null = null;

  constructor(
    private readonly el: EditorElements,
    audio: DecodedAudio,
    boxes: EditorBox[],
    settings: Partial<EditorSettings> = {},
  ) {
    this.totalSamples = audio.pcm.length;
    this.view = new Viewport(audio.duration, audio.sampleRate);
    this.player = new AudioPlayer(audio.buffer);
    this.player.onStateChange = () => this.invalidate("playback");
    this.peaks = new WaveformPeaks(audio.pcm);
    this.boxes = new BoxIndex(boxes);
    this.settings = {
      fftSize: 1024,
      palette: "inverted-gray",
      levels: { floor: -100, ceil: -30 },
      followPlayback: true,
      ...settings,
    };

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

  // ------------------------------------------------------------------ commands

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

  toggleLoop(): void {
    this.loop = !this.loop;
    this.invalidate("playback");
  }

  setPlaybackRate(rate: number): void {
    this.player.setPlaybackRate(rate);
  }

  togglePlay(): void {
    if (this.player.isPlaying) {
      this.player.pause();
      return;
    }
    const box = this.selectedBox;
    const from = this.player.position;
    // With a selected box and the cursor inside it, play just the box.
    if (box && from >= box.start && from < box.end) this.player.play(box.start, box.end, this.loop, from);
    else this.player.play(from);
  }

  /** Play a box (or the visible range when nothing is selected). */
  playSelection(): void {
    const box = this.selectedBox;
    if (box) this.player.play(box.start, box.end, this.loop);
    else this.player.play(this.view.t0, this.view.t1, this.loop);
  }

  stop(): void {
    this.player.stop();
  }

  seek(time: number): void {
    this.player.seek(time);
  }

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
    this.invalidate("view");
  }

  zoomToSelection(): void {
    const box = this.selectedBox;
    if (!box) return;
    const pad = (box.end - box.start) * 0.5;
    this.view.setTimeRange(box.start - pad, box.end + pad);
    this.userNavigated();
  }

  select(id: string | null): void {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.invalidate("overlay");
  }

  /** Select the next (+1) or previous (−1) box in time and bring it into view. */
  selectAdjacent(direction: 1 | -1): void {
    const list = this.boxes.boxes;
    if (list.length === 0) return;
    const current = this.selectedId ? this.boxes.indexOf(this.selectedId) : -1;
    let next: number;
    if (current >= 0) {
      next = Math.min(list.length - 1, Math.max(0, current + direction));
    } else {
      // Start from the playhead position.
      const pos = this.player.position;
      next = direction > 0 ? list.findIndex((b) => b.start >= pos) : findLastIndex(list, (b) => b.start < pos);
      if (next < 0) next = direction > 0 ? list.length - 1 : 0;
    }
    const box = list[next];
    this.select(box.id);
    this.player.seek(box.start);
    if (box.start < this.view.t0 || box.end > this.view.t1) {
      if (box.end - box.start > this.view.visibleDuration * 0.8) this.zoomToSelection();
      else this.panToTime((box.start + box.end) / 2);
    }
  }

  get selectedBox(): EditorBox | null {
    if (!this.selectedId) return null;
    const i = this.boxes.indexOf(this.selectedId);
    return i >= 0 ? this.boxes.boxes[i] : null;
  }

  // ------------------------------------------------------ pointer queries (input)

  /** Box under a point of the spectrogram (CSS px relative to the plot). */
  boxAtSpectrogram(x: number, y: number): EditorBox | null {
    return this.boxes.hitTest(this.view.xToTime(x), this.view.yToFreq(y));
  }

  /** Box under a point of the time lane / waveform (time only). */
  boxAtTime(x: number): EditorBox | null {
    return this.boxes.hitTest(this.view.xToTime(x), null, 2 / this.view.pxPerSec);
  }

  setHover(x: number | null, y: number | null, overSpectrogram: boolean): void {
    if (x === null) {
      this.hover = null;
      this.el.hoverLine.style.display = "none";
      if (this.hoveredId) {
        this.hoveredId = null;
        this.dirtyOverlay = true;
      }
      this.schedule();
      this.scheduleSnapshot();
      return;
    }
    const time = this.view.xToTime(x);
    const freq = overSpectrogram && y !== null ? this.view.yToFreq(y) : null;
    this.hover = { time, freq };
    this.el.hoverLine.style.display = "block";
    this.el.hoverLine.style.transform = `translateX(${x}px)`;
    const box = overSpectrogram && y !== null ? this.boxAtSpectrogram(x, y) : this.boxAtTime(x);
    const id = box ? box.id : null;
    if (id !== this.hoveredId) {
      this.hoveredId = id;
      this.dirtyOverlay = true;
      this.schedule();
    }
    this.scheduleSnapshot();
  }

  // -------------------------------------------------------------- lifecycle

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.rafId);
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
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
    if (what === "overlay") {
      this.dirtyOverlay = true;
      this.dirtyMinimap = true;
    }
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
        this.view.duration, this.view.sampleRate, this.peaks, this.boxes,
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
    const overlay = prepareCanvas(el.overlay, dpr);
    if (overlay) drawBoxes(overlay, view, this.boxes, this.selectedId, this.hoveredId);
    const lane = prepareCanvas(el.lane, dpr);
    if (lane) drawTimeLane(lane, view, this.boxes, el.lane.clientHeight, this.selectedId);
  }

  private drawMinimap(): void {
    const ctx = prepareCanvas(this.el.minimap, this.dpr);
    if (ctx) drawMinimap(ctx, this.minimapCache, this.view, this.el.minimap.clientWidth, this.el.minimap.clientHeight);
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
    return {
      duration: v.duration,
      sampleRate: v.sampleRate,
      t0: v.t0,
      t1: v.t1,
      pxPerSec: v.pxPerSec,
      f0: v.f0,
      f1: v.f1,
      isFreqZoomed: v.isFreqZoomed,
      playing: this.player.isPlaying,
      position: this.player.position,
      playbackRate: this.player.playbackRate,
      loop: this.loop,
      hover: this.hover,
      selectedBox: this.selectedBox,
      boxCount: this.boxes.boxes.length,
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
