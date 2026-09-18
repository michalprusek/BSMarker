/* eslint-disable no-restricted-globals */
import { TileComputer } from "./stft";

export type WorkerRequest =
  | { type: "init"; pcm: Float32Array }
  | { type: "tile"; key: string; fftSize: number; level: number; index: number };

export type WorkerResponse =
  | { type: "tile"; key: string; data: Uint8Array; bins: number }
  | { type: "error"; key: string; message: string };

const ctx = self as unknown as Worker;

let pcm: Float32Array | null = null;
const computers = new Map<number, TileComputer>();

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === "init") {
    pcm = msg.pcm;
    computers.clear();
    return;
  }
  if (!pcm) return;

  try {
    let computer = computers.get(msg.fftSize);
    if (!computer) {
      computer = new TileComputer(pcm, msg.fftSize);
      computers.set(msg.fftSize, computer);
    }
    const data = computer.computeTile(msg.level, msg.index);
    const response: WorkerResponse = { type: "tile", key: msg.key, data, bins: computer.bins };
    ctx.postMessage(response, [data.buffer]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.postMessage({ type: "error", key: msg.key, message } as WorkerResponse);
  }
};

export {};
