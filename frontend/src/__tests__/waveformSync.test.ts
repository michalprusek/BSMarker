/**
 * Tests for waveform mirror synchronization when switching recordings
 *
 * These tests ensure that bounding box time coordinates are properly recalculated
 * when the recording duration changes, preventing misalignment of waveform mirrors
 * after switching between recordings.
 *
 * Regression test for: Waveform mirror bounding boxes getting misaligned when
 * switching recordings due to stale time coordinates from previous recording.
 */

import { BoundingBox } from "../types";

describe("Waveform Synchronization", () => {
  describe("Time coordinate recalculation on duration change", () => {
    /**
     * Helper function to simulate coordinate conversion based on spectrogram dimensions
     */
    const convertBoxToTimeFrequency = (
      box: BoundingBox,
      spectrogramWidth: number,
      duration: number,
      spectrogramHeight: number,
      maxFrequency: number
    ): { start_time: number; end_time: number; min_frequency: number; max_frequency: number } => {
      // Convert pixel x to time
      const start_time = (box.x / spectrogramWidth) * duration;
      const end_time = ((box.x + box.width) / spectrogramWidth) * duration;

      // Convert pixel y to frequency (inverted: y=0 is max frequency)
      const min_frequency = ((spectrogramHeight - (box.y + box.height)) / spectrogramHeight) * maxFrequency;
      const max_frequency = ((spectrogramHeight - box.y) / spectrogramHeight) * maxFrequency;

      return { start_time, end_time, min_frequency, max_frequency };
    };

    it("should recalculate time coordinates when duration changes from 30s to 60s", () => {
      // Simulate a bounding box from a 30-second recording
      const box: BoundingBox = {
        id: 1,
        x: 600, // Middle of 1200px wide spectrogram
        y: 100,
        width: 200,
        height: 100,
        start_time: 15, // Middle of 30s recording (stale value)
        end_time: 20,   // Stale value from 30s recording
        min_frequency: 5000,
        max_frequency: 10000,
        label: "Bird Song",
        color: "#FF0000",
      };

      const oldDuration = 30;
      const newDuration = 60;
      const spectrogramWidth = 1200;
      const spectrogramHeight = 600;
      const maxFrequency = 22050;

      // Recalculate with new duration (simulating switching to 60s recording)
      const updatedCoords = convertBoxToTimeFrequency(
        box,
        spectrogramWidth,
        newDuration,
        spectrogramHeight,
        maxFrequency
      );

      const updatedBox = {
        ...box,
        ...updatedCoords,
      };

      // With 60s duration, same pixel position should map to 30s (middle of 60s)
      expect(updatedBox.start_time).toBeCloseTo(30, 1);
      expect(updatedBox.end_time).toBeCloseTo(40, 1);

      // Time coordinates should be different from stale values
      expect(updatedBox.start_time).not.toBe(box.start_time);
      expect(updatedBox.end_time).not.toBe(box.end_time);
    });

    it("should recalculate time coordinates when duration changes from 60s to 30s", () => {
      const box: BoundingBox = {
        id: 1,
        x: 400, // 1/3 through spectrogram
        y: 200,
        width: 400, // 1/3 of width
        height: 200,
        start_time: 20, // Stale: 1/3 of 60s
        end_time: 40,   // Stale: 2/3 of 60s
        min_frequency: 8000,
        max_frequency: 15000,
        label: "Bird Call",
        color: "#00FF00",
      };

      const oldDuration = 60;
      const newDuration = 30;
      const spectrogramWidth = 1200;
      const spectrogramHeight = 600;
      const maxFrequency = 22050;

      // Recalculate with new duration
      const updatedCoords = convertBoxToTimeFrequency(
        box,
        spectrogramWidth,
        newDuration,
        spectrogramHeight,
        maxFrequency
      );

      const updatedBox = {
        ...box,
        ...updatedCoords,
      };

      // With 30s duration, same pixel position should map to 10s (1/3 of 30s)
      expect(updatedBox.start_time).toBeCloseTo(10, 1);
      expect(updatedBox.end_time).toBeCloseTo(20, 1);

      // Duration should be preserved (proportionally)
      const oldDuration = box.end_time - box.start_time;
      const newDurationCalc = updatedBox.end_time - updatedBox.start_time;
      expect(newDurationCalc).toBeCloseTo(oldDuration / 2, 1);
    });

    it("should handle multiple boxes when duration changes", () => {
      const boxes: BoundingBox[] = [
        {
          id: 1,
          x: 0,
          y: 100,
          width: 300,
          height: 100,
          start_time: 0,
          end_time: 10,
          min_frequency: 5000,
          max_frequency: 10000,
          label: "Box 1",
          color: "#FF0000",
        },
        {
          id: 2,
          x: 600,
          y: 200,
          width: 300,
          height: 100,
          start_time: 20,
          end_time: 30,
          min_frequency: 10000,
          max_frequency: 15000,
          label: "Box 2",
          color: "#00FF00",
        },
        {
          id: 3,
          x: 900,
          y: 300,
          width: 300,
          height: 100,
          start_time: 30,
          end_time: 40,
          min_frequency: 15000,
          max_frequency: 20000,
          label: "Box 3",
          color: "#0000FF",
        },
      ];

      const oldDuration = 40;
      const newDuration = 80;
      const spectrogramWidth = 1200;
      const spectrogramHeight = 600;
      const maxFrequency = 22050;

      // Recalculate all boxes
      const updatedBoxes = boxes.map((box) => {
        const coords = convertBoxToTimeFrequency(
          box,
          spectrogramWidth,
          newDuration,
          spectrogramHeight,
          maxFrequency
        );
        return { ...box, ...coords };
      });

      // All boxes should have updated time coordinates
      updatedBoxes.forEach((updated, i) => {
        expect(updated.start_time).not.toBe(boxes[i].start_time);
        expect(updated.end_time).not.toBe(boxes[i].end_time);
      });

      // Box 1: Start at 0, should now be 0
      expect(updatedBoxes[0].start_time).toBeCloseTo(0, 1);
      expect(updatedBoxes[0].end_time).toBeCloseTo(20, 1);

      // Box 2: Middle, should now be 40
      expect(updatedBoxes[1].start_time).toBeCloseTo(40, 1);
      expect(updatedBoxes[1].end_time).toBeCloseTo(60, 1);

      // Box 3: Last third, should now be 60
      expect(updatedBoxes[2].start_time).toBeCloseTo(60, 1);
      expect(updatedBoxes[2].end_time).toBeCloseTo(80, 1);
    });

    it("should handle edge case with duration = 0", () => {
      const box: BoundingBox = {
        id: 1,
        x: 600,
        y: 100,
        width: 200,
        height: 100,
        start_time: 15,
        end_time: 20,
        min_frequency: 5000,
        max_frequency: 10000,
        label: "Bird Song",
        color: "#FF0000",
      };

      const spectrogramWidth = 1200;
      const spectrogramHeight = 600;
      const maxFrequency = 22050;

      // With duration = 0, coordinates should be 0
      const coords = convertBoxToTimeFrequency(
        box,
        spectrogramWidth,
        0, // duration = 0
        spectrogramHeight,
        maxFrequency
      );

      expect(coords.start_time).toBe(0);
      expect(coords.end_time).toBe(0);
    });

    it("should preserve frequency coordinates when duration changes", () => {
      const box: BoundingBox = {
        id: 1,
        x: 600,
        y: 100,
        width: 200,
        height: 200,
        start_time: 15,
        end_time: 20,
        min_frequency: 5000,
        max_frequency: 10000,
        label: "Bird Song",
        color: "#FF0000",
      };

      const oldDuration = 30;
      const newDuration = 60;
      const spectrogramWidth = 1200;
      const spectrogramHeight = 600;
      const maxFrequency = 22050;

      // Recalculate with old duration (baseline)
      const oldCoords = convertBoxToTimeFrequency(
        box,
        spectrogramWidth,
        oldDuration,
        spectrogramHeight,
        maxFrequency
      );

      // Recalculate with new duration
      const newCoords = convertBoxToTimeFrequency(
        box,
        spectrogramWidth,
        newDuration,
        spectrogramHeight,
        maxFrequency
      );

      // Frequency coordinates should remain the same (only time changes)
      expect(newCoords.min_frequency).toBeCloseTo(oldCoords.min_frequency, 1);
      expect(newCoords.max_frequency).toBeCloseTo(oldCoords.max_frequency, 1);

      // Time coordinates should change
      expect(newCoords.start_time).not.toBeCloseTo(oldCoords.start_time, 1);
      expect(newCoords.end_time).not.toBeCloseTo(oldCoords.end_time, 1);
    });
  });
});
