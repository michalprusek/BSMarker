/**
 * Spectrogram tiling — like map tiles, but on the time axis only.
 *
 * A tile is TILE_COLS spectrogram columns at a given level. Level L has a hop of
 * baseHop * 2^L samples per column (baseHop = fftSize / 4, i.e. 75 % overlap):
 *   L < 0  finer than base (zoomed in)  — computed directly from PCM
 *   L = 0  base resolution
 *   L > 0  coarser (zoomed out)          — max-pooled from base columns, so short
 *                                         syllables never vanish when zoomed out
 * Every tile spans all frequency bins (0 … Nyquist); frequency zoom is done at
 * draw time by the GPU.
 */

export const TILE_COLS = 256;

/** Never compute columns closer than this many samples apart. */
const MIN_HOP = 4;

export const FFT_SIZES = [256, 512, 1024, 2048, 4096] as const;
export type FftSize = (typeof FFT_SIZES)[number];

export interface TileId {
  fftSize: number;
  level: number;
  index: number;
}

export const baseHop = (fftSize: number): number => fftSize / 4;

export const hopForLevel = (fftSize: number, level: number): number =>
  baseHop(fftSize) * Math.pow(2, level);

export const minLevel = (fftSize: number): number =>
  Math.ceil(Math.log2(MIN_HOP / baseHop(fftSize)));

/** Coarsest level: a single tile covers the whole recording. */
export const maxLevel = (fftSize: number, totalSamples: number): number => {
  const cols = totalSamples / baseHop(fftSize);
  return Math.max(0, Math.ceil(Math.log2(Math.max(1, cols / TILE_COLS))));
};

/**
 * Pick the level whose column spacing is just below one device pixel, so the
 * spectrogram is always at least as sharp as the screen.
 */
export const chooseLevel = (
  fftSize: number,
  sampleRate: number,
  pxPerSec: number,
  devicePixelRatio: number,
  totalSamples: number,
): number => {
  const samplesPerDevicePx = sampleRate / (pxPerSec * devicePixelRatio);
  const level = Math.floor(Math.log2(samplesPerDevicePx / baseHop(fftSize)));
  return Math.min(maxLevel(fftSize, totalSamples), Math.max(minLevel(fftSize), level));
};

export const tileKey = ({ fftSize, level, index }: TileId): string =>
  `${fftSize}:${level}:${index}`;

/** Time span covered by a tile, in seconds. */
export const tileTimeRange = (
  tile: TileId,
  sampleRate: number,
): [number, number] => {
  const span = (TILE_COLS * hopForLevel(tile.fftSize, tile.level)) / sampleRate;
  return [tile.index * span, (tile.index + 1) * span];
};

/** Indices of the tiles needed to cover [t0, t1] at `level`. */
export const tileIndexRange = (
  fftSize: number,
  level: number,
  sampleRate: number,
  totalSamples: number,
  t0: number,
  t1: number,
): [number, number] => {
  const samplesPerTile = TILE_COLS * hopForLevel(fftSize, level);
  const last = Math.max(0, Math.ceil(totalSamples / samplesPerTile) - 1);
  const first = Math.max(0, Math.floor((t0 * sampleRate) / samplesPerTile));
  return [Math.min(first, last), Math.min(last, Math.floor((t1 * sampleRate) / samplesPerTile))];
};

/**
 * Builds a level-L tile from its two level-(L−1) children by pairwise max:
 * the left child fills columns 0–127, the right child columns 128–255.
 */
export function poolChildren(left: Uint8Array, right: Uint8Array, bins: number): Uint8Array {
  const out = new Uint8Array(bins * TILE_COLS);
  const half = TILE_COLS / 2;
  for (let b = 0; b < bins; b++) {
    const row = b * TILE_COLS;
    for (let j = 0; j < TILE_COLS; j++) {
      const src = j < half ? left : right;
      const c = row + 2 * (j % half);
      out[row + j] = src[c] > src[c + 1] ? src[c] : src[c + 1];
    }
  }
  return out;
}
