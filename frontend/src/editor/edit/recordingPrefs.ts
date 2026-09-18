/**
 * Per-recording view preferences kept in this browser (not in the database).
 */

const floorKey = (recordingId: number) => `bsmarker:freq-floor:${recordingId}`;

export function readFreqFloor(recordingId: number): number | null {
  try {
    const raw = localStorage.getItem(floorKey(recordingId));
    const hz = raw === null ? NaN : Number(raw);
    return Number.isFinite(hz) ? hz : null;
  } catch {
    return null;
  }
}

export function writeFreqFloor(recordingId: number, hz: number | null): void {
  try {
    if (hz === null) localStorage.removeItem(floorKey(recordingId));
    else localStorage.setItem(floorKey(recordingId), String(Math.round(hz)));
  } catch {
    // storage unavailable — the floor just won't be remembered
  }
}
