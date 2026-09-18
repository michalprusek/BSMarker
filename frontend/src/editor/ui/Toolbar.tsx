import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Cog6ToothIcon,
  ArrowLeftIcon,
  ArrowPathRoundedSquareIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ArrowsPointingOutIcon,
  CheckIcon,
  ChevronDoubleRightIcon,
  ExclamationTriangleIcon,
  ListBulletIcon,
  LockClosedIcon,
  PauseIcon,
  PlayIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/24/solid";
import { Recording } from "../../types";
import { EditorEngine, EditorSnapshot } from "../EditorEngine";
import { NO_LABEL } from "../core/boxes";
import { SaveStatus } from "../edit/Autosaver";
import { FFT_SIZES, FftSize } from "../dsp/tiles";
import { PALETTES, PaletteName } from "../render/palettes";
import { formatDuration, formatTime } from "../render/ticks";
import { LabelChip } from "./LabelChip";
import { Tip } from "./Tip";
import { useDismiss } from "./useDismiss";

const PLAYBACK_RATES = [0.125, 0.25, 0.5, 1, 2];

export const BUTTON =
  "p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent";
/** A button that switches something on and off: highlighted while on. */
export const toggleButton = (on: boolean) =>
  `${BUTTON} flex items-center gap-1 ${on ? "bg-blue-100 text-blue-700 hover:bg-blue-100" : "text-gray-600"}`;
const SELECT =
  "text-xs border border-gray-300 rounded px-1.5 py-1 bg-white disabled:opacity-50";
const DIVIDER = <div className="h-6 w-px bg-gray-200 shrink-0 mx-1" />;

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
  helpButtonRef: React.RefObject<HTMLButtonElement>;
  onHelp: () => void;
  onEditActiveLabel: () => void;
  listOpen: boolean;
  onToggleList: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  recording,
  engine,
  snap,
  saveStatus,
  navigation,
  helpButtonRef,
  onHelp,
  onEditActiveLabel,
  listOpen,
  onToggleList,
}) => {
  const disabled = !engine || !snap;
  const [showDisplay, setShowDisplay] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const loop = snap?.loop ?? false;
  const follow = snap?.settings.followPlayback ?? true;

  return (
    <div className="relative flex items-center gap-1 px-3 h-12 shrink-0 whitespace-nowrap">
      {/* Recording */}
      <Tip title="Back to project" body="The recording list of this project.">
        <Link
          to={recording ? `/projects/${recording.project_id}` : "/projects"}
          className={BUTTON}
        >
          <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
        </Link>
      </Tip>
      <div className="min-w-0 ml-1 mr-2">
        <div
          className="text-sm font-semibold truncate max-w-[12rem] 2xl:max-w-[20rem]"
          title={recording?.original_filename}
        >
          {recording?.original_filename ?? "…"}
        </div>
        <div className="text-[11px] text-gray-500 tabular-nums">
          {recording?.duration ? formatDuration(recording.duration) : ""}
          {recording?.sample_rate
            ? ` · ${recording.sample_rate / 1000} kHz`
            : ""}
        </div>
      </div>
      {navigation}

      {DIVIDER}

      {/* Playback */}
      <Tip
        title={snap?.playing ? "Pause" : "Play"}
        body={
          snap?.playing
            ? "Stops playback where it is."
            : "Plays from the cursor. Enter plays only the selected box."
        }
        keys="Space"
      >
        <button
          className={BUTTON}
          disabled={disabled}
          onMouseDown={keepFocus}
          onClick={() => engine?.togglePlay()}
        >
          {snap?.playing ? (
            <PauseIcon className="h-5 w-5" />
          ) : (
            <PlayIcon className="h-5 w-5" />
          )}
        </button>
      </Tip>
      <span className="text-xs tabular-nums w-[4.5rem] text-gray-700">
        {snap ? formatTime(snap.position, 0.001) : "–"}
      </span>
      <Tip
        title="Playback speed"
        body="Slower playback also lowers the pitch — handy for fast trills."
      >
        <select
          className={`${SELECT} w-16`}
          disabled={disabled}
          value={snap?.playbackRate ?? 1}
          onChange={(e) => engine?.setPlaybackRate(Number(e.target.value))}
        >
          {PLAYBACK_RATES.map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
      </Tip>
      <Tip
        title={loop ? "Loop: on" : "Loop: off"}
        body={
          loop
            ? "Playback repeats until you stop it. Click to play just once."
            : "Click to repeat playback in a loop — e.g. to listen to one syllable over and over."
        }
        keys="⇧ Enter"
      >
        <button
          className={toggleButton(loop)}
          disabled={disabled}
          onMouseDown={keepFocus}
          onClick={() => engine?.toggleLoop()}
        >
          <ArrowPathRoundedSquareIcon className="h-5 w-5" />
        </button>
      </Tip>
      <Tip
        title={follow ? "Follow playback: on" : "Follow playback: off"}
        body={
          follow
            ? "The view scrolls along so the playhead stays visible. Click to keep the view still while playing."
            : "The view stays still while playing. Click to let it scroll along with the playhead."
        }
      >
        <button
          className={`${toggleButton(follow)} pr-2`}
          disabled={disabled}
          onMouseDown={keepFocus}
          onClick={() => engine?.setFollowPlayback(!follow)}
        >
          <ChevronDoubleRightIcon className="h-4 w-4" />
          <span className="text-xs font-medium">Follow</span>
        </button>
      </Tip>

      {DIVIDER}

      {/* Editing */}
      {snap?.readOnly ? (
        <Tip
          title="Read-only"
          body="You can view and play this recording, but not change its annotations: the project belongs to another user. Ask an administrator for access."
        >
          <span className="flex items-center gap-1 px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs font-medium">
            <LockClosedIcon className="h-4 w-4" /> Read-only
          </span>
        </Tip>
      ) : (
        <>
          <Tip title="Undo" keys="Ctrl Z">
            <button
              className={BUTTON}
              disabled={!snap?.canUndo}
              onMouseDown={keepFocus}
              onClick={() => engine?.doc.undo()}
            >
              <ArrowUturnLeftIcon className="h-5 w-5" />
            </button>
          </Tip>
          <Tip title="Redo" keys="Ctrl ⇧ Z">
            <button
              className={BUTTON}
              disabled={!snap?.canRedo}
              onMouseDown={keepFocus}
              onClick={() => engine?.doc.redo()}
            >
              <ArrowUturnRightIcon className="h-5 w-5" />
            </button>
          </Tip>
          <ActiveLabel
            label={snap?.activeLabel ?? NO_LABEL}
            onClick={onEditActiveLabel}
          />
          <SaveIndicator status={saveStatus} />
        </>
      )}

      <div className="flex-1" />

      {/* View and panels */}
      <Tip
        title="Show whole recording"
        body="Zooms out to fit the recording."
        keys="0"
      >
        <button
          className={BUTTON}
          disabled={disabled}
          onMouseDown={keepFocus}
          onClick={() => engine?.fitAll()}
        >
          <ArrowsPointingOutIcon className="h-5 w-5 text-gray-600" />
        </button>
      </Tip>
      <Tip
        title="Display settings"
        body="Frequency floor, FFT window, colours and contrast."
      >
        <button
          ref={settingsButtonRef}
          className={`${BUTTON} ${showDisplay ? "bg-gray-100" : ""}`}
          disabled={disabled}
          onMouseDown={keepFocus}
          onClick={() => setShowDisplay((v) => !v)}
        >
          <Cog6ToothIcon className="h-5 w-5 text-gray-600" />
        </button>
      </Tip>
      <Tip
        title={listOpen ? "Hide box list" : "Show box list"}
        body="All boxes in time order, label filter, conflicts and listen-through review."
      >
        <button
          className={`${BUTTON} ${listOpen ? "bg-gray-100" : ""}`}
          onMouseDown={keepFocus}
          onClick={onToggleList}
        >
          <ListBulletIcon className="h-5 w-5 text-gray-600" />
        </button>
      </Tip>
      <Tip title="Controls" body="All keyboard and mouse controls.">
        <button
          ref={helpButtonRef}
          className={BUTTON}
          onMouseDown={keepFocus}
          onClick={onHelp}
        >
          <QuestionMarkCircleIcon className="h-5 w-5 text-gray-500" />
        </button>
      </Tip>

      {showDisplay && engine && snap && (
        <DisplayPanel
          engine={engine}
          snap={snap}
          toggleRef={settingsButtonRef}
          onClose={() => setShowDisplay(false)}
        />
      )}
    </div>
  );
};

/** "New box: [A]" — the label that newly drawn boxes get. */
const ActiveLabel: React.FC<{ label: string; onClick: () => void }> = ({
  label,
  onClick,
}) => {
  const none = label === NO_LABEL;
  return (
    <Tip
      title="Label for new boxes"
      body={
        none
          ? "New boxes get no label yet. With nothing selected, press a letter A–Z — or click to type a longer label."
          : `New boxes get label ${label}. With nothing selected, press another letter A–Z — or click to type a longer label.`
      }
    >
      <span className="flex items-center gap-1.5 text-xs text-gray-500 mx-2">
        New box
        {none ? (
          <button
            type="button"
            onMouseDown={keepFocus}
            onClick={onClick}
            className="px-1.5 py-0.5 rounded border border-dashed border-gray-400 text-gray-400 text-xs font-semibold min-w-[1.5rem] hover:bg-gray-50"
          >
            –
          </button>
        ) : (
          <LabelChip label={label} onClick={onClick} title="" />
        )}
      </span>
    </Tip>
  );
};

const SaveIndicator: React.FC<{ status: SaveStatus }> = ({ status }) => {
  switch (status) {
    case "saved":
      return (
        <Tip title="Saved" body="All changes are saved. Saving is automatic.">
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <CheckIcon className="h-4 w-4 text-green-600" /> Saved
          </span>
        </Tip>
      );
    case "unsaved":
      return (
        <Tip
          title="Unsaved changes"
          body="They are saved automatically in a moment."
          keys="Ctrl S"
        >
          <span className="text-xs text-gray-500">● Unsaved</span>
        </Tip>
      );
    case "saving":
      return <span className="text-xs text-gray-500">Saving…</span>;
    case "rejected":
      return (
        <Tip
          title="Can't save"
          body="The server refused to save (no permission for this project). Your changes are kept in this browser."
        >
          <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
            <ExclamationTriangleIcon className="h-4 w-4" /> Can't save — no
            permission
          </span>
        </Tip>
      );
    case "error":
      return (
        <Tip
          title="Not saved"
          body="Saving failed — retrying automatically. Your changes are kept in this browser meanwhile."
          keys="Ctrl S"
        >
          <span className="flex items-center gap-1 text-xs text-red-600">
            <ExclamationTriangleIcon className="h-4 w-4" /> Not saved — retrying
          </span>
        </Tip>
      );
  }
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
    {children}
  </div>
);

const DisplayPanel: React.FC<{
  engine: EditorEngine;
  snap: EditorSnapshot;
  toggleRef: React.RefObject<HTMLButtonElement>;
  onClose: () => void;
}> = ({ engine, snap, toggleRef, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose, [toggleRef]);
  const { levels } = snap.settings;
  const windowMs = (snap.settings.fftSize / snap.sampleRate) * 1000;
  const binHz = snap.sampleRate / snap.settings.fftSize;
  return (
    <div
      ref={ref}
      className="absolute right-12 top-11 z-30 w-72 whitespace-normal bg-white border border-gray-200 shadow-lg rounded-lg p-3 text-xs text-gray-700 space-y-3"
    >
      <SectionTitle>Annotation</SectionTitle>
      <FloorSetting engine={engine} snap={snap} />

      <hr className="border-gray-200" />
      <SectionTitle>Spectrogram</SectionTitle>
      <div className="space-y-1">
        <label className="flex items-center justify-between">
          <span>FFT window</span>
          <select
            className={SELECT}
            value={snap.settings.fftSize}
            onChange={(e) =>
              engine.setFftSize(Number(e.target.value) as FftSize)
            }
          >
            {FFT_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[11px] text-gray-400">
          {windowMs.toFixed(1)} ms · {binHz.toFixed(0)} Hz per row. Smaller =
          sharper in time, larger = sharper in frequency.
        </p>
      </div>
      <label className="flex items-center justify-between">
        <span>Colours</span>
        <select
          className={SELECT}
          value={snap.settings.palette}
          onChange={(e) => engine.setPalette(e.target.value as PaletteName)}
        >
          {PALETTES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <div className="flex justify-between">
          <span>Noise floor</span>
          <span className="tabular-nums">{levels.floor} dB</span>
        </div>
        <input
          type="range"
          min={-130}
          max={-10}
          step={1}
          className="w-full"
          value={levels.floor}
          onChange={(e) => {
            const floor = Number(e.target.value);
            engine.setLevels({
              floor,
              ceil: Math.max(levels.ceil, floor + 10),
            });
          }}
        />
        <span className="text-[11px] text-gray-400">
          Quieter than this is drawn as background.
        </span>
      </label>
      <label className="block">
        <div className="flex justify-between">
          <span>Maximum</span>
          <span className="tabular-nums">{levels.ceil} dB</span>
        </div>
        <input
          type="range"
          min={-120}
          max={0}
          step={1}
          className="w-full"
          value={levels.ceil}
          onChange={(e) => {
            const ceil = Number(e.target.value);
            engine.setLevels({
              floor: Math.min(levels.floor, ceil - 10),
              ceil,
            });
          }}
        />
        <span className="text-[11px] text-gray-400">
          Louder than this is drawn at full intensity.
        </span>
      </label>
      <Tip
        className="block"
        title="Auto contrast"
        body="Sets noise floor and maximum from the background noise of this recording."
      >
        <button
          className="w-full py-1 border border-gray-300 rounded hover:bg-gray-50"
          onMouseDown={keepFocus}
          onClick={() => engine.autoLevels()}
        >
          Auto contrast
        </button>
      </Tip>
    </div>
  );
};

/** Frequency floor for this recording: boxes can't go below it. */
const FloorSetting: React.FC<{
  engine: EditorEngine;
  snap: EditorSnapshot;
}> = ({ engine, snap }) => {
  const floor = snap.freqFloor;
  const nyquistKhz = snap.sampleRate / 2000;
  return (
    <div className="space-y-1.5">
      <label className="flex items-center justify-between">
        <span>Frequency floor</span>
        <input
          type="checkbox"
          checked={floor !== null}
          onChange={(e) => engine.setFreqFloor(e.target.checked ? 1000 : null)}
        />
      </label>
      {floor !== null && (
        <label className="flex items-center justify-between">
          <span className="text-gray-500">Boxes stay above</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={nyquistKhz}
              step={0.1}
              value={(floor / 1000).toFixed(1)}
              onChange={(e) => {
                const khz = Number(e.target.value);
                if (Number.isFinite(khz)) engine.setFreqFloor(khz * 1000);
              }}
              className="w-16 border border-gray-300 rounded px-1.5 py-0.5 text-right"
            />
            kHz
          </span>
        </label>
      )}
      <p className="text-[11px] text-gray-400">
        A line under which boxes can't be drawn, moved or resized — keeps them
        off low-frequency noise. Drag the dashed line on the spectrogram to move
        it. Remembered for this recording in this browser.
      </p>
    </div>
  );
};
