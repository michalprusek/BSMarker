import { AnnotationDocument } from "../edit/AnnotationDocument";
import { ReviewHost, ReviewSession } from "../review/ReviewSession";
import { box } from "../testFixtures";

function makeHost(doc: AnnotationDocument) {
  const listeners = new Set<() => void>();
  const host = {
    doc,
    duration: 100,
    playing: false,
    plays: [] as [number, number][],
    focused: [] as [number, number][],
    play(start: number, end: number) {
      this.plays.push([start, end]);
      this.playing = true;
      listeners.forEach((l) => l());
    },
    stop() {
      this.playing = false;
      listeners.forEach((l) => l());
    },
    finishPlayback() {
      this.stop();
    },
    isPlaying() {
      return this.playing;
    },
    focus(start: number, end: number) {
      this.focused.push([start, end]);
    },
    onPlaybackChange(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return host as typeof host & ReviewHost;
}

describe("ReviewSession", () => {
  const boxes = [box("a", 1, 2), box("b", 3, 4, null, null, "B"), box("c", 5, 6)];

  it("steps through boxes, playing each with context, and selects it", () => {
    const doc = new AnnotationDocument(boxes);
    const host = makeHost(doc);
    const review = new ReviewSession(host);
    review.start(doc.boxes);
    expect(review.getState()).toMatchObject({ active: true, index: 0, total: 3 });
    expect(host.plays[0]).toEqual([0.85, 2.15]);
    expect(Array.from(doc.selectedIds)).toEqual(["a"]);
    review.next();
    expect(review.getState().current?.id).toBe("b");
    review.previous();
    expect(review.getState().current?.id).toBe("a");
    review.replay();
    expect(host.plays).toHaveLength(4);
  });

  it("skips boxes deleted during the review and summarises the changes", () => {
    const doc = new AnnotationDocument(boxes);
    const review = new ReviewSession(makeHost(doc));
    review.start(doc.boxes);
    doc.setLabel(["a"], "Z"); // relabel the current box
    doc.remove(["b"]);
    review.next();
    expect(review.getState().current?.id).toBe("c");
    review.next();
    expect(review.getState()).toMatchObject({ active: false, summary: { reviewed: 3, changed: 1, deleted: 1 } });
  });

  it("advances automatically only after the box has actually played", () => {
    jest.useFakeTimers();
    const doc = new AnnotationDocument(boxes);
    const host = makeHost(doc);
    const review = new ReviewSession(host);
    review.setAutoAdvance(true);
    review.start(doc.boxes);
    host.finishPlayback();
    jest.advanceTimersByTime(700);
    expect(review.getState().current?.id).toBe("b");
    // Ending the review stops everything; no further advancing.
    review.end();
    jest.advanceTimersByTime(5000);
    expect(review.getState().active).toBe(false);
    jest.useRealTimers();
  });
});
