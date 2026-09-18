import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeftIcon,
  ArrowPathRoundedSquareIcon,
  ArrowsPointingOutIcon,
  PauseIcon,
  PlayIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/24/solid";
import { annotationService, recordingService } from "../services/api";
import { Recording } from "../types";
import { EditorEngine, EditorSnapshot } from "../editor/EditorEngine";
import { NavigationInput } from "../editor/input/NavigationInput";
import { loadRecordingAudio } from "../editor/audio/loadAudio";
import { EditorBox, fromApiBoxes } from "../editor/core/boxes";
import { FFT_SIZES, FftSize } from "../editor/dsp/tiles";
import { PALETTES, PaletteName } from "../editor/render/palettes";
import { formatDuration, formatTime } from "../editor/render/ticks";

const PLAYBACK_RATES = [0.125, 0.25, 0.5, 1, 2];
const FREQ_AXIS_WIDTH = "w-14";

type LoadState =
  | { phase: "loading"; message: string; progress?: number }
  | { phase: "error"; message: string }
  | { phase: "ready" };

const noopSubscribe = () => () => undefined;
const noSnapshot = () => null;

const AnnotationEditorV2: React.FC = () => {
  const { recordingId } = useParams<{ recordingId: string }>();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [load, setLoad] = useState<LoadState>({ phase: "loading", message: "Loading recording…" });
  const [engine, setEngine] = useState<EditorEngine | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const plotAreaRef = useRef<HTMLDivElement>(null);
  const spectrogramZoneRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const freqAxisRef = useRef<HTMLCanvasElement>(null);
  const rulerRef = useRef<HTMLCanvasElement>(null);
  const laneRef = useRef<HTMLCanvasElement>(null);
  const waveformRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const hoverLineRef = useRef<HTMLDivElement>(null);

  // Load recording metadata, annotations and audio, then start the engine.
  useEffect(() => {
    const id = Number(recordingId);
    let cancelled = false;
    let created: EditorEngine | null = null;
    let input: NavigationInput | null = null;
    const abort = new AbortController();
    setRecording(null);
    setLoad({ phase: "loading", message: "Loading recording…" });

    (async () => {
      try {
        const [rec, annotations] = await Promise.all([
          recordingService.getRecording(id),
          annotationService.getAnnotations(id),
        ]);
        if (cancelled) return;
        setRecording(rec);
        const latest = annotations[annotations.length - 1];
        const boxes: EditorBox[] = fromApiBoxes(latest?.bounding_boxes ?? []);

        setLoad({ phase: "loading", message: "Downloading audio…", progress: 0 });
        const audio = await loadRecordingAudio(id, rec.sample_rate, (progress) => {
          if (cancelled) return;
          if (progress < 1) setLoad({ phase: "loading", message: "Downloading audio…", progress });
          else setLoad({ phase: "loading", message: "Decoding audio…" });
        }, abort.signal);
        if (cancelled) return;

        const root = rootRef.current;
        const spectrogram = glRef.current;
        const overlay = overlayRef.current;
        const freqAxis = freqAxisRef.current;
        const ruler = rulerRef.current;
        const lane = laneRef.current;
        const waveform = waveformRef.current;
        const minimap = minimapRef.current;
        const playhead = playheadRef.current;
        const hoverLine = hoverLineRef.current;
        const plotArea = plotAreaRef.current;
        const spectrogramZone = spectrogramZoneRef.current;
        if (
          !root || !spectrogram || !overlay || !freqAxis || !ruler || !lane || !waveform ||
          !minimap || !playhead || !hoverLine || !plotArea || !spectrogramZone
        ) {
          return;
        }
        created = new EditorEngine(
          { root, spectrogram, overlay, freqAxis, ruler, lane, waveform, minimap, playhead, hoverLine },
          audio,
          boxes,
        );
        input = new NavigationInput(created, { plotArea, spectrogram: spectrogramZone, minimap });
        setEngine(created);
        setLoad({ phase: "ready" });
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to open recording:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        setLoad({ phase: "error", message: `Could not open the recording: ${message}` });
      }
    })();

    return () => {
      cancelled = true;
      abort.abort();
      input?.destroy();
      created?.destroy();
      setEngine(null);
    };
  }, [recordingId]);

  const snap = useSyncExternalStore<EditorSnapshot | null>(
    engine ? engine.subscribe : noopSubscribe,
    engine ? engine.getSnapshot : noSnapshot,
  );

  return (
    <div className="h-screen flex flex-col bg-white text-gray-800 select-none">
      <Toolbar recording={recording} engine={engine} snap={snap} onHelp={() => setShowHelp((v) => !v)} />

      <div ref={rootRef} className="relative flex-1 flex flex-col min-h-0 border-t border-gray-200">
        {/* Minimap */}
        <div className="flex h-9 border-b border-gray-200">
          <div className={`${FREQ_AXIS_WIDTH} shrink-0`} />
          <canvas ref={minimapRef} className="flex-1 min-w-0 h-full block cursor-pointer touch-none" />
        </div>
        {/* Time ruler */}
        <div className="flex h-6">
          <div className={`${FREQ_AXIS_WIDTH} shrink-0 text-[10px] text-gray-400 flex items-end justify-end pr-2 pb-0.5`}>
            Hz
          </div>
          <canvas ref={rulerRef} className="flex-1 min-w-0 h-full block" />
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Frequency axis — mirrors the plot column layout so heights line up */}
          <div className={`${FREQ_AXIS_WIDTH} shrink-0 flex flex-col`}>
            <canvas ref={freqAxisRef} className="flex-1 min-h-0 w-full block" />
            <div className="h-4" />
            <div className="h-24" />
          </div>

          <div ref={plotAreaRef} className="relative flex-1 min-w-0 flex flex-col touch-none cursor-crosshair">
            <div ref={spectrogramZoneRef} data-zone="spectrogram" className="relative flex-1 min-h-0">
              <canvas ref={glRef} className="absolute inset-0 w-full h-full block" />
              <canvas ref={overlayRef} className="absolute inset-0 w-full h-full block" />
            </div>
            <canvas ref={laneRef} data-zone="lane" className="h-4 w-full block border-t border-gray-200" />
            <canvas ref={waveformRef} data-zone="waveform" className="h-24 w-full block border-t border-gray-200" />

            <div
              ref={playheadRef}
              className="absolute top-0 bottom-0 left-0 w-0.5 -ml-px bg-red-500 pointer-events-none will-change-transform"
              style={{ display: "none" }}
            />
            <div
              ref={hoverLineRef}
              className="absolute top-0 bottom-0 left-0 w-px bg-blue-500/40 pointer-events-none will-change-transform"
              style={{ display: "none" }}
            />
          </div>
        </div>

        {load.phase !== "ready" && <LoadingOverlay state={load} />}
        {snap?.error && <LoadingOverlay state={{ phase: "error", message: snap.error }} />}
        {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}
      </div>

      <StatusBar snap={snap} />
    </div>
  );
};

// ------------------------------------------------------------------ toolbar

const Toolbar: React.FC<{
  recording: Recording | null;
  engine: EditorEngine | null;
  snap: EditorSnapshot | null;
  onHelp: () => void;
}> = ({ recording, engine, snap, onHelp }) => {
  const disabled = !engine || !snap;
  const select = "text-xs border border-gray-300 rounded px-1.5 py-1 bg-white disabled:opacity-50";
  const button = "p-1.5 rounded hover:bg-gray-100 disabled:opacity-40";
  // Toolbar buttons must not take keyboard focus, otherwise Space would both
  // "click" the focused button and toggle playback.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="flex items-center gap-3 px-3 h-12 shrink-0">
      <Link
        to={recording ? `/projects/${recording.project_id}` : "/projects"}
        className={button}
        title="Back to project"
      >
        <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
      </Link>
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate max-w-xs" title={recording?.original_filename}>
          {recording?.original_filename ?? "…"}
        </div>
        <div className="text-[11px] text-gray-500">
          Editor v2 preview ·{" "}
          <Link to={`/recordings/${recording?.id ?? ""}/annotate`} className="underline hover:text-gray-700">
            open classic editor
          </Link>
        </div>
      </div>

      <div className="h-6 w-px bg-gray-200" />

      <button className={button} disabled={disabled} onMouseDown={keepFocus} onClick={() => engine?.togglePlay()} title="Play / pause (Space)">
        {snap?.playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
      </button>
      <span className="text-xs tabular-nums w-24">
        {snap ? formatTime(snap.position, 0.001) : "–"}
      </span>
      <select
        className={select}
        disabled={disabled}
        value={snap?.playbackRate ?? 1}
        onChange={(e) => engine?.setPlaybackRate(Number(e.target.value))}
        title="Playback speed (slower = lower pitch)"
      >
        {PLAYBACK_RATES.map((r) => (
          <option key={r} value={r}>{r}×</option>
        ))}
      </select>
      <button
        className={`${button} ${snap?.loop ? "bg-blue-100 text-blue-700" : ""}`}
        disabled={disabled}
        onMouseDown={keepFocus}
        onClick={() => engine?.toggleLoop()}
        title="Loop box / visible range (L)"
      >
        <ArrowPathRoundedSquareIcon className="h-5 w-5" />
      </button>
      <label className="flex items-center gap-1 text-xs text-gray-600" title="Scroll the view with playback">
        <input
          type="checkbox"
          disabled={disabled}
          checked={snap?.settings.followPlayback ?? true}
          onChange={(e) => engine?.setFollowPlayback(e.target.checked)}
        />
        Follow
      </label>

      <div className="h-6 w-px bg-gray-200" />

      <button className={button} disabled={disabled} onMouseDown={keepFocus} onClick={() => engine?.fitAll()} title="Show whole recording (0)">
        <ArrowsPointingOutIcon className="h-5 w-5" />
      </button>
      <span className="text-xs text-gray-600 tabular-nums w-28" title="Visible time span">
        {snap ? `view ${formatDuration(snap.t1 - snap.t0)}` : ""}
      </span>

      <div className="flex-1" />

      <label className="text-xs text-gray-600 flex items-center gap-1" title="FFT window: smaller = sharper in time, larger = sharper in frequency">
        FFT
        <select
          className={select}
          disabled={disabled}
          value={snap?.settings.fftSize ?? 1024}
          onChange={(e) => engine?.setFftSize(Number(e.target.value) as FftSize)}
        >
          {FFT_SIZES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
      <select
        className={select}
        disabled={disabled}
        value={snap?.settings.palette ?? "inverted-gray"}
        onChange={(e) => engine?.setPalette(e.target.value as PaletteName)}
        title="Colour map"
      >
        {PALETTES.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
      <LevelControls engine={engine} snap={snap} />

      <button className={button} onMouseDown={keepFocus} onClick={onHelp} title="Keyboard & mouse controls">
        <QuestionMarkCircleIcon className="h-5 w-5 text-gray-500" />
      </button>
    </div>
  );
};

const LevelControls: React.FC<{ engine: EditorEngine | null; snap: EditorSnapshot | null }> = ({ engine, snap }) => {
  const levels = snap?.settings.levels ?? { floor: -100, ceil: -30 };
  const disabled = !engine;
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      <label className="flex items-center gap-1" title="Everything quieter than this is drawn as background">
        Floor
        <input
          type="range" min={-130} max={-10} step={1} className="w-20" disabled={disabled}
          value={levels.floor}
          onChange={(e) => {
            const floor = Number(e.target.value);
            engine?.setLevels({ floor, ceil: Math.max(levels.ceil, floor + 10) });
          }}
        />
      </label>
      <label className="flex items-center gap-1" title="Everything louder than this is drawn at full intensity">
        Max
        <input
          type="range" min={-120} max={0} step={1} className="w-20" disabled={disabled}
          value={levels.ceil}
          onChange={(e) => {
            const ceil = Number(e.target.value);
            engine?.setLevels({ floor: Math.min(levels.floor, ceil - 10), ceil });
          }}
        />
      </label>
      <button
        className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        disabled={disabled}
        onClick={() => engine?.autoLevels()}
        title="Set contrast automatically from the background noise"
      >
        Auto
      </button>
    </div>
  );
};

// --------------------------------------------------------------- status bar

const StatusBar: React.FC<{ snap: EditorSnapshot | null }> = ({ snap }) => {
  if (!snap) return <div className="h-7 border-t border-gray-200 shrink-0" />;
  const { hover, selectedBox: box, settings, sampleRate } = snap;
  const windowMs = (settings.fftSize / sampleRate) * 1000;
  const binHz = sampleRate / settings.fftSize;

  return (
    <div className="h-7 border-t border-gray-200 shrink-0 flex items-center gap-6 px-3 text-xs text-gray-600 tabular-nums">
      <span className="w-48">
        {hover
          ? `${formatTime(hover.time, 0.001)}${hover.freq !== null ? ` · ${(hover.freq / 1000).toFixed(2)} kHz` : ""}`
          : "—"}
      </span>
      {box ? (
        <span className="text-gray-800">
          <b>{box.label}</b> · {formatTime(box.start, 0.001)} – {formatTime(box.end, 0.001)} ({formatDuration(box.end - box.start)})
          {box.fLow !== null && box.fHigh !== null && ` · ${(box.fLow / 1000).toFixed(2)}–${(box.fHigh / 1000).toFixed(2)} kHz`}
        </span>
      ) : (
        <span>{snap.boxCount} boxes · Tab to step through</span>
      )}
      <div className="flex-1" />
      <span title="Time between spectrogram columns at this zoom / FFT window length / frequency bin width">
        column {formatDuration(snap.columnHop)} · window {windowMs.toFixed(1)} ms · Δf {binHz.toFixed(0)} Hz
      </span>
      <span className="w-40 text-right" title="Spectrogram tiles being computed / main-thread time of the slowest recent frame">
        {snap.pendingTiles > 0 ? `computing ${snap.pendingTiles} tiles…` : `${snap.workers} workers`} · {snap.frameMs.toFixed(1)} ms
      </span>
    </div>
  );
};

// ------------------------------------------------------------ overlays

const LoadingOverlay: React.FC<{ state: LoadState }> = ({ state }) => (
  <div className="absolute inset-0 flex items-center justify-center bg-white/90">
    <div className="text-center">
      {state.phase === "error" ? (
        <p className="text-red-600 text-sm">{state.message}</p>
      ) : state.phase === "loading" ? (
        <>
          <p className="text-sm text-gray-600">{state.message}</p>
          {state.progress !== undefined && (
            <div className="mt-2 w-64 h-1.5 bg-gray-200 rounded">
              <div className="h-full bg-blue-500 rounded" style={{ width: `${Math.round(state.progress * 100)}%` }} />
            </div>
          )}
        </>
      ) : null}
    </div>
  </div>
);

const SHORTCUTS: [string, string][] = [
  ["Scroll / two-finger swipe", "Pan in time"],
  ["Ctrl/⌘ + scroll, pinch", "Zoom time at cursor"],
  ["Alt + scroll", "Zoom frequency at cursor"],
  ["Shift + scroll", "Pan in frequency"],
  ["Drag", "Pan"],
  ["Click", "Select box / move playback cursor"],
  ["Double-click box", "Play box"],
  ["Space", "Play / pause"],
  ["Enter", "Play selected box (or visible range)"],
  ["L", "Loop on/off"],
  ["Tab / Shift+Tab", "Next / previous box"],
  ["+ / −", "Zoom in / out"],
  ["0 or Shift+1", "Show whole recording"],
  ["Shift+2", "Zoom to selected box"],
  ["F", "Reset frequency zoom"],
  ["← / → (Shift = faster)", "Pan"],
  ["Home / End", "Start / end"],
  ["Esc", "Stop / deselect"],
];

const HelpPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="absolute right-3 top-3 w-80 bg-white shadow-lg border border-gray-200 rounded-lg p-4 text-xs z-10">
    <div className="flex justify-between items-center mb-2">
      <h3 className="font-semibold text-sm">Controls</h3>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
    </div>
    <table className="w-full">
      <tbody>
        {SHORTCUTS.map(([key, action]) => (
          <tr key={key}>
            <td className="py-0.5 pr-2 text-gray-500 whitespace-nowrap">{key}</td>
            <td className="py-0.5">{action}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default AnnotationEditorV2;
