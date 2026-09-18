/** Samples per bucket at the finest peak level. Below this we read raw samples. */
const BASE_BUCKET = 32;

interface PeakLevel {
  bucket: number; // samples per bucket
  min: Float32Array;
  max: Float32Array;
}

/**
 * Min/max envelope pyramid (bucket sizes 32, 64, 128, … samples) so the
 * waveform can be drawn at any zoom by reading ≤ 2 buckets per pixel.
 */
export class WaveformPeaks {
  private readonly levels: PeakLevel[] = [];
  /** Largest absolute sample value, for normalising the display. */
  readonly peak: number;

  constructor(private readonly pcm: Float32Array) {
    let level = this.buildBase();
    this.levels.push(level);
    while (level.min.length > 1) {
      level = this.downsample(level);
      this.levels.push(level);
    }
    let peak = 0;
    for (let i = 0; i < this.levels[0].min.length; i++) {
      peak = Math.max(peak, -this.levels[0].min[i], this.levels[0].max[i]);
    }
    this.peak = peak || 1;
  }

  /**
   * Fills `outMin`/`outMax` (one entry per pixel) for the sample range
   * starting at `startSample` with `samplesPerPx` samples per pixel.
   */
  envelope(startSample: number, samplesPerPx: number, outMin: Float32Array, outMax: Float32Array): void {
    const n = outMin.length;
    const total = this.pcm.length;

    if (samplesPerPx < BASE_BUCKET) {
      for (let x = 0; x < n; x++) {
        const s0 = Math.max(0, Math.floor(startSample + x * samplesPerPx));
        const s1 = Math.min(total, Math.max(s0 + 1, Math.floor(startSample + (x + 1) * samplesPerPx)));
        let lo = Infinity;
        let hi = -Infinity;
        for (let s = s0; s < s1; s++) {
          const v = this.pcm[s];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        outMin[x] = lo === Infinity ? 0 : lo;
        outMax[x] = hi === -Infinity ? 0 : hi;
      }
      return;
    }

    const levelIdx = Math.min(
      this.levels.length - 1,
      Math.floor(Math.log2(samplesPerPx / BASE_BUCKET)),
    );
    const { bucket, min, max } = this.levels[levelIdx];
    for (let x = 0; x < n; x++) {
      const b0 = Math.max(0, Math.floor((startSample + x * samplesPerPx) / bucket));
      const b1 = Math.min(min.length, Math.max(b0 + 1, Math.floor((startSample + (x + 1) * samplesPerPx) / bucket)));
      let lo = Infinity;
      let hi = -Infinity;
      for (let b = b0; b < b1; b++) {
        if (min[b] < lo) lo = min[b];
        if (max[b] > hi) hi = max[b];
      }
      outMin[x] = lo === Infinity ? 0 : lo;
      outMax[x] = hi === -Infinity ? 0 : hi;
    }
  }

  private buildBase(): PeakLevel {
    const count = Math.ceil(this.pcm.length / BASE_BUCKET);
    const min = new Float32Array(count);
    const max = new Float32Array(count);
    for (let b = 0; b < count; b++) {
      let lo = Infinity;
      let hi = -Infinity;
      const end = Math.min(this.pcm.length, (b + 1) * BASE_BUCKET);
      for (let s = b * BASE_BUCKET; s < end; s++) {
        const v = this.pcm[s];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      min[b] = lo;
      max[b] = hi;
    }
    return { bucket: BASE_BUCKET, min, max };
  }

  private downsample(prev: PeakLevel): PeakLevel {
    const count = Math.ceil(prev.min.length / 2);
    const min = new Float32Array(count);
    const max = new Float32Array(count);
    for (let b = 0; b < count; b++) {
      const i = 2 * b;
      const j = Math.min(prev.min.length - 1, i + 1);
      min[b] = Math.min(prev.min[i], prev.min[j]);
      max[b] = Math.max(prev.max[i], prev.max[j]);
    }
    return { bucket: prev.bucket * 2, min, max };
  }
}
