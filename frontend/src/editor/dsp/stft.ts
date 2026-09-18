import FFT from "fft.js";
import { TILE_COLS, baseHop, hopForLevel } from "./tiles";
import { DB_MAX, DB_MIN } from "./db";

const DB_TO_BYTE = 255 / (DB_MAX - DB_MIN);
const LN_TO_DB = 10 / Math.LN10;

/**
 * Computes spectrogram tiles for one recording and one FFT size.
 * Allocation-free in the hot loop; one instance per worker per FFT size.
 */
export class TileComputer {
  readonly bins: number;
  private readonly fft: FFT;
  private readonly window: Float64Array;
  private readonly frameBuf: Float64Array;
  private readonly spectrum: number[];
  /** Power normalisation so a full-scale sine peaks at 0 dBFS. */
  private readonly powerScale: number;

  constructor(
    private readonly pcm: Float32Array,
    readonly fftSize: number,
  ) {
    this.bins = fftSize / 2;
    this.fft = new FFT(fftSize);
    this.frameBuf = new Float64Array(fftSize);
    this.spectrum = this.fft.createComplexArray();

    // Periodic Hann window
    this.window = new Float64Array(fftSize);
    let sum = 0;
    for (let i = 0; i < fftSize; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / fftSize);
      this.window[i] = w;
      sum += w;
    }
    const ampScale = 2 / sum;
    this.powerScale = ampScale * ampScale;
  }

  /**
   * Returns a row-major (bins × TILE_COLS) byte array: row = frequency bin
   * (row 0 = 0 Hz), column = time. Columns past the end of the audio stay 0.
   */
  computeTile(level: number, index: number): Uint8Array {
    const out = new Uint8Array(this.bins * TILE_COLS);
    const firstCol = index * TILE_COLS;

    if (level <= 0) {
      const hop = hopForLevel(this.fftSize, level);
      for (let c = 0; c < TILE_COLS; c++) {
        const center = (firstCol + c) * hop + hop / 2;
        if (center >= this.pcm.length) break;
        this.writeFrame(Math.round(center), out, c, false);
      }
    } else {
      // Max-pool 2^level base frames into each column.
      const hop = baseHop(this.fftSize);
      const pool = Math.pow(2, level);
      for (let c = 0; c < TILE_COLS; c++) {
        const firstFrame = (firstCol + c) * pool;
        for (let j = 0; j < pool; j++) {
          const center = (firstFrame + j) * hop + hop / 2;
          if (center >= this.pcm.length) break;
          this.writeFrame(center, out, c, true);
        }
      }
    }
    return out;
  }

  private writeFrame(center: number, out: Uint8Array, col: number, maxPool: boolean): void {
    const { pcm, window, frameBuf, fftSize } = this;
    const start = center - fftSize / 2;

    if (start >= 0 && start + fftSize <= pcm.length) {
      for (let i = 0; i < fftSize; i++) frameBuf[i] = pcm[start + i] * window[i];
    } else {
      // Zero-pad at the recording edges.
      for (let i = 0; i < fftSize; i++) {
        const s = start + i;
        frameBuf[i] = s >= 0 && s < pcm.length ? pcm[s] * window[i] : 0;
      }
    }

    this.fft.realTransform(this.spectrum, frameBuf);

    const spec = this.spectrum;
    const scale = this.powerScale;
    for (let k = 0; k < this.bins; k++) {
      const re = spec[2 * k];
      const im = spec[2 * k + 1];
      const power = (re * re + im * im) * scale;
      let q = (Math.log(power + 1e-30) * LN_TO_DB - DB_MIN) * DB_TO_BYTE;
      q = q < 0 ? 0 : q > 255 ? 255 : q;
      const idx = k * TILE_COLS + col;
      if (!maxPool || q > out[idx]) out[idx] = q;
    }
  }
}
