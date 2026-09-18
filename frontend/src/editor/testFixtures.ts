import { EditorBox } from "./core/boxes";

export const box = (
  id: string,
  start: number,
  end: number,
  fLow: number | null = null,
  fHigh: number | null = null,
  label = "A",
): EditorBox => ({ id, start, end, fLow, fHigh, label, confidence: null, extraMetadata: null });
