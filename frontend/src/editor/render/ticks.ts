/**
 * "Nice" tick spacing (1-2-5 series) so that ticks are at least `minPx` apart.
 * `pxPerUnit` is how many pixels one unit (second or Hz) occupies.
 */
export function niceStep(pxPerUnit: number, minPx: number): number {
  const raw = minPx / pxPerUnit;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) {
    if (m * magnitude >= raw) return m * magnitude;
  }
  return 10 * magnitude;
}

/** Number of decimals needed to show values that are multiples of `step`. */
const decimalsFor = (step: number): number => Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));

/** Formats a time for a ruler whose ticks are `step` seconds apart. */
export function formatTime(seconds: number, step: number): string {
  const decimals = decimalsFor(step);
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(seconds);
  const minutes = Math.floor(abs / 60);
  const rest = abs - minutes * 60;
  const secText = rest.toFixed(decimals);
  if (minutes === 0) return `${sign}${secText}s`;
  const padded = rest < 10 ? `0${secText}` : secText;
  return `${sign}${minutes}:${padded}`;
}

/** Formats a frequency for an axis whose ticks are `step` Hz apart. */
export function formatFrequency(hz: number, step: number): string {
  return `${(hz / 1000).toFixed(decimalsFor(step / 1000))}k`;
}

/** Human readable duration for readouts, e.g. "12.5 ms" or "3.20 s". */
export function formatDuration(seconds: number): string {
  if (seconds < 1) return `${(seconds * 1000).toFixed(seconds < 0.01 ? 2 : 1)} ms`;
  return `${seconds.toFixed(seconds < 10 ? 3 : 2)} s`;
}
