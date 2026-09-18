/**
 * Sample-accurate playback on top of Web Audio.
 *
 * The playhead position is derived from the audio clock (AudioContext.currentTime
 * minus output latency), never from timers or React state, so the drawn cursor
 * matches what is actually heard.
 *
 * playbackRate also lowers pitch — useful for listening to fast bird trills.
 */
export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  /** Playing range; with `loop` it repeats [rangeStart, rangeEnd). */
  private rangeStart = 0;
  private rangeEnd = 0;
  private loop = false;
  /** Audio position at `anchorCtxTime` — re-anchored on every rate change. */
  private anchorPos = 0;
  private anchorCtxTime = 0;
  private rate = 1;
  /** Position used when not playing (where playback will start). */
  private cursor = 0;

  onStateChange: (() => void) | null = null;

  constructor(private readonly buffer: AudioBuffer) {}

  get isPlaying(): boolean {
    return this.source !== null;
  }

  get playbackRate(): number {
    return this.rate;
  }

  /** Current position in seconds (the audible one while playing). */
  get position(): number {
    if (!this.source || !this.ctx) return this.cursor;
    const latency = this.ctx.outputLatency || this.ctx.baseLatency || 0;
    const elapsed = Math.max(0, this.ctx.currentTime - this.anchorCtxTime - latency) * this.rate;
    if (this.loop) {
      const span = this.rangeEnd - this.rangeStart;
      return this.rangeStart + ((this.anchorPos - this.rangeStart + elapsed) % span);
    }
    return Math.min(this.rangeEnd, this.anchorPos + elapsed);
  }

  /**
   * Move the cursor. While playing, playback continues from `time`: inside a
   * running loop the loop is kept, anywhere else it plays on to the end.
   */
  seek(time: number): void {
    const t = Math.min(this.buffer.duration, Math.max(0, time));
    if (!this.isPlaying) {
      this.cursor = t;
      this.onStateChange?.();
    } else if (this.loop && t >= this.rangeStart && t < this.rangeEnd) {
      this.play(this.rangeStart, this.rangeEnd, true, t);
    } else {
      this.play(t);
    }
  }

  /**
   * Play [start, end), beginning at `from` (defaults to `start`).
   * With `loop`, the range repeats until stopped.
   */
  play(start = this.cursor, end = this.buffer.duration, loop = false, from = start): void {
    this.stopSource();
    const s = clamp(start, 0, this.buffer.duration);
    const e = clamp(end, s, this.buffer.duration);
    const f = clamp(from, s, e);
    if (e - s < 0.001 || (!loop && e - f < 0.001)) {
      this.cursor = s;
      this.onStateChange?.();
      return;
    }

    const ctx = this.ensureContext();
    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = this.rate;
    source.connect(ctx.destination);
    if (loop) {
      source.loop = true;
      source.loopStart = s;
      source.loopEnd = e;
      source.start(0, f);
    } else {
      source.start(0, f, e - f);
    }
    source.onended = () => {
      if (this.source !== source) return;
      this.source = null;
      this.cursor = s; // return to where playback started, like most audio editors
      this.onStateChange?.();
    };

    this.source = source;
    this.rangeStart = s;
    this.rangeEnd = e;
    this.loop = loop;
    this.anchorPos = f;
    this.anchorCtxTime = ctx.currentTime;
    this.cursor = s;
    this.onStateChange?.();
  }

  /** Stop and leave the cursor where playback started. */
  stop(): void {
    if (!this.isPlaying) return;
    this.stopSource();
    this.onStateChange?.();
  }

  /** Stop and leave the cursor at the current audible position. */
  pause(): void {
    if (!this.isPlaying) return;
    const pos = this.position;
    this.stopSource();
    this.cursor = pos;
    this.onStateChange?.();
  }

  setPlaybackRate(rate: number): void {
    if (this.source && this.ctx) {
      // Re-anchor so the position stays continuous across the rate change.
      this.anchorPos = this.position;
      this.anchorCtxTime = this.ctx.currentTime;
      this.source.playbackRate.value = rate;
    }
    this.rate = rate;
    this.onStateChange?.();
  }

  destroy(): void {
    this.stopSource();
    void this.ctx?.close();
    this.ctx = null;
  }

  private stopSource(): void {
    if (!this.source) return;
    const source = this.source;
    this.source = null;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // already stopped
    }
    source.disconnect();
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext({ latencyHint: "interactive" });
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
