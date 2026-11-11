import { DB_MAX, DB_MIN } from "./db";
import { TILE_COLS } from "./tiles";

export interface DbLevels {
  floor: number; // dB mapped to "silence" colour
  ceil: number; // dB mapped to "loudest" colour
}

/**
 * "standard": contrast from the loudest calls, the same depth in every recording.
 * "custom": noise floor and maximum set by hand for the open recording.
 */
export type ContrastMode = "standard" | "custom";
export const DEFAULT_RANGE_DB = 50;
/** How many of the loudest overview columns stand for "the loudest calls". */
const LOUDEST_SHARE = 0.05;
const MIN_LOUDEST_COLUMNS = 3;

const byteToDb = (b: number): number => DB_MIN + (b / 255) * (DB_MAX - DB_MIN);

/**
 * Standardised levels: the ceiling is the level of the loudest calls in the
 * whole recording, the floor a fixed `rangeDb` below it. A syllable and its tail
 * then fade out at the same depth below the loudest calls in every recording,
 * however loud or noisy the recording is.
 *
 * `overview` is the whole recording as one max-pooled tile (bins × TILE_COLS).
 * Each column's loudest bin (from `minBin` up, so rumble below the frequency
 * floor is ignored) is one sample; the ceiling is the median of the loudest 5 %
 * of them (at least 3), so a single click cannot set it.
 */
export function standardLevels(
  overview: Uint8Array,
  bins: number,
  minBin: number,
  rangeDb: number,
): DbLevels | null {
  const first = Math.min(bins - 1, Math.max(1, minBin)); // skip the DC bin
  const peaks: number[] = [];
  for (let c = 0; c < TILE_COLS; c++) {
    let peak = 0;
    for (let k = first; k < bins; k++) {
      const v = overview[k * TILE_COLS + c];
      if (v > peak) peak = v;
    }
    // 0 = padding past the end of the audio.
    if (peak > 0) peaks.push(peak);
  }
  if (peaks.length === 0) return null;

  peaks.sort((a, b) => b - a);
  const top = Math.min(
    peaks.length,
    Math.max(MIN_LOUDEST_COLUMNS, Math.ceil(peaks.length * LOUDEST_SHARE)),
  );
  const ceil = Math.round(byteToDb(peaks[Math.floor((top - 1) / 2)]));
  return { floor: Math.max(DB_MIN, ceil - rangeDb), ceil };
}
