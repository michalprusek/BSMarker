import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api, { annotationService, recordingService } from "../services/api";
import { Recording } from "../types";
import { EditorEngine, EditorSnapshot } from "../editor/EditorEngine";
import { EditorInput, isFormControl } from "../editor/input/EditorInput";
import { loadRecordingAudio } from "../editor/audio/loadAudio";
import { ApiBoxPayload, EditorBox, fromApiBoxes, toApiBoxes } from "../editor/core/boxes";
import { AnnotationDocument } from "../editor/edit/AnnotationDocument";
import { Autosaver, SaveStatus } from "../editor/edit/Autosaver";
import { Toolbar } from "../editor/ui/Toolbar";
import { StatusBar } from "../editor/ui/StatusBar";
import { HelpPanel } from "../editor/ui/HelpPanel";
import { LabelEditor } from "../editor/ui/LabelEditor";
import { RecordingNav, useNeighbours } from "../editor/ui/RecordingNav";

const FREQ_AXIS_WIDTH = "w-14";

type LoadState =
  | { phase: "loading"; message: string; progress?: number }
  | { phase: "error"; message: string }
  | { phase: "ready" };

/** What the label editor (F2) is editing. */
type LabelTarget = "selection" | "active" | null;

const noopSubscribe = () => () => undefined;
const noSnapshot = () => null;

const annotationUrl = (recordingId: number) => `/annotations/${recordingId}`;

const AnnotationEditorV2: React.FC = () => {
  const { recordingId } = useParams<{ recordingId: string }>();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [load, setLoad] = useState<LoadState>({ phase: "loading", message: "Loading recording…" });
  const [engine, setEngine] = useState<EditorEngine | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [showHelp, setShowHelp] = useState(false);
  const [labelTarget, setLabelTarget] = useState<LabelTarget>(null);

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

  const navigate = useNavigate();
  const neighbours = useNeighbours(recording);
  const goTo = useCallback((id: number) => navigate(`/recordings/${id}/annotate-v2`), [navigate]);

  // Page Up / Page Down switch recordings — also while one is still loading,
  // so you can skip through a project quickly.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isFormControl(e.target) || (e.code !== "PageUp" && e.code !== "PageDown")) return;
      e.preventDefault();
      const target = e.code === "PageDown" ? neighbours?.next : neighbours?.prev;
      if (target) goTo(target);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [neighbours, goTo]);

  // Load recording metadata, annotations and audio, then start the editor.
  useEffect(() => {
    const id = Number(recordingId);
    let cancelled = false;
    let created: EditorEngine | null = null;
    let input: EditorInput | null = null;
    let autosaver: Autosaver | null = null;
    let onBeforeUnload: (() => void) | null = null;
    const abort = new AbortController();
    setRecording(null);
    setLoad({ phase: "loading", message: "Loading recording…" });
    setSaveStatus("saved");

    (async () => {
      try {
        const [rec, annotations] = await Promise.all([
          recordingService.getRecording(id),
          annotationService.getAnnotations(id),
        ]);
        if (cancelled) return;
        setRecording(rec);
        const latest = annotations[annotations.length - 1];
        const doc = new AnnotationDocument(fromApiBoxes(latest?.bounding_boxes ?? []));

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

        const payload = (boxes: EditorBox[]) => toApiBoxes(boxes, audio.duration, audio.sampleRate / 2);
        autosaver = new Autosaver(
          doc,
          async (boxes) => {
            await api.post(annotationUrl(id), { recording_id: id, bounding_boxes: payload(boxes) });
          },
          setSaveStatus,
        );
        const saver = autosaver;

        created = new EditorEngine(
          { root, spectrogram, overlay, freqAxis, ruler, lane, waveform, minimap, playhead, hoverLine },
          audio,
          doc,
        );
        input = new EditorInput(created, { plotArea, spectrogram: spectrogramZone, lane, minimap, ruler, freqAxis }, {
          save: () => void saver.flush(),
          editLabel: () => setLabelTarget("selection"),
        });

        // Closing the tab: send pending changes with a request that outlives the page.
        onBeforeUnload = () => {
          if (doc.isDirty) saveOnUnload(id, payload(doc.boxes));
        };
        window.addEventListener("beforeunload", onBeforeUnload);

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
      if (onBeforeUnload) window.removeEventListener("beforeunload", onBeforeUnload);
      input?.destroy();
      created?.destroy();
      // Leaving the editor inside the app: finish saving in the background.
      if (autosaver) {
        const pending = autosaver;
        void pending.flush().finally(() => pending.destroy());
      }
      setEngine(null);
    };
  }, [recordingId]);

  const snap = useSyncExternalStore<EditorSnapshot | null>(
    engine ? engine.subscribe : noopSubscribe,
    engine ? engine.getSnapshot : noSnapshot,
  );

  const applyLabel = useCallback(
    (label: string) => {
      if (!engine) return;
      if (labelTarget === "selection") engine.doc.setLabel(engine.doc.selectedIds, label);
      else engine.doc.setActiveLabel(label);
    },
    [engine, labelTarget],
  );

  return (
    <div className="h-screen flex flex-col bg-white text-gray-800 select-none">
      <Toolbar
        recording={recording}
        engine={engine}
        snap={snap}
        saveStatus={saveStatus}
        navigation={recording && <RecordingNav recording={recording} neighbours={neighbours} onNavigate={goTo} />}
        onHelp={() => setShowHelp((v) => !v)}
        onEditActiveLabel={() => setLabelTarget("active")}
      />

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
          <canvas
            ref={rulerRef}
            className="flex-1 min-w-0 h-full block cursor-grab touch-none"
            title="Drag to pan · scroll to zoom · double-click to show all"
          />
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Frequency axis — mirrors the plot column layout so heights line up */}
          <div className={`${FREQ_AXIS_WIDTH} shrink-0 flex flex-col`}>
            <canvas
              ref={freqAxisRef}
              className="flex-1 min-h-0 w-full block cursor-grab touch-none"
              title="Drag to pan · scroll to zoom · double-click to reset"
            />
            <div className="h-5" />
            <div className="h-24" />
          </div>

          <div ref={plotAreaRef} className="relative flex-1 min-w-0 flex flex-col touch-none cursor-crosshair">
            <div ref={spectrogramZoneRef} className="relative flex-1 min-h-0">
              <canvas ref={glRef} className="absolute inset-0 w-full h-full block" />
              <canvas ref={overlayRef} className="absolute inset-0 w-full h-full block" />
            </div>
            <canvas ref={laneRef} className="h-5 w-full block border-t border-gray-200" />
            <canvas ref={waveformRef} className="h-24 w-full block border-t border-gray-200" />

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
        {labelTarget && snap && (
          <LabelEditor
            title={labelTarget === "selection" ? `Label for ${snap.selection.length} selected box(es)` : "Label for new boxes"}
            initial={labelTarget === "selection" ? snap.selection[0]?.label ?? "" : snap.activeLabel}
            suggestions={snap.labels}
            onApply={applyLabel}
            onClose={() => setLabelTarget(null)}
          />
        )}
      </div>

      <StatusBar snap={snap} onEditLabel={() => setLabelTarget("selection")} />
    </div>
  );
};

/** Last-chance save when the tab closes (a keepalive request survives page unload). */
function saveOnUnload(recordingId: number, boxes: ApiBoxPayload[]): void {
  const token = localStorage.getItem("token");
  const base = process.env.REACT_APP_API_URL || "";
  void fetch(`${base}${annotationUrl(recordingId)}`, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ recording_id: recordingId, bounding_boxes: boxes }),
  });
}

const LoadingOverlay: React.FC<{ state: LoadState }> = ({ state }) => (
  <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-10">
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

export default AnnotationEditorV2;
