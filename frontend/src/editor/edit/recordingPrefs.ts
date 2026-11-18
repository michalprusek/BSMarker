/**
 * Editor view settings, stored per user on the server: the user's defaults
 * and how they last viewed each recording.
 */

import api from "../../services/api";
import { storageKey } from "../../utils/storage";
import type { EditorSettings, EditorSnapshot } from "../EditorEngine";
import type { ContrastMode, DbLevels } from "../dsp/levels";
import type { FftSize } from "../dsp/tiles";
import type { PaletteName } from "../render/palettes";

/** Mirrors backend app/schemas/editor_settings.py. */
export interface EditorDefaults {
  palette?: PaletteName | null;
  range_db?: number | null;
}

export interface RecordingViewSettings {
  /** Only set when chosen in this recording; otherwise the default applies. */
  palette?: PaletteName | null;
  fft_size?: FftSize | null;
  contrast?: ContrastMode | null;
  /** Hand-set levels (custom contrast). */
  levels?: DbLevels | null;
  freq_floor?: number | null;
}

const defaultsUrl = "/editor-settings/defaults";
const recordingUrl = (id: number) => `/editor-settings/recordings/${id}`;

/**
 * Settings never block opening a recording: on failure the editor uses its
 * defaults (null here), and nothing is saved over what the server has.
 */
async function getOrNull<T>(url: string): Promise<T | null> {
  try {
    return (await api.get<T>(url)).data;
  } catch (error) {
    console.warn(`Could not load editor settings (${url}):`, error);
    return null;
  }
}

export async function loadViewSettings(recordingId: number): Promise<{
  defaults: EditorDefaults | null;
  recording: RecordingViewSettings | null;
}> {
  const [defaults, recording] = await Promise.all([
    getOrNull<EditorDefaults>(defaultsUrl),
    getOrNull<RecordingViewSettings>(recordingUrl(recordingId)),
  ]);
  return { defaults, recording };
}

/** What the engine starts with: the recording's own settings, else the user's defaults. */
export function initialEngineSettings(
  defaults: EditorDefaults = {},
  recording: RecordingViewSettings = {},
): Partial<EditorSettings> {
  const settings: Partial<EditorSettings> = {
    defaultPalette: defaults.palette ?? null,
  };
  const palette = recording.palette ?? defaults.palette;
  if (palette) settings.palette = palette;
  if (recording.fft_size) settings.fftSize = recording.fft_size;
  if (recording.contrast) settings.contrast = recording.contrast;
  if (recording.contrast === "custom" && recording.levels)
    settings.levels = recording.levels;
  if (defaults.range_db != null) settings.rangeDb = defaults.range_db;
  return settings;
}

/** The frequency floor used to live in this browser only; read it once to carry it over. */
export function legacyFreqFloor(recordingId: number): number | null {
  try {
    const raw = localStorage.getItem(
      storageKey(`bsmarker:freq-floor:${recordingId}`),
    );
    const hz = raw === null ? NaN : Number(raw);
    return Number.isFinite(hz) ? hz : null;
  } catch {
    return null;
  }
}

const SAVE_DELAY_MS = 800;

/**
 * Watches the engine and saves what changed, debounced so dragging a slider
 * sends one request. Call `destroy` when leaving the recording: it sends
 * whatever is still waiting.
 */
export class ViewSettingsSaver {
  private palette: PaletteName | null;
  private lastRecording: string;
  private lastDefaults: string;
  private recordingTimer: ReturnType<typeof setTimeout> | null = null;
  private defaultsTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPaletteSeen: PaletteName;

  /** `recording` / `defaults` are null when loading them failed; those are then not saved. */
  constructor(
    private readonly recordingId: number,
    private readonly recording: RecordingViewSettings | null,
    private readonly defaults: EditorDefaults | null,
    snapshot: EditorSnapshot,
    freqFloor: number | null,
    levelsByHand: boolean,
  ) {
    this.palette = recording?.palette ?? null;
    this.lastPaletteSeen = snapshot.settings.palette;
    this.lastRecording = JSON.stringify(
      this.recordingSettings(snapshot, freqFloor, levelsByHand),
    );
    this.lastDefaults = JSON.stringify(this.defaultsSettings(snapshot));
    // A floor carried over from the browser is not on the server yet.
    if (recording && !("freq_floor" in recording) && freqFloor !== null)
      this.recordingTimer = setTimeout(
        () => this.sendRecording(),
        SAVE_DELAY_MS,
      );
  }

  update(
    snapshot: EditorSnapshot,
    freqFloor: number | null,
    levelsByHand: boolean,
  ): void {
    const { palette, defaultPalette } = snapshot.settings;
    if (palette !== this.lastPaletteSeen) {
      // Chosen here, so this recording keeps it even if the default changes;
      // the default itself is not pinned, so it keeps following the default.
      this.lastPaletteSeen = palette;
      this.palette = palette === defaultPalette ? null : palette;
    }

    const recording = JSON.stringify(
      this.recordingSettings(snapshot, freqFloor, levelsByHand),
    );
    if (recording !== this.lastRecording) {
      this.lastRecording = recording;
      if (this.recordingTimer) clearTimeout(this.recordingTimer);
      this.recordingTimer = setTimeout(
        () => this.sendRecording(),
        SAVE_DELAY_MS,
      );
    }

    const defaults = JSON.stringify(this.defaultsSettings(snapshot));
    if (defaults !== this.lastDefaults) {
      this.lastDefaults = defaults;
      if (this.defaultsTimer) clearTimeout(this.defaultsTimer);
      this.defaultsTimer = setTimeout(() => this.sendDefaults(), SAVE_DELAY_MS);
    }
  }

  destroy(): void {
    if (this.recordingTimer) this.sendRecording();
    if (this.defaultsTimer) this.sendDefaults();
  }

  private recordingSettings(
    snapshot: EditorSnapshot,
    freqFloor: number | null,
    levelsByHand: boolean,
  ): RecordingViewSettings {
    const { fftSize, contrast, levels } = snapshot.settings;
    return {
      palette: this.palette,
      fft_size: fftSize,
      contrast,
      levels: contrast === "custom" && levelsByHand ? levels : null,
      freq_floor: freqFloor === null ? null : Math.round(freqFloor),
    };
  }

  private defaultsSettings(snapshot: EditorSnapshot): EditorDefaults {
    const { defaultPalette, rangeDb } = snapshot.settings;
    return { palette: defaultPalette, range_db: rangeDb };
  }

  private sendRecording(): void {
    if (this.recordingTimer) clearTimeout(this.recordingTimer);
    this.recordingTimer = null;
    if (!this.recording) return;
    const body = this.lastRecording;
    api
      .put(recordingUrl(this.recordingId), JSON.parse(body))
      .catch((error) =>
        console.warn("Could not save the recording's view settings:", error),
      );
  }

  private sendDefaults(): void {
    if (this.defaultsTimer) clearTimeout(this.defaultsTimer);
    this.defaultsTimer = null;
    if (!this.defaults) return;
    api
      .put(defaultsUrl, JSON.parse(this.lastDefaults))
      .catch((error) =>
        console.warn("Could not save your editor defaults:", error),
      );
  }
}
