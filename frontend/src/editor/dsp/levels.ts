import { DB_MAX, DB_MIN } from "./db";

export interface DbLevels {
  floor: number; // dB mapped to "silence" colour
  ceil: number; // dB mapped to "loudest" colour
}

const MIN_RANGE_DB = 30;

const byteToDb = (b: number): number => DB_MIN + (b / 255) * (DB_MAX - DB_MIN);

/**
 * Picks display levels from spectrogram tiles: the median (≈ background noise
 * of a field recording) becomes the floor, so noise is drawn white and
 * vocalisations stand out; the 99.9th percentile becomes the ceiling.
 */
export function autoLevels(tiles: Uint8Array[]): DbLevels {
  const histogram = new Float64Array(256);
  let total = 0;
  for (const tile of tiles) {
    for (let i = 0; i < tile.length; i++) {
      // 0 = below DB_MIN, i.e. padding past the end of the audio — not signal.
      if (tile[i] > 0) {
        histogram[tile[i]]++;
        total++;
      }
    }
  }
  if (total === 0) return { floor: -100, ceil: -20 };

  const percentile = (p: number): number => {
    const target = total * p;
    let acc = 0;
    for (let b = 0; b < 256; b++) {
      acc += histogram[b];
      if (acc >= target) return byteToDb(b);
    }
    return DB_MAX;
  };

  const floor = percentile(0.5);
  const ceil = Math.max(percentile(0.999), floor + MIN_RANGE_DB);
  return { floor: Math.round(floor), ceil: Math.round(ceil) };
}
