import { Viewport } from "../core/Viewport";
import { BoxIndex, colorIndexForLabel, toApiBoxes } from "../core/boxes";
import { AnnotationDocument } from "../edit/AnnotationDocument";
import { Autosaver, SaveStatus } from "../edit/Autosaver";
import { EditActions, moveBoxes } from "../edit/EditActions";
import { detectConflicts, fixAllGaps, fixGap } from "../edit/conflicts";
import { hitTest, snapTime } from "../edit/geometry";
import { letterOf, zoomKey } from "../input/EditorInput";
import { box } from "../testFixtures";

const SR = 48000;

describe("AnnotationDocument", () => {
  it("adds with the active label, selects the new box, and undoes/redoes", () => {
    const doc = new AnnotationDocument([box("1", 1, 2)]);
    doc.setActiveLabel("C");
    const id = doc.add({ start: 3, end: 4, fLow: 1000, fHigh: 2000 });
    expect(doc.boxes.map((b) => b.label)).toEqual(["A", "C"]);
    expect(Array.from(doc.selectedIds)).toEqual([id]);
    expect(doc.isDirty).toBe(true);
    doc.undo();
    expect(doc.boxes).toHaveLength(1);
    expect(doc.isDirty).toBe(false); // back to the loaded state
    expect(doc.selectedIds.size).toBe(0); // selection of a vanished box is dropped
    doc.redo();
    expect(doc.boxes).toHaveLength(2);
  });

  it("records a whole drag as one undo step and can cancel it", () => {
    const doc = new AnnotationDocument([box("1", 1, 2)]);
    doc.begin();
    for (let i = 1; i <= 10; i++) doc.update(["1"], (b) => ({ ...b, start: 1 + i * 0.1, end: 2 + i * 0.1 }));
    doc.commit();
    expect(doc.boxes[0].start).toBeCloseTo(2);
    doc.undo();
    expect(doc.boxes[0].start).toBe(1);
    expect(doc.canUndo).toBe(false);

    doc.begin();
    doc.update(["1"], (b) => ({ ...b, start: 5, end: 6 }));
    doc.cancel();
    expect(doc.boxes[0].start).toBe(1);
    expect(doc.canUndo).toBe(false);
  });

  it("does not create undo steps for no-op edits", () => {
    const doc = new AnnotationDocument([box("1", 1, 2, null, null, "B")]);
    doc.setLabel(["1"], "B");
    expect(doc.canUndo).toBe(false);
    doc.setLabel(["1"], "D");
    expect(doc.boxes[0].label).toBe("D");
    expect(doc.activeLabel).toBe("D"); // relabelling also picks the label for new boxes
  });

  it("keeps boxes sorted by start time", () => {
    const doc = new AnnotationDocument([box("1", 5, 6), box("2", 1, 2)]);
    doc.add({ start: 3, end: 4, fLow: null, fHigh: null });
    expect(doc.boxes.map((b) => b.start)).toEqual([1, 3, 5]);
  });
});

describe("Autosaver", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const flushPromises = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };

  it("saves once after edits settle and reports status", async () => {
    const doc = new AnnotationDocument([]);
    const saves: number[] = [];
    const statuses: SaveStatus[] = [];
    const saver = new Autosaver(doc, async (boxes) => { saves.push(boxes.length); }, (s) => statuses.push(s));
    doc.add({ start: 1, end: 2, fLow: null, fHigh: null });
    doc.add({ start: 3, end: 4, fLow: null, fHigh: null });
    expect(saves).toEqual([]);
    jest.advanceTimersByTime(1600);
    await flushPromises();
    expect(saves).toEqual([2]);
    expect(doc.isDirty).toBe(false);
    expect(statuses).toEqual(["unsaved", "saving", "saved"]);
    void saver.detach();
  });

  it("does not save in the middle of a drag, only after it", async () => {
    const doc = new AnnotationDocument([box("1", 1, 2)]);
    const save = jest.fn(async () => undefined);
    const saver = new Autosaver(doc, save, () => undefined);
    doc.begin();
    doc.update(["1"], (b) => ({ ...b, start: 1.5 }));
    jest.advanceTimersByTime(5000);
    expect(save).not.toHaveBeenCalled();
    doc.commit();
    jest.advanceTimersByTime(1600);
    await flushPromises();
    expect(save).toHaveBeenCalledTimes(1);
    void saver.detach();
  });

  it("retries after a failure", async () => {
    const doc = new AnnotationDocument([]);
    let fail = true;
    const statuses: SaveStatus[] = [];
    const save = jest.fn(async () => {
      if (fail) throw new Error("offline");
    });
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const saver = new Autosaver(doc, save, (s) => statuses.push(s));
    doc.add({ start: 1, end: 2, fLow: null, fHigh: null });
    jest.advanceTimersByTime(1600);
    await flushPromises();
    expect(statuses[statuses.length - 1]).toBe("error");
    fail = false;
    jest.advanceTimersByTime(2100);
    await flushPromises();
    expect(save).toHaveBeenCalledTimes(2);
    expect(statuses[statuses.length - 1]).toBe("saved");
    spy.mockRestore();
    void saver.detach();
  });
});

describe("Autosaver safety", () => {
  it("never sends two saves at once, even with several waiting callers", async () => {
    const doc = new AnnotationDocument([]);
    let running = 0;
    let maxRunning = 0;
    const release: (() => void)[] = [];
    const save = jest.fn(() => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      return new Promise<void>((resolve) => release.push(() => { running--; resolve(); }));
    });
    const saver = new Autosaver(doc, save, () => undefined);
    doc.add({ start: 1, end: 2, fLow: null, fHigh: null });
    const first = saver.flush();
    doc.add({ start: 3, end: 4, fLow: null, fHigh: null });
    const waiters = [saver.flush(), saver.flush(), saver.flush()];
    while (release.length === 0) await Promise.resolve();
    release.shift()!();
    for (let i = 0; i < 20 && release.length === 0; i++) await Promise.resolve();
    release.shift()?.();
    await Promise.all([first, ...waiters]);
    expect(maxRunning).toBe(1);
    expect(save).toHaveBeenCalledTimes(2);
    expect(doc.isDirty).toBe(false);
    void saver.detach();
  });

  it("saves the committed state, never a drag in progress", async () => {
    const doc = new AnnotationDocument([box("1", 1, 2)]);
    doc.add({ start: 5, end: 6, fLow: null, fHigh: null });
    const saved: number[][] = [];
    const saver = new Autosaver(doc, async (boxes) => { saved.push(boxes.map((b) => b.start)); }, () => undefined);
    doc.begin();
    doc.update(["1"], (b) => ({ ...b, start: 3, end: 4 }));
    await saver.flush(); // e.g. leaving the page mid-drag
    expect(saved).toEqual([[1, 5]]);
    doc.cancel();
    void saver.detach();
  });

  it("keeps retrying after the editor is closed", async () => {
    jest.useFakeTimers();
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const doc = new AnnotationDocument([]);
    let attempts = 0;
    const saver = new Autosaver(doc, async () => {
      attempts++;
      if (attempts < 3) throw new Error("502");
    }, () => undefined);
    doc.add({ start: 1, end: 2, fLow: null, fHigh: null });
    const result = saver.detach();
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      jest.advanceTimersByTime(6000);
      for (let j = 0; j < 10; j++) await Promise.resolve();
    }
    await expect(result).resolves.toBe(true);
    expect(attempts).toBe(3);
    spy.mockRestore();
    jest.useRealTimers();
  });
});

describe("geometry", () => {
  const view = new Viewport(10, SR);
  view.setSize(1000, 500);
  view.fitAll(); // 100 px per second, 48 Hz per px

  it("finds edges, corners and bodies; selected boxes win", () => {
    const b = box("b", 2, 4, 4800, 9600); // x 200–400, y 400–300
    const index = new BoxIndex([b]);
    const none = new Set<string>();
    expect(hitTest(view, index, none, 300, 350, false)).toMatchObject({ kind: "body" });
    expect(hitTest(view, index, none, 201, 350, false)).toMatchObject({ kind: "handle", handle: "w" });
    expect(hitTest(view, index, none, 399, 350, false)).toMatchObject({ kind: "handle", handle: "e" });
    expect(hitTest(view, index, none, 399, 301, false)).toMatchObject({ kind: "handle", handle: "ne" });
    expect(hitTest(view, index, none, 300, 399, false)).toMatchObject({ kind: "handle", handle: "s" });
    expect(hitTest(view, index, none, 300, 100, false)).toBeNull();
    // In the lane only time matters: any y hits, and there are no n/s handles.
    expect(hitTest(view, index, none, 300, 5, true)).toMatchObject({ kind: "body" });

    const inner = box("inner", 2.5, 3, 5000, 6000);
    const nested = new BoxIndex([b, inner]);
    expect(hitTest(view, nested, none, 270, 380, false)?.box.id).toBe("inner"); // smaller wins
    expect(hitTest(view, nested, new Set(["b"]), 270, 380, false)?.box.id).toBe("b"); // selected wins
  });

  it("snaps next to other boxes, leaving the minimum gap", () => {
    const index = new BoxIndex([box("a", 1, 2), box("b", 5, 6)]);
    // A start edge near a's end lands 12 ms after it; an end edge near b's start 12 ms before it.
    expect(snapTime(view, index, 2.04, new Set(), "start")).toEqual({ time: 2.012, guide: 2 });
    expect(snapTime(view, index, 4.97, new Set(), "end")).toEqual({ time: 4.988, guide: 5 });
    // An end edge is never snapped onto the far side of a neighbour's end.
    expect(snapTime(view, index, 2.04, new Set(), "end").guide).toBeNull();
    expect(snapTime(view, index, 2.2, new Set()).guide).toBeNull();
    expect(snapTime(view, index, 2.04, new Set(["a"])).guide).toBeNull();
  });
});

describe("editing actions", () => {
  it("moves a group without leaving the recording and keeps time segments full-height", () => {
    const moved = moveBoxes([box("a", 1, 2, 1000, 2000), box("s", 3, 4)], -5, 30000, 10, 24000);
    expect(moved.get("a")).toMatchObject({ start: 0, end: 1, fLow: 23000, fHigh: 24000 });
    expect(moved.get("s")).toMatchObject({ start: 2, end: 3, fLow: null, fHigh: null });
  });

  it("never moves boxes along an axis the user is not moving (old out-of-range data)", () => {
    // Existing data has boxes ending after the recording and below 0 Hz.
    const odd = [box("late", 8, 12, 1000, 2000), box("low", 1, 2, -50, 500)];
    const up = moveBoxes(odd, 0, 100, 10, 24000);
    expect(up.get("late")).toMatchObject({ start: 8, end: 12, fLow: 1100 });
    const left = moveBoxes(odd, -0.5, 0, 10, 24000);
    expect(left.get("low")).toMatchObject({ start: 0.5, fLow: -50, fHigh: 500 });
  });

  it("duplicates right after the selection and pastes at a time", () => {
    const doc = new AnnotationDocument([box("a", 1, 2), box("b", 2.5, 3)]);
    const actions = new EditActions(doc, 100, 24000);
    doc.select(["a", "b"]);
    actions.duplicate();
    expect(doc.boxes.map((b) => [b.start, b.end])).toEqual([[1, 2], [2.5, 3], [3, 4], [4.5, 5]]);
    actions.copy();
    actions.paste(10);
    expect(doc.selection.map((b) => b.start)).toEqual([10, 11.5]);
  });

  it("gives letters stable colours", () => {
    expect(colorIndexForLabel("None")).toBe(0);
    expect(colorIndexForLabel("A")).toBe(1);
    expect(colorIndexForLabel("J")).toBe(1); // 9 colours cycle
    expect(colorIndexForLabel("B")).not.toBe(colorIndexForLabel("A"));
  });

  it("serialises time/frequency as authoritative and keeps passthrough fields", () => {
    const [p] = toApiBoxes([{ ...box("a", 2, 4, 1000, 3000), confidence: 0, extraMetadata: { k: 1 } }], 10, 24000);
    expect(p).toMatchObject({
      start_time: 2, end_time: 4, min_frequency: 1000, max_frequency: 3000,
      label: "A", confidence: 0, extra_metadata: { k: 1 }, x: 200, width: 200,
    });
    const [segment] = toApiBoxes([box("s", 2, 4)], 10, 24000);
    expect(segment).toMatchObject({ min_frequency: null, max_frequency: null, y: 0, height: 400 });
  });
});

describe("keyboard layouts", () => {
  const key = (key: string, code: string) => ({ key, code } as KeyboardEvent);

  it("uses the typed letter, so Czech QWERTZ Z/Y are right", () => {
    // On QWERTZ the key labelled Z sits where US has Y (code KeyY).
    expect(letterOf(key("z", "KeyY"))).toBe("Z");
    expect(letterOf(key("y", "KeyZ"))).toBe("Y");
    // Non-Latin layouts fall back to the physical key.
    expect(letterOf(key("я", "KeyZ"))).toBe("Z");
    // Czech number row (ě, š, …) is not a label.
    expect(letterOf(key("ě", "Digit2"))).toBeNull();
  });

  it("recognises zoom keys by character", () => {
    expect(zoomKey(key("+", "Digit1"))).toBe(1); // Czech: + on the 1 key
    expect(zoomKey(key("=", "Minus"))).toBe(1);
    expect(zoomKey(key("-", "Slash"))).toBe(-1); // Czech: - next to the dot
    expect(zoomKey(key("é", "Digit0"))).toBe(0);
  });
});

describe("conflicts", () => {
  const kinds = (boxes: ReturnType<typeof box>[]) =>
    detectConflicts(boxes).map((c) => (c.kind === "gap" ? `gap:${c.a.id}-${c.b.id}` : `nested:${c.inner.id}<${c.outer.id}`));

  it("finds overlaps, too-small gaps and nested boxes on the time axis", () => {
    expect(kinds([box("a", 1, 2), box("b", 2.02, 3)])).toEqual([]); // 20 ms gap is fine
    expect(kinds([box("a", 1, 2), box("b", 2.005, 3)])).toEqual(["gap:a-b"]); // 5 ms
    expect(kinds([box("a", 1, 2), box("b", 1.5, 3)])).toEqual(["gap:a-b"]); // overlap
    expect(kinds([box("a", 1, 3), box("b", 1.5, 2)])).toEqual(["nested:b<a"]);
    // Frequency does not matter — it's about the time axis.
    expect(kinds([box("a", 1, 2, 1000, 2000), box("b", 1.5, 3, 8000, 9000)])).toEqual(["gap:a-b"]);
    // Same length: the lower box (higher minimum frequency) counts as nested, like the classic editor.
    expect(kinds([box("hi", 1, 2, 1000, 2000), box("lo", 1, 2, 5000, 6000)])).toEqual(["nested:lo<hi"]);
  });

  it("fixes a gap by moving both edges to the midpoint, leaving 12 ms", () => {
    const doc = new AnnotationDocument([box("a", 1, 2), box("b", 1.9, 3)]);
    const [c] = detectConflicts(doc.boxes);
    expect(c.kind).toBe("gap");
    expect(fixGap(doc, c as Extract<typeof c, { kind: "gap" }>)).toBe(true);
    const [a, b] = doc.boxes;
    expect(a.end).toBeCloseTo(1.944, 9);
    expect(b.start).toBeCloseTo(1.956, 9);
    expect(detectConflicts(doc.boxes)).toEqual([]);
  });

  it("fixes all gaps in one undo step and leaves nested boxes to the user", () => {
    const doc = new AnnotationDocument([box("a", 1, 2), box("b", 1.99, 3), box("c", 3.001, 4), box("x", 5, 8), box("in", 6, 7)]);
    const { fixed, remaining } = fixAllGaps(doc);
    expect(fixed).toBe(2);
    expect(remaining).toBe(1); // the nested box
    expect(doc.boxes).toHaveLength(5);
    doc.undo();
    expect(detectConflicts(doc.boxes)).toHaveLength(3);
  });
});
