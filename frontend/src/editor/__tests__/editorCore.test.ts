import { Viewport } from "../core/Viewport";
import { BoxIndex } from "../core/boxes";
import { box } from "../testFixtures";
import { TileComputer } from "../dsp/stft";
import { DB_MAX, DB_MIN } from "../dsp/db";
import { TILE_COLS, poolChildren, chooseLevel, hopForLevel, maxLevel, minLevel, tileIndexRange, tileTimeRange } from "../dsp/tiles";
import { WaveformPeaks } from "../dsp/WaveformPeaks";
import { autoLevels } from "../dsp/levels";
import { formatTime, niceStep } from "../render/ticks";
import { AudioPlayer } from "../audio/AudioPlayer";

const SR = 48000;

const sine = (freq: number, seconds: number, amplitude = 1): Float32Array => {
  const pcm = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < pcm.length; i++) pcm[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SR);
  return pcm;
};

const byteToDb = (b: number) => DB_MIN + (b / 255) * (DB_MAX - DB_MIN);

describe("Viewport", () => {
  const make = () => {
    const v = new Viewport(60, SR);
    v.setSize(1000, 400);
    v.fitAll();
    return v;
  };

  it("fits the whole recording and round-trips coordinates", () => {
    const v = make();
    expect(v.t0).toBe(0);
    expect(v.t1).toBeCloseTo(60);
    expect(v.xToTime(v.timeToX(12.345))).toBeCloseTo(12.345, 9);
    expect(v.yToFreq(v.freqToY(3210))).toBeCloseTo(3210, 6);
    expect(v.freqToY(0)).toBeCloseTo(400);
    expect(v.freqToY(SR / 2)).toBeCloseTo(0);
  });

  it("keeps the time under the cursor fixed while zooming", () => {
    const v = make();
    const before = v.xToTime(300);
    v.zoomTimeAt(300, 8);
    expect(v.xToTime(300)).toBeCloseTo(before, 9);
    expect(v.visibleDuration).toBeCloseTo(60 / 8);
  });

  it("clamps zoom and panning to the recording", () => {
    const v = make();
    v.zoomTimeAt(0, 1 / 10);
    expect(v.visibleDuration).toBeCloseTo(60);
    v.zoomTimeAt(500, 1e9);
    expect(v.pxPerSec).toBe(v.maxPxPerSec);
    v.panByPx(-1e9);
    expect(v.t0).toBe(0);
    v.panByPx(1e12);
    expect(v.t1).toBeCloseTo(60, 6);
  });

  it("zooms frequency around the cursor and stays within 0..Nyquist", () => {
    const v = make();
    const f = v.yToFreq(100);
    v.zoomFreqAt(100, 4);
    expect(v.yToFreq(100)).toBeCloseTo(f, 6);
    expect(v.f1 - v.f0).toBeCloseTo(SR / 2 / 4, 6);
    v.panByPx(0, -1e9);
    expect(v.f1).toBeCloseTo(SR / 2);
  });
});

describe("tiles", () => {
  it("chooses a level with at least one column per device pixel", () => {
    const total = 60 * SR;
    for (const pxPerSec of [16, 100, 1000, 20000]) {
      const level = chooseLevel(1024, SR, pxPerSec, 2, total);
      const hop = hopForLevel(1024, level);
      const clamped = level === maxLevel(1024, total) || level === minLevel(1024);
      expect(clamped || hop <= SR / (pxPerSec * 2)).toBe(true);
    }
  });

  it("covers the requested time range", () => {
    const [first, last] = tileIndexRange(1024, 0, SR, 60 * SR, 10, 20);
    expect(tileTimeRange({ fftSize: 1024, level: 0, index: first }, SR)[0]).toBeLessThanOrEqual(10);
    expect(tileTimeRange({ fftSize: 1024, level: 0, index: last }, SR)[1]).toBeGreaterThanOrEqual(20);
  });
});

describe("TileComputer", () => {
  it("puts a sine at the right frequency with ~0 dBFS", () => {
    const fft = 1024;
    const computer = new TileComputer(sine(3000, 2), fft);
    const tile = computer.computeTile(0, 0);
    const col = 100;
    let peakBin = 0;
    for (let b = 0; b < computer.bins; b++) {
      if (tile[b * TILE_COLS + col] > tile[peakBin * TILE_COLS + col]) peakBin = b;
    }
    expect(Math.abs(peakBin * (SR / fft) - 3000)).toBeLessThan(SR / fft);
    expect(byteToDb(tile[peakBin * TILE_COLS + col])).toBeGreaterThan(-3);
  });

  it("does not lose a short click when zoomed out (max-pooling)", () => {
    const pcm = new Float32Array(SR * 30);
    const clickAt = 17.3 * SR;
    for (let i = 0; i < 480; i++) pcm[clickAt + i] = Math.sin((2 * Math.PI * 5000 * i) / SR); // 10 ms tone
    const computer = new TileComputer(pcm, 1024);
    const level = 6; // one column ≈ 0.34 s, far longer than the click
    const colSeconds = hopForLevel(1024, level) / SR;
    const col = Math.floor(17.3 / colSeconds) % TILE_COLS;
    const index = Math.floor(17.3 / colSeconds / TILE_COLS);
    const tile = computer.computeTile(level, index);
    const bin = Math.round(5000 / (SR / 1024));
    expect(byteToDb(tile[bin * TILE_COLS + col])).toBeGreaterThan(-20);
  });
});

describe("WaveformPeaks", () => {
  it("returns the true min/max at any zoom", () => {
    const pcm = sine(50, 1, 0.5);
    pcm[12345] = 0.9;
    const peaks = new WaveformPeaks(pcm);
    for (const spp of [1, 10, 100, 5000]) {
      const n = Math.ceil(pcm.length / spp);
      const min = new Float32Array(n);
      const max = new Float32Array(n);
      peaks.envelope(0, spp, min, max);
      expect(Math.max(...Array.from(max))).toBeCloseTo(0.9, 5);
      expect(Math.min(...Array.from(min))).toBeCloseTo(-0.5, 2);
    }
  });
});

describe("BoxIndex", () => {
  it("finds boxes overlapping a range, including long ones starting earlier", () => {
    const index = new BoxIndex([box("long", 0, 50), box("a", 10, 11), box("b", 20, 21), box("c", 30, 31)]);
    const found: string[] = [];
    index.forEachInRange(19.5, 20.5, (b) => found.push(b.id));
    expect(found).toEqual(["long", "b"]);
  });
});

describe("helpers", () => {
  it("picks 1-2-5 tick steps", () => {
    expect(niceStep(100, 80)).toBe(1);
    expect(niceStep(1000, 80)).toBe(0.1);
    expect(niceStep(10, 80)).toBe(10);
    expect(niceStep(30, 80)).toBe(5);
  });

  it("formats times", () => {
    expect(formatTime(1.25, 0.01)).toBe("1.25s");
    expect(formatTime(75.5, 0.1)).toBe("1:15.5");
  });

  it("sets the floor at the noise level", () => {
    const tile = new Uint8Array(1000).fill(100);
    tile.fill(200, 0, 5);
    const levels = autoLevels([tile]);
    expect(levels.floor).toBeCloseTo(byteToDb(100), 0);
    expect(levels.ceil).toBeGreaterThanOrEqual(levels.floor + 30);
  });
});

describe("tile pyramid", () => {
  it("pooling two child tiles equals computing the parent directly", () => {
    const pcm = new Float32Array(SR * 20);
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin(i * 0.013) * Math.sin(i * 0.00007) + (Math.random() - 0.5) * 0.01;
    const computer = new TileComputer(pcm, 512);
    for (const level of [1, 2, 3]) {
      const parent = computer.computeTile(level, 1);
      const pooled = poolChildren(computer.computeTile(level - 1, 2), computer.computeTile(level - 1, 3), computer.bins);
      expect(Buffer.from(pooled).equals(Buffer.from(parent))).toBe(true);
    }
  });
});

describe("AudioPlayer", () => {
  class FakeSource {
    buffer: unknown = null; loop = false; loopStart = 0; loopEnd = 0;
    playbackRate = { value: 1 };
    onended: (() => void) | null = null;
    started: number[] = [];
    connect() {} disconnect() {} stop() {}
    start(_when: number, offset: number) { this.started.push(offset); }
  }
  class FakeContext {
    static last: FakeContext;
    currentTime = 0; outputLatency = 0; baseLatency = 0; state = "running";
    destination = {};
    sources: FakeSource[] = [];
    constructor() { FakeContext.last = this; }
    createBufferSource() { const s = new FakeSource(); this.sources.push(s); return s; }
    createBuffer() { return { copyToChannel() {} }; }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  const make = () => {
    (global as any).AudioContext = FakeContext;
    const buffer = { duration: 10, numberOfChannels: 1, length: 10, sampleRate: 1, getChannelData: () => new Float32Array(10) };
    return new AudioPlayer(buffer as unknown as AudioBuffer);
  };

  it("keeps the loop range across a playback-rate change", () => {
    const player = make();
    player.play(1, 3, true);
    const ctx = FakeContext.last;
    ctx.currentTime = 1.5; // at 2.5 s
    expect(player.position).toBeCloseTo(2.5);
    player.setPlaybackRate(0.25);
    ctx.currentTime = 1.5 + 4; // 1 s of audio at quarter speed → 3.5 → wraps to 1.5
    expect(player.position).toBeCloseTo(1.5);
  });

  it("seeking inside a loop keeps the loop; outside plays on", () => {
    const player = make();
    player.play(1, 3, true);
    player.seek(2);
    const ctx = FakeContext.last;
    expect(ctx.sources[ctx.sources.length - 1].loop).toBe(true);
    expect(ctx.sources[ctx.sources.length - 1].started).toEqual([2]);
    player.seek(7);
    expect(ctx.sources[ctx.sources.length - 1].loop).toBe(false);
    expect(player.isPlaying).toBe(true);
    expect(player.position).toBeCloseTo(7);
  });

  it("waits for a suspended context before starting (Safari plays silence otherwise)", async () => {
    const player = make();
    player.play(0, 1); // creates the context
    const ctx = FakeContext.last;
    ctx.state = "suspended";
    let resolveResume: () => void = () => undefined;
    ctx.resume = () => new Promise<void>((r) => { resolveResume = () => { ctx.state = "running"; r(); }; });
    const started = ctx.sources.length;
    player.play(2, 3);
    expect(ctx.sources.length).toBe(started); // nothing started yet
    resolveResume();
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.sources.length).toBe(started + 1);
    expect(ctx.sources[ctx.sources.length - 1].started).toEqual([2]);
  });

  it("an empty range just moves the cursor", () => {
    const player = make();
    const changes: boolean[] = [];
    player.onStateChange = () => changes.push(player.isPlaying);
    player.play(10, 10);
    expect(player.isPlaying).toBe(false);
    expect(player.position).toBe(10);
    expect(changes).toEqual([false]);
  });
});
