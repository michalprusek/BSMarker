/**
 * Preview of a gesture in progress: a box being drawn, or a selection
 * rectangle. fLow/fHigh null = spans the full frequency range.
 */
export interface Draft {
  kind: "box" | "marquee";
  start: number;
  end: number;
  fLow: number | null;
  fHigh: number | null;
}
