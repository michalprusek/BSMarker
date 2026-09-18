import { EditorBox } from "../core/boxes";
import { AnnotationDocument } from "./AnnotationDocument";

/**
 * Time-axis rules for syllable annotations (frequency is ignored): once the
 * boxes are flattened onto the time axis, nothing may overlap and
 * neighbouring boxes must be at least MIN_GAP apart.
 */
export const MIN_GAP = 0.01; // s
/** Gap left by fixes and by snapping — a little more than MIN_GAP, safe from rounding. */
export const FIX_GAP = 0.012; // s
/** A fix must never shrink a box below this. */
const MIN_BOX = 0.001; // s

export type Conflict =
  /** `a` ends less than MIN_GAP before `b` starts (or they overlap). [start, end] is the problem area. */
  | { kind: "gap"; a: EditorBox; b: EditorBox; start: number; end: number }
  /** `inner` lies completely inside `outer` in time. */
  | { kind: "nested"; inner: EditorBox; outer: EditorBox; start: number; end: number };

/** All conflicts, ordered by time. `boxes` must be sorted by start (as in AnnotationDocument). */
export function detectConflicts(boxes: EditorBox[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const nested = new Set<string>();

  // Nesting: an earlier-starting box that ends no earlier contains this one.
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    for (let j = 0; j < boxes.length; j++) {
      if (i === j) continue;
      const other = boxes[j];
      if (other.start > box.start) break;
      if (other.end < box.end || nested.has(other.id)) continue;
      const inner = pickInner(box, other);
      if (inner !== box) continue; // handled when visiting `other`
      nested.add(box.id);
      conflicts.push({ kind: "nested", inner: box, outer: other, start: box.start, end: box.end });
      break;
    }
  }

  // Gaps: sweep over boxes that are still "close" to the current one.
  const active: EditorBox[] = [];
  for (const current of boxes) {
    for (let k = active.length - 1; k >= 0; k--) {
      if (active[k].end + MIN_GAP <= current.start) active.splice(k, 1);
    }
    for (const prev of active) {
      // Nested pairs are reported above; here only boxes that stick out.
      if (current.end > prev.end && current.start - prev.end < MIN_GAP) {
        const start = Math.min(prev.end, current.start);
        const end = Math.max(prev.end, current.start);
        conflicts.push({ kind: "gap", a: prev, b: current, start, end });
      }
    }
    active.push(current);
  }

  return conflicts.sort((x, y) => x.start - y.start);
}

/** Of two boxes where one contains the other, which is the inner one (same rule as the classic editor). */
function pickInner(x: EditorBox, y: EditorBox): EditorBox | null {
  const xInY = x.start >= y.start && x.end <= y.end;
  const yInX = y.start >= x.start && y.end <= x.end;
  if (!xInY && !yInX) return null;
  const lx = x.end - x.start;
  const ly = y.end - y.start;
  if (lx !== ly) return lx < ly ? x : y;
  // Equal length: the lower one (higher minimum frequency) counts as nested.
  return (x.fLow ?? 0) >= (y.fLow ?? 0) ? x : y;
}

/** Ids of all boxes involved in a conflict. */
export function conflictedIds(conflicts: Conflict[]): Set<string> {
  const ids = new Set<string>();
  for (const c of conflicts) {
    if (c.kind === "gap") {
      ids.add(c.a.id);
      ids.add(c.b.id);
    } else {
      ids.add(c.inner.id);
      ids.add(c.outer.id);
    }
  }
  return ids;
}

/**
 * Fix a gap conflict: move both inner edges to the midpoint ± FIX_GAP/2.
 * Returns false (and changes nothing) if a box would become too short.
 */
export function fixGap(doc: AnnotationDocument, c: Extract<Conflict, { kind: "gap" }>): boolean {
  const mid = (c.a.end + c.b.start) / 2;
  const aEnd = mid - FIX_GAP / 2;
  const bStart = mid + FIX_GAP / 2;
  if (aEnd - c.a.start < MIN_BOX || c.b.end - bStart < MIN_BOX) return false;
  doc.update([c.a.id, c.b.id], (box) => (box.id === c.a.id ? { ...box, end: aEnd } : { ...box, start: bStart }));
  return true;
}

/**
 * Fix every gap conflict in one undo step. Nested boxes are left for the
 * user to decide. Returns how many gaps were fixed and what remains.
 */
export function fixAllGaps(doc: AnnotationDocument): { fixed: number; remaining: number } {
  let fixed = 0;
  doc.begin();
  // Fixing one gap can change its neighbours; re-detect until stable.
  for (let round = 0; round < 10; round++) {
    const gaps = detectConflicts(doc.boxes).filter((c): c is Extract<Conflict, { kind: "gap" }> => c.kind === "gap");
    let progress = false;
    for (const gap of gaps) {
      const a = doc.boxes.find((b) => b.id === gap.a.id);
      const b = doc.boxes.find((x) => x.id === gap.b.id);
      if (!a || !b || b.start - a.end >= MIN_GAP) continue; // already fixed by an earlier step
      if (fixGap(doc, { ...gap, a, b })) {
        fixed++;
        progress = true;
      }
    }
    if (!progress) break;
  }
  doc.commit();
  return { fixed, remaining: detectConflicts(doc.boxes).length };
}
