import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  AdjustmentsHorizontalIcon,
  ArrowLeftIcon,
  ArrowPathRoundedSquareIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ArrowsPointingOutIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  PauseIcon,
  PlayIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/24/solid";
import { Recording } from "../../types";
import { EditorEngine, EditorSnapshot } from "../EditorEngine";
import { SaveStatus } from "../edit/Autosaver";
import { FFT_SIZES, FftSize } from "../dsp/tiles";
import { PALETTES, PaletteName } from "../render/palettes";
import { formatDuration, formatTime } from "../render/ticks";
import { LabelChip } from "./LabelChip";

const PLAYBACK_RATES = [0.125, 0.25, 0.5, 1, 2];

export const BUTTON = "p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent";
const SELECT = "text-xs border border-gray-300 rounded px-1.5 py-1 bg-white disabled:opacity-50";
const DIVIDER = <div className="h-6 w-px bg-gray-200 shrink-0" />;

/**
 * Toolbar buttons must not take keyboard focus, otherwise Space would both
 * "click" the focused button and toggle playback.
 */
export const keepFocus = (e: React.MouseEvent) => e.preventDefault();

interface ToolbarProps {
  recording: Recording | null;
  engine: EditorEngine | null;
  snap: EditorSnapshot | null;
  saveStatus: SaveStatus;
  /** Previous/next recording and the Finished switch. */
  navigation: React.ReactNode;
  onHelp: () => void;
  onEditActiveLabel: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ recording, engine, snap, saveStatus, navigation, onHelp, onEditActiveLabel }) => {
  const disabled = !engine || !snap;
  const [showDisplay, setShowDisplay] = useState(false);

  return (
    <div className="relative flex items-center gap-3 px-3 h-12 shrink-0">
      <Link
        to={recording ? `/projects/${recording.project_id}` : "/projects"}
        className={BUTTON}
        title="Back to project"
      >
        <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
      </Link>
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate max-w-[16rem]" title={recording?.original_filename}>
          {recording?.original_filename ?? "…"}
        </div>
        <div className="text-[11px] text-gray-500">
          Editor v2 ·{" "}
          <Link to={`/recordings/${recording?.id ?? ""}/annotate`} className="underline hover:text-gray-700">
            classic editor
          </Link>
        </div>
      </div>
      {navigation}

      {DIVIDER}

      {/* Playback */}
      <button className={BUTTON} disabled={disabled} onMouseDown={keepFocus} onClick={() => engine?.togglePlay()} title="Play / pause (Space)">
        {snap?.playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
      </button>
      <span className="text-xs tabular-nums w-[4.5rem]">{snap ? formatTime(snap.position, 0.001) : "–"}</span>
      <select
        className={SELECT}
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
        className={`${BUTTON} ${snap?.loop ? "bg-blue-100 text-blue-700" : ""}`}
        disabled={disabled}
        onMouseDown={keepFocus}
        onClick={() => engine?.toggleLoop()}
        title="Loop the selection (Shift+Enter plays it looped)"
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

      {DIVIDER}

      {/* Editing */}
      <button className={BUTTON} disabled={!snap?.canUndo} onMouseDown={keepFocus} onClick={() => engine?.doc.undo()} title="Undo (Ctrl+Z)">
        <ArrowUturnLeftIcon className="h-5 w-5" />
      </button>
      <button className={BUTTON} disabled={!snap?.canRedo} onMouseDown={keepFocus} onClick={() => engine?.doc.redo()} title="Redo (Ctrl+Shift+Z)">
        <ArrowUturnRightIcon className="h-5 w-5" />
      </button>
      <div className="flex items-center gap-1.5 text-xs text-gray-600" title="Label for new boxes — press a letter A–Z to change it">
        New boxes:
        <LabelChip label={snap?.activeLabel ?? "None"} onClick={onEditActiveLabel} />
      </div>
      <SaveIndicator status={saveStatus} />

      <div className="flex-1" />

      {/* View */}
      <button className={BUTTON} disabled={disabled} onMouseDown={keepFocus} onClick={() => engine?.fitAll()} title="Show whole recording (0)">
        <ArrowsPointingOutIcon className="h-5 w-5" />
      </button>
      <span className="text-xs text-gray-600 tabular-nums w-24" title="Visible time span">
        {snap ? `view ${formatDuration(snap.t1 - snap.t0)}` : ""}
      </span>
      <button
        className={`${BUTTON} ${showDisplay ? "bg-gray-100" : ""}`}
        disabled={disabled}
        onMouseDown={keepFocus}
        onClick={() => setShowDisplay((v) => !v)}
        title="Display settings (FFT, colours, contrast)"
      >
        <AdjustmentsHorizontalIcon className="h-5 w-5 text-gray-600" />
      </button>
      <button className={BUTTON} onMouseDown={keepFocus} onClick={onHelp} title="Keyboard & mouse controls">
        <QuestionMarkCircleIcon className="h-5 w-5 text-gray-500" />
      </button>

      {showDisplay && engine && snap && <DisplayPanel engine={engine} snap={snap} />}
    </div>
  );
};

const SaveIndicator: React.FC<{ status: SaveStatus }> = ({ status }) => {
  switch (status) {
    case "saved":
      return (
        <span className="flex items-center gap-1 text-xs text-gray-500" title="All changes are saved">
          <CheckIcon className="h-4 w-4 text-green-600" /> Saved
        </span>
      );
    case "unsaved":
      return <span className="text-xs text-gray-500" title="Changes are saved automatically">● Unsaved</span>;
    case "saving":
      return <span className="text-xs text-gray-500">Saving…</span>;
    case "error":
      return (
        <span className="flex items-center gap-1 text-xs text-red-600" title="Saving failed — retrying automatically. Ctrl+S to retry now.">
          <ExclamationTriangleIcon className="h-4 w-4" /> Not saved — retrying
        </span>
      );
  }
};

const DisplayPanel: React.FC<{ engine: EditorEngine; snap: EditorSnapshot }> = ({ engine, snap }) => {
  const { levels } = snap.settings;
  const windowMs = (snap.settings.fftSize / snap.sampleRate) * 1000;
  return (
    <div className="absolute right-12 top-11 z-20 w-72 bg-white border border-gray-200 shadow-lg rounded-lg p-3 text-xs text-gray-700 space-y-3">
      <label className="flex items-center justify-between" title="Smaller = sharper in time, larger = sharper in frequency">
        <span>FFT window</span>
        <span className="flex items-center gap-2">
          <span className="text-gray-400">{windowMs.toFixed(1)} ms</span>
          <select className={SELECT} value={snap.settings.fftSize} onChange={(e) => engine.setFftSize(Number(e.target.value) as FftSize)}>
            {FFT_SIZES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </span>
      </label>
      <label className="flex items-center justify-between">
        <span>Colours</span>
        <select className={SELECT} value={snap.settings.palette} onChange={(e) => engine.setPalette(e.target.value as PaletteName)}>
          {PALETTES.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>
      <label className="block" title="Everything quieter than this is drawn as background">
        <div className="flex justify-between"><span>Noise floor</span><span className="tabular-nums">{levels.floor} dB</span></div>
        <input
          type="range" min={-130} max={-10} step={1} className="w-full" value={levels.floor}
          onChange={(e) => {
            const floor = Number(e.target.value);
            engine.setLevels({ floor, ceil: Math.max(levels.ceil, floor + 10) });
          }}
        />
      </label>
      <label className="block" title="Everything louder than this is drawn at full intensity">
        <div className="flex justify-between"><span>Maximum</span><span className="tabular-nums">{levels.ceil} dB</span></div>
        <input
          type="range" min={-120} max={0} step={1} className="w-full" value={levels.ceil}
          onChange={(e) => {
            const ceil = Number(e.target.value);
            engine.setLevels({ floor: Math.min(levels.floor, ceil - 10), ceil });
          }}
        />
      </label>
      <button
        className="w-full py-1 border border-gray-300 rounded hover:bg-gray-50"
        onMouseDown={keepFocus}
        onClick={() => engine.autoLevels()}
        title="Set contrast automatically from the background noise"
      >
        Auto contrast
      </button>
    </div>
  );
};
