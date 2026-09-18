import { TileId, poolChildren, tileKey } from "./tiles";
import type { WorkerRequest, WorkerResponse } from "./spectrogram.worker";

export interface ReadyTile {
  tile: TileId;
  key: string;
  data: Uint8Array;
  bins: number;
}

/** Each worker holds its own copy of the PCM; cap the total memory spent on copies. */
const PCM_COPIES_BUDGET_BYTES = 320 * 1024 * 1024;
const MAX_WORKERS = 4;
/** CPU-side copies of tile data kept for building coarser levels. */
const TILE_DATA_BUDGET_BYTES = 96 * 1024 * 1024;
/** Give up on a tile after this many failed attempts. */
const MAX_ATTEMPTS = 2;
/** How many levels down we look for finer tiles to build a coarser one from. */
const MAX_COMPOSE_DEPTH = 3;

interface StoredTile {
  data: Uint8Array;
  bins: number;
}

const poolSize = (pcmBytes: number): number => {
  const cores = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
  const byMemory = Math.floor(PCM_COPIES_BUDGET_BYTES / Math.max(1, pcmBytes));
  return Math.max(1, Math.min(MAX_WORKERS, cores, byMemory));
};

interface Slot {
  worker: Worker;
  busyKey: string | null;
  dead: boolean;
}

/**
 * Produces spectrogram tiles, either by pooling already known finer tiles
 * (instant) or by running the STFT on a small worker pool.
 *
 * The caller replaces the whole wish-list on every view change (`request`);
 * tiles that are no longer wanted are dropped before they start, so fast
 * zooming/panning never builds up a backlog.
 */
export class TileScheduler {
  private readonly slots: Slot[] = [];
  private wanted: TileId[] = [];
  private readonly inFlight = new Map<string, TileId>();
  private readonly attempts = new Map<string, number>();
  private readonly failed = new Set<string>();
  /** Recent tile data, oldest evicted first (Map keeps insertion order). */
  private readonly store = new Map<string, StoredTile>();
  private storeBytes = 0;

  onFatalError: ((message: string) => void) | null = null;

  constructor(
    pcm: Float32Array,
    private readonly isCached: (key: string) => boolean,
    private readonly onTile: (tile: ReadyTile) => void,
  ) {
    const size = poolSize(pcm.byteLength);
    for (let i = 0; i < size; i++) {
      const worker = new Worker(new URL("./spectrogram.worker.ts", import.meta.url));
      const slot: Slot = { worker, busyKey: null, dead: false };
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handleResponse(slot, event.data);
      // Script failed to load or crashed outside a tile computation.
      worker.onerror = (event) => this.killSlot(slot, event.message || "worker failed to start");
      worker.onmessageerror = () => this.killSlot(slot, "worker message could not be decoded");
      // Structured clone gives each worker its own copy of the samples.
      worker.postMessage({ type: "init", pcm } as WorkerRequest);
      this.slots.push(slot);
    }
  }

  get workerCount(): number {
    return this.slots.filter((s) => !s.dead).length;
  }

  /** Number of wanted tiles not yet delivered (for a loading indicator). */
  get pendingCount(): number {
    return this.wanted.filter((t) => this.isNeeded(tileKey(t))).length;
  }

  /** Replace the wish-list; `tiles` must be ordered by priority (most important first). */
  request(tiles: TileId[]): void {
    this.wanted = [];
    for (const tile of tiles) {
      const key = tileKey(tile);
      if (!this.isNeeded(key)) continue;
      if (!this.tryCompose(tile, key)) this.wanted.push(tile);
    }
    this.pump();
  }

  destroy(): void {
    this.slots.forEach((s) => s.worker.terminate());
    this.slots.length = 0;
    this.wanted = [];
    this.inFlight.clear();
    this.store.clear();
  }

  private isNeeded(key: string): boolean {
    return !this.isCached(key) && !this.failed.has(key);
  }

  /** Deliver a tile built from finer tiles already in memory, if possible. */
  private tryCompose(tile: TileId, key: string): boolean {
    const composed = this.compose(tile, MAX_COMPOSE_DEPTH);
    if (!composed) return false;
    this.onTile({ tile, key, data: composed.data, bins: composed.bins });
    return true;
  }

  /**
   * A level-L tile (L ≥ 1) is the pairwise max of its children 2i and 2i+1
   * at level L−1; missing children are composed recursively up to `depth`.
   */
  private compose(tile: TileId, depth: number): StoredTile | null {
    const hit = this.store.get(tileKey(tile));
    if (hit) return hit;
    if (tile.level < 1 || depth === 0) return null;
    const childLevel = tile.level - 1;
    const left = this.compose({ ...tile, level: childLevel, index: 2 * tile.index }, depth - 1);
    if (!left) return null;
    const right = this.compose({ ...tile, level: childLevel, index: 2 * tile.index + 1 }, depth - 1);
    if (!right) return null;

    const composed = { data: poolChildren(left.data, right.data, left.bins), bins: left.bins };
    this.remember(tileKey(tile), composed.data, composed.bins);
    return composed;
  }

  private remember(key: string, data: Uint8Array, bins: number): void {
    const old = this.store.get(key);
    if (old) {
      this.store.delete(key);
      this.storeBytes -= old.data.byteLength;
    }
    this.store.set(key, { data, bins });
    this.storeBytes += data.byteLength;
    const it = this.store.keys();
    while (this.storeBytes > TILE_DATA_BUDGET_BYTES) {
      const oldest = it.next().value as string;
      this.storeBytes -= this.store.get(oldest)!.data.byteLength;
      this.store.delete(oldest);
    }
  }

  private handleResponse(slot: Slot, msg: WorkerResponse): void {
    const tile = this.inFlight.get(msg.key);
    this.release(slot);
    if (msg.type === "error") {
      console.error(`Spectrogram tile ${msg.key} failed: ${msg.message}`);
      const attempts = (this.attempts.get(msg.key) ?? 0) + 1;
      this.attempts.set(msg.key, attempts);
      if (attempts >= MAX_ATTEMPTS) this.failed.add(msg.key);
    } else if (tile) {
      this.remember(msg.key, msg.data, msg.bins);
      this.onTile({ tile, key: msg.key, data: msg.data, bins: msg.bins });
    }
    this.pump();
  }

  private killSlot(slot: Slot, message: string): void {
    console.error(`Spectrogram worker error: ${message}`);
    this.release(slot);
    slot.dead = true;
    slot.worker.terminate();
    if (this.slots.every((s) => s.dead)) {
      this.onFatalError?.(`Spectrogram computation is unavailable (${message}).`);
    } else {
      this.pump();
    }
  }

  private release(slot: Slot): void {
    if (slot.busyKey) this.inFlight.delete(slot.busyKey);
    slot.busyKey = null;
  }

  private pump(): void {
    for (const slot of this.slots) {
      if (slot.busyKey || slot.dead) continue;
      const next = this.wanted.find((t) => {
        const key = tileKey(t);
        return !this.inFlight.has(key) && this.isNeeded(key);
      });
      if (!next) return;

      const key = tileKey(next);
      slot.busyKey = key;
      this.inFlight.set(key, next);
      const msg: WorkerRequest = { type: "tile", key, ...next };
      slot.worker.postMessage(msg);
    }
  }
}
